// Teste local do motor de cálculo da família de "redução de pressão"
// (vapor saturado, vapor superaquecido, ar comprimido, água) + módulos
// migrados na 2ª rodada (Purgadores, PSV, Tanque, Bico Injetor, Sensor de
// Temperatura, Velocidade, Condensado, Resistência em Tubo).
// Rodar com: node test_reduc.mjs
import {
  computeReduc, computeReducAr, computeReducAgua, computeReducSuper,
  computePurg, computePSV, computeTanque, computeBicoInj, computeSensorTemp,
  computeVeloc, computeCondens, computeResTubo,
} from './lib/engine.js';

function dump(name, obj) {
  console.log(`\n=== ${name} ===`);
  console.log(JSON.stringify(obj, null, 2));
}

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

// 5) Purgadores: pin=10, pout=4 (dp=6), flow=500 kg/h necessários, F.S.=2
//    Confere o parser sem-eval (purgFnSafe) contra as fórmulas verbatim do
//    catálogo PURG (quadráticas, quárticas, lei de potência e a expressão
//    aninhada da BK15).
const purg = computePurg({ pin: 10, pout: 4, flow: 500, fsReq: 2 });
console.log('\n=== purg (purgadores) ===');
console.log(JSON.stringify({ dp: purg.dp, Tcond: purg.Tcond, flow: purg.flow, nModelos: purg.models.length }, null, 2));
console.assert(purg.dp === 6, 'purg: dp deveria ser pin-pout=6');
const ftv120 = purg.models.find(m => m.modelo === 'FTV 120');
const expectedFTV = -251.15 * Math.pow(6, 2) + 5079.5 * 6 + 24214; // fórmula "curva" verbatim
console.assert(Math.abs(ftv120.bitolas[0].cap - expectedFTV) < 1e-6, `purg: FTV 120 cap divergiu do purgFn original (esperado ${expectedFTV}, obtido ${ftv120.bitolas[0].cap})`);
const bk45 = purg.models.find(m => m.modelo === 'BK45'); // lei de potência: 154.2 * x**0.401
const expectedBK45 = 154.2 * Math.pow(6, 0.401);
console.assert(Math.abs(bk45.bitolas[0].cap - expectedBK45) < 1e-6, 'purg: BK45 (lei de potência) divergiu');

// 6) PSV: vapor saturado, setP=10 barg, backP=0, flow=1000 kg/h
const psv = computePSV({ media: 'Vapor Saturado', setP: 10, backP: 0, tAgua: 20, tAr: 20, flow: 1000 });
console.log('\n=== psv (válvula de segurança) ===');
console.log(JSON.stringify({ err: psv.err, errCode: psv.errCode, op: psv.op, r911len: psv.r911 && psv.r911.length, ansiLen: psv.ansi && psv.ansi.length, bronzeKeys: Object.keys(psv.bronze || {}) }, null, 2));
console.assert(psv.err === null && psv.errCode === null, 'psv: não deveria ter err');
console.assert(psv.r911.length === 13 && psv.r942.length === 3, 'psv: r911/r942 deveriam ter 13/3 linhas (DN15-DN250 + 15/20,20/25,25/32)');
console.assert(psv.ansi.length === 9, 'psv: ansi deveria ter 9 bitolas (1"x2" a 6"x10")');
console.assert('Fig. 037' in psv.bronze, 'psv: bronze Fig.037 deveria estar presente para vapor');

// 6b) PSV: caso de erro dependente de unidade (setP < 0.2 -> errCode min_setp)
const psvErr = computePSV({ media: 'Água', setP: 0.1, backP: 0, tAgua: 20, flow: 100 });
console.assert(psvErr.errCode === 'min_setp' && psvErr.errRaw === 0.2, 'psv: deveria sinalizar min_setp com errRaw=0.2');

// 7) Tanque: água, V=2 m³, T1=20->T2=80°C, aquecimento em 1h, vapor a 4 barg
const tanque = computeTanque({ cpK: 4.186, rho: 998, V: 2, T1: 20, T2: 80, th: 1, P: 4, rep: 0, xq: 1 });
dump('tanque (aquecimento de fluido)', tanque);
console.assert(tanque.invalid === false, 'tanque: não deveria ser inválido');
console.assert(Number.isFinite(tanque.dir_hu) && tanque.dir_hu > 0, 'tanque: dir_hu deveria ser finito e > 0');
console.assert(Array.isArray(tanque.injRows) && tanque.injRows.length === 3, 'tanque: injRows deveria ter os 3 injetores padrão (IN15/25/40)');

// 8) Bico injetor: Cd=0.62, D=6mm, P=3 kgf/cm², n=2 bicos
const bico = computeBicoInj({ P: 3, D: 6, cd: 0.62, n: 2 });
dump('bicoinj (vazão em bico injetor)', bico);
console.assert(bico.invalid === false, 'bicoinj: não deveria ser inválido');
console.assert(Math.abs(bico.q1 - (0.62 * 6 * 6 * Math.sqrt(3))) < 1e-9, 'bicoinj: q1 deveria bater com Cd·D²·sqrt(P)');
console.assert(Math.abs(bico.qt - 2 * bico.q1) < 1e-9, 'bicoinj: qt deveria ser n·q1');

// 9) Sensor de temperatura (RTD Pt100): informando temperatura -> resistência
const sensorTR = computeSensorTemp({ R0: 100, modo: 'TR', val: 100 });
dump('sensortemp (RTD, T->R)', sensorTR);
console.assert(sensorTR.invalid === false && sensorTR.warn === null, 'sensortemp: 100°C está dentro da faixa IEC 60751');
console.assert(Math.abs(sensorTR.R - 138.5055) < 1e-3, `sensortemp: R(100°C) deveria ser ~138.5055 Ω, obtido ${sensorTR.R}`);
// modo inverso: informando resistência -> temperatura (round-trip)
const sensorRT = computeSensorTemp({ R0: 100, modo: 'RT', val: sensorTR.R });
console.assert(Math.abs(sensorRT.T - 100) < 1e-3, `sensortemp: round-trip R->T deveria voltar a ~100°C, obtido ${sensorRT.T}`);

// 10) Velocidade em tubulação: líquido (água), 50 m³/h
const veloc = computeVeloc({ flow: 50, unit: 'm3h', rho: 1000, type: 'liq' });
dump('veloc (velocidade em tubulação)', { invalid: veloc.invalid, Qm3h: veloc.Qm3h, lo: veloc.lo, hi: veloc.hi, matrixLen: veloc.matrix && veloc.matrix.length });
console.assert(veloc.invalid === false, 'veloc: não deveria ser inválido');
console.assert(veloc.matrix.length === 19, 'veloc: matriz deveria ter 19 bitolas (1/2" a 24")');

// 11) Condensado (vapor flash): mcond=1000 kg/h, P1=6 barg -> P2=1 barg
const condens = computeCondens({ mcond: 1000, p1: 6, p2: 1 });
dump('condens (linha de condensado)', { invalid: condens.invalid, x: condens.x, mflash: condens.mflash, matrixLen: condens.matrix && condens.matrix.length });
console.assert(condens.invalid === false, 'condens: não deveria ser inválido');
console.assert(condens.x > 0 && condens.x < 1, 'condens: fração de flash deveria estar entre 0 e 1 (P1>P2)');

// 12) Resistência em tubo (ASME B31.3): P=10 kgf/cm², d=100mm, S=1000 kgf/cm², Y=0.4, E=1, C=1.2mm, enom=6mm
const restub = computeResTubo({ P: 10, d: 100, S: 1000, Y: 0.4, E: 1, C: 1.2, enom: 6 });
dump('restub (resistência em tubo)', restub);
console.assert(restub.epress != null && restub.emin != null, 'restub: epress/emin deveriam estar definidos');
console.assert(restub.mawp != null && restub.mawp > 0, 'restub: mawp deveria ser finito e > 0');
console.assert(typeof restub.ok === 'boolean', 'restub: ok deveria ser boolean (enom informado)');

console.log('\nTodos os testes (asserts) passaram sem lançar exceção.');
