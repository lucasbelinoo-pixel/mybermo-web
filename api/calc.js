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
import { requireUser, getProfileCached, AuthError } from '../lib/auth.js';

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

// Bloqueio de módulo no SERVIDOR (hardening): profiles.modules é uma
// blocklist de ids que hoje só a UI respeitava (modAllowed() em index.html
// esconde os botões, mas nada impedia uma chamada direta a /api/calc).
// Mapa: módulo do dispatcher (chave de HANDLERS acima) -> id que o CLIENTE
// usa em profiles.modules — os MESMOS ids de MENU[].go / MB_MODULE_CATALOG
// (ver index.html, const MENU / const MB_MODULE_CATALOG). Descoberto lendo,
// no cliente, cada tela (renderReduc/renderValv/renderPurg/... ou a IIFE do
// módulo) e conferindo com qual `module` ela chama /api/calc — várias telas
// disparam mais de um module do servidor (ex.: tela "purg" chama tanto
// module:'purg' quanto module:'purgcurve'; tela "flash" chama 'flash' e
// 'flashcomp' — ver comentário de PURG_MODULES/VALV_MODULES acima). Módulos
// sem entrada aqui (não deveria haver nenhum — todas as chaves de HANDLERS
// estão mapeadas) simplesmente não são bloqueáveis (fail-open, ver abaixo).
const MODULE_BLOCK_ID = {
  reduc: 'reduc',
  reducAr: 'reduc_ar',
  reducAgua: 'reduc_agua',
  reducSuper: 'reduc_super',
  geracaosuper: 'geracao_super',
  purg: 'purg',
  purgcurve: 'purg',
  psv: 'valv', // tela "Válvula de Segurança" (go:'valv') chama module:'psv'
  tanque: 'tanque',
  bicoinj: 'bicoinj',
  sensortemp: 'sensortemp',
  veloc: 'veloc',
  condens: 'condens',
  restub: 'restub',
  perdatub: 'perdatub',
  efluente: 'efluente',
  custovap: 'custovap',
  tubvapor: 'tubvapor',
  tubagua: 'tubagua',
  flash: 'flash',
  flashcomp: 'flash', // "estação complementar" do estudo de vapor flash — mesma tela
  dessuper: 'dessuper',
  steamprops: 'vapor', // botão especial "Propriedades do vapor saturado"
  unitconv: 'unidades', // botão especial "Conversão de unidades"
  matcurve: 'material', // botão especial "Curva Pressão × Temperatura por material"
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let user;
  try {
    ({ user } = await requireUser(req));
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

    // Fail-OPEN só para o bloqueio de módulo em si (perfil ausente/erro de
    // rede/tabela não derruba usuário legítimo) — a autenticação acima
    // (requireUser) continua fail-closed. Admin NUNCA é bloqueado.
    try {
      const profile = await getProfileCached(user && user.id);
      if (profile && !profile.isAdmin) {
        const blockId = MODULE_BLOCK_ID[mod];
        if (blockId && profile.modules.indexOf(blockId) >= 0) {
          res.status(403).json({ error: `Acesso a este módulo está bloqueado para o seu usuário. Fale com o administrador.` });
          return;
        }
      }
    } catch (e) {
      // nunca bloquear por falha aqui — só logamos para diagnóstico
      console.error('api/calc: falha ao checar bloqueio de módulo (fail-open)', e);
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
