// api/reduc.js
// Vercel Serverless Function (Node, ESM) — cálculo da estação redutora de pressão
// (vapor saturado). Recebe as entradas em unidades BASE (as mesmas que o cliente já
// usava internamente via uBase()) e devolve os NÚMEROS calculados; quem monta o HTML
// é o próprio index.html (renderReduc), usando os mesmos textos/format de sempre.
//
// Autenticação: por enquanto o site inteiro já está atrás de Basic Auth
// (middleware.js / SITE_PASS). Autenticação por usuário fica para depois.
import { computeReduc } from '../lib/engine.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { pin, pout, flow, sch, x, activeModels } = body;

    const pinN = Number(pin);
    const poutN = Number(pout);
    const flowN = Number(flow);

    if (!Number.isFinite(pinN) || !Number.isFinite(poutN) || !Number.isFinite(flowN)) {
      res.status(400).json({ error: 'Parâmetros inválidos: pin, pout e flow devem ser numéricos.' });
      return;
    }

    const result = computeReduc({
      pin: pinN,
      pout: poutN,
      flow: flowN,
      sch: sch || '40',
      x: x == null ? 100 : Number(x),
      activeModels: Array.isArray(activeModels) ? activeModels : null,
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err && err.message ? err.message : String(err) });
  }
}
