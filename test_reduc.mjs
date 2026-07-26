// Teste local do motor de cálculo da redução de pressão.
// Rodar com: node api/_test_reduc.mjs
import { computeReduc } from './lib/engine.js';

const out = computeReduc({ pin: 10, pout: 4, flow: 500, sch: '40', x: 100 });
console.log(JSON.stringify(out, null, 2));
