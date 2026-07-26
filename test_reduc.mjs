// Teste local do motor de cálculo da família de "redução de pressão"
// (vapor saturado, vapor superaquecido, ar comprimido, água).
// Rodar com: node test_reduc.mjs
import { computeReduc, computeReducAr, computeReducAgua, computeReducSuper } from './lib/engine.js';

function summarize(name, out) {
  console.log(`\n=== ${name} ===`);
  const { models, vel, ...rest } = out;
  console.log(JSON.stringify(rest, null, 2));
  console.log(`models: ${models.length} série(s)` + (models[0] ? ` · primeira="${models[0].modelo}" rows=${models[0].rows.length}` : ''));
  console.log(`vel: ${vel.length} bitola(s)` + (vel[0] ? ` · primeira=${JSON.stringify(vel[0])}` : ''));
}

// 1) vapor saturado (piloto — não deve ter regredido: CVp=4.7348... para estas entradas)
const reduc = computeReduc({ pin: 10, pout: 4, flow: 500, sch: '40', x: 100 });
summarize('reduc (vapor saturado)', reduc);
console.assert(reduc.err === null, 'reduc: não deveria ter err');
console.assert(Math.abs(reduc.CVp - 4.7348484848) < 1e-6, `reduc: CVp regrediu! Esperado ~4.7348, obtido ${reduc.CVp}`);

// 2) vapor superaquecido: P1=15 barg, P2=8 barg, T1=300°C (Tsat@15barg ~201°C, então é superaquecido)
const reducSuper = computeReducSuper({ pin: 15, pout: 8, flow: 4961, T1: 300, sch: '40' });
summarize('reducSuper (vapor superaquecido)', reducSuper);
console.assert(reducSuper.err === null && reducSuper.errCode === null, 'reducSuper: não deveria ter err');
console.assert(Number.isFinite(reducSuper.CVp) && reducSuper.CVp > 0, 'reducSuper: CVp deveria ser finito e > 0');
console.assert(reducSuper.Ksh >= 1, 'reducSuper: Ksh deveria ser >= 1 para vapor superaquecido');

// 2b) caso de erro: T1 abaixo da saturação -> errCode 'not_superheated'
const reducSuperErr = computeReducSuper({ pin: 15, pout: 8, flow: 4961, T1: 100, sch: '40' });
console.assert(reducSuperErr.errCode === 'not_superheated', 'reducSuper: deveria sinalizar not_superheated');

// 3) ar comprimido: P1=7 barg, P2=4 barg, Q=500 Nm3/h, T1=20°C
const reducAr = computeReducAr({ pin: 7, pout: 4, flow: 500, T1: 20, sch: '40' });
summarize('reducAr (ar comprimido)', reducAr);
console.assert(reducAr.err === null, 'reducAr: não deveria ter err');
console.assert(Number.isFinite(reducAr.W) && reducAr.W > 0, 'reducAr: W deveria ser finito e > 0');
console.assert(Number.isFinite(reducAr.rho1) && reducAr.rho1 > 0, 'reducAr: rho1 deveria ser finito e > 0');

// 4) água: P1=3 barg, P2=1 barg, T=20°C, vazão mássica 2000 kg/h
const reducAgua = computeReducAgua({ pin: 3, pout: 1, flow: 2000, T: 20, sch: '40' });
summarize('reducAgua (água)', reducAgua);
console.assert(reducAgua.err === null && reducAgua.errCode === null, 'reducAgua: não deveria ter err');
console.assert(Number.isFinite(reducAgua.CVp) && reducAgua.CVp > 0, 'reducAgua: CVp deveria ser finito e > 0');
console.assert(reducAgua.regime === 'Subcrítico' || reducAgua.regime === 'Crítico', 'reducAgua: regime inválido');

// 4b) caso de erro: T acima da saturação na entrada -> errCode 'not_liquid'
const reducAguaErr = computeReducAgua({ pin: 3, pout: 1, flow: 2000, T: 200, sch: '40' });
console.assert(reducAguaErr.errCode === 'not_liquid', 'reducAgua: deveria sinalizar not_liquid');

console.log('\nTodos os testes (asserts) passaram sem lançar exceção.');
