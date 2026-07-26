// api/calc.js
// Vercel Serverless Function (Node, ESM) — dispatcher ÚNICO para a família de
// cálculos de "redução de pressão" (vapor saturado, vapor superaquecido, ar
// comprimido, água). Consolidado num único endpoint para não estourar o limite
// de funções do plano gratuito da Vercel — cada módulo é escolhido via
// `{ module, inputs }` no corpo da requisição.
//
// Autenticação: por enquanto o site inteiro já está atrás de Basic Auth
// (middleware.js / SITE_PASS). Autenticação por usuário fica para depois.
//
// Catálogo VALV (válvulas): para os módulos que selecionam válvula (reduc,
// reducAr, reducAgua, reducSuper), o VALV é carregado do Supabase (tabela
// `catalogos`, editável pelo admin) via lib/catalogs.js, com cache de ~60s e
// fallback automático para o VALV hardcoded de lib/engine.js se a env
// SUPABASE_SERVICE_ROLE_KEY não estiver configurada ou a leitura falhar.
// PSV usa catálogos próprios (BRZ_MODELS/calcValv), não VALV — fica de fora
// desta etapa.
import {
  computeReduc,
  computeReducAr,
  computeReducAgua,
  computeReducSuper,
  computePurg,
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
  computeDessuper,
  computeSteamProps,
  computeUnitConv,
  computeMatCurve,
  VALV,
} from '../lib/engine.js';
import { loadValv } from '../lib/catalogs.js';

const HANDLERS = {
  reduc: computeReduc,
  reducAr: computeReducAr,
  reducAgua: computeReducAgua,
  reducSuper: computeReducSuper,
  purg: computePurg,
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
  dessuper: computeDessuper,
  steamprops: computeSteamProps,
  unitconv: computeUnitConv,
  matcurve: computeMatCurve,
};

// módulos cujo cálculo depende do catálogo VALV (recebem {valv} como 2º
// argumento); os demais continuam chamados com um único argumento, como antes.
const VALV_MODULES = new Set(['reduc', 'reducAr', 'reducAgua', 'reducSuper']);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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
    } else {
      result = fn(inputs || {});
    }
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err && err.message ? err.message : String(err) });
  }
}
