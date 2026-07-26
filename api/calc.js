// api/calc.js
// Vercel Serverless Function (Node, ESM) — dispatcher ÚNICO para a família de
// cálculos de "redução de pressão" (vapor saturado, vapor superaquecido, ar
// comprimido, água). Consolidado num único endpoint para não estourar o limite
// de funções do plano gratuito da Vercel — cada módulo é escolhido via
// `{ module, inputs }` no corpo da requisição.
//
// Autenticação: por enquanto o site inteiro já está atrás de Basic Auth
// (middleware.js / SITE_PASS). Autenticação por usuário fica para depois.
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
} from '../lib/engine.js';

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
};

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

    const result = fn(inputs || {});
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err && err.message ? err.message : String(err) });
  }
}
