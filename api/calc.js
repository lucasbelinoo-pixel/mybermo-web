// api/calc.js
// Vercel Serverless Function (Node, ESM) — dispatcher ÚNICO para a família de
// cálculos de "redução de pressão" (vapor saturado, vapor superaquecido, ar
// comprimido, água). Consolidado num único endpoint para não estourar o limite
// de funções do plano gratuito da Vercel — cada módulo é escolhido via
// `{ module, inputs }` no corpo da requisição.
//
// Autenticação: exige sessão Supabase válida (Authorization: Bearer
// <access_token>, ver lib/auth.js#requireUser) — substitui a antiga
// dependência exclusiva da porta Basic Auth de site inteiro (middleware.js/
// SITE_PASS), que pode ser removida da Vercel depois de validado em produção.
//
// Catálogos vindos do Supabase (tabela `catalogos`, editável pelo admin),
// carregados via lib/catalogs.js (cache ~60s + fallback automático para o
// catálogo hardcoded de lib/engine.js se a env SUPABASE_SERVICE_ROLE_KEY não
// estiver configurada ou a leitura falhar):
//  - VALV (válvulas): reduc, reducAr, reducAgua, reducSuper, flashcomp (estação
//    complementar do estudo de vapor flash — mesma válvula redutora, modelo já
//    escolhido pelo cliente).
//  - PURG (purgadores): purg, purgcurve (curva de capacidade de um
//    modelo/bitola específico, para o gráfico e a folha técnica).
// PSV usa catálogos próprios (BRZ_MODELS/calcValv), não VALV/PURG — fica de
// fora. MATDB (materiais, curva P×T) NÃO é usado por nenhum compute do
// servidor — computeMatCurve só calcula a curva auxiliar de saturação do
// vapor; a base de materiais é puro lookup no cliente — por isso NÃO há
// carregamento de 'matdb' aqui (só existe seed + edição→upsert, no
// index.html).
import {
  computeReduc,
  computeReducAr,
  computeReducAgua,
  computeReducSuper,
  computePurg,
  computePurgCurve,
  computePSV,
  computeTanque,
  computeBicoInj,
  computeSensorTemp,
  computeVeloc,
  computeCondens,
  computeResTubo,
  computePerdaTub,
  computeEfluente,
  computeCustoVap,
  computeTubVapor,
  computeTubAgua,
  computeFlash,
  computeFlashComp,
  computeDessuper,
  computeSteamProps,
  computeUnitConv,
  computeMatCurve,
  computeGeracaoSuper,
  VALV,
  PURG,
} from '../lib/engine.js';
import { loadValv, loadCatalogo } from '../lib/catalogs.js';
import { requireUser, AuthError } from '../lib/auth.js';

const HANDLERS = {
  reduc: computeReduc,
  reducAr: computeReducAr,
  reducAgua: computeReducAgua,
  reducSuper: computeReducSuper,
  purg: computePurg,
  purgcurve: computePurgCurve,
  psv: computePSV,
  tanque: computeTanque,
  bicoinj: computeBicoInj,
  sensortemp: computeSensorTemp,
  veloc: computeVeloc,
  condens: computeCondens,
  restub: computeResTubo,
  perdatub: computePerdaTub,
  efluente: computeEfluente,
  custovap: computeCustoVap,
  tubvapor: computeTubVapor,
  tubagua: computeTubAgua,
  flash: computeFlash,
  flashcomp: computeFlashComp,
  dessuper: computeDessuper,
  steamprops: computeSteamProps,
  unitconv: computeUnitConv,
  matcurve: computeMatCurve,
  geracaosuper: computeGeracaoSuper,
};

// módulos cujo cálculo depende do catálogo VALV (recebem {valv} como 2º
// argumento); os demais continuam chamados com um único argumento, como antes.
const VALV_MODULES = new Set(['reduc', 'reducAr', 'reducAgua', 'reducSuper', 'flashcomp']);

// módulos cujo cálculo depende do catálogo PURG (recebem {purg} como 2º
// argumento). Mesmo padrão do VALV, catálogo separado. 'flash' entrou aqui
// porque computeFlash agora também devolve a tabela de capacidade do
// purgador de drenagem (purgModels) para todos os modelos/bitolas, no ΔP de
// operação — ver nota em lib/engine.js#computeFlash.
const PURG_MODULES = new Set(['purg', 'purgcurve', 'flash']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await requireUser(req);
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    res.status(status).json({ error: (err && err.message) || 'não autenticado' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { module: mod, inputs } = body;

    const fn = HANDLERS[mod];
    if (!fn) {
      res.status(400).json({ error: `Módulo desconhecido: ${mod}` });
      return;
    }

    let result;
    if (VALV_MODULES.has(mod)) {
      const valv = await loadValv(VALV);
      result = fn(inputs || {}, { valv });
    } else if (PURG_MODULES.has(mod)) {
      const purg = await loadCatalogo('purg', PURG);
      result = fn(inputs || {}, { purg });
    } else {
      result = fn(inputs || {});
    }
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err && err.message ? err.message : String(err) });
  }
}
