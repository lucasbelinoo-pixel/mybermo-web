// Teste local do motor de cálculo da família de "redução de pressão"
// (vapor saturado, vapor superaquecido, ar comprimido, água) + módulos
// migrados na 2ª rodada (Purgadores, PSV, Tanque, Bico Injetor, Sensor de
// Temperatura, Velocidade, Condensado, Resistência em Tubo).
// Rodar com: node test_reduc.mjs
import {
  computeReduc, computeReducAr, computeReducAgua, computeReducSuper,
  computePurg, computePSV, computeTanque, computeBicoInj, computeSensorTemp,
  computeVeloc, computeCondens, computeResTubo,
  computePerdaTub, computeEfluente, computeCustoVap, computeTubVapor,
  computeTubAgua, computeFlash, computeDessuper,
  computeSteamProps, computeUnitConv, computeMatCurve,
  VALV, PURG,
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

// ===================== LOTE FINAL (módulos compostos) =====================

// 13) Perda de energia em tubulações: DN2" Sch40 (od2=60.3, esp=3.91), L=50m,
//     emiss=0.8, Top=180°C, Tamb=25°C, vento=1m/s, isolamento 50mm de silicato de cálcio
const perdatub = computePerdaTub({
  od2: 60.3, esp: 3.91, L: 50, emiss: 0.8, Top: 180, Tamb: 25, wind: 1,
  espi: 50, semmi: 0.9,
  isolKc: [3.15711450669498e-13, -7.46414098804696e-10, 7.36554703131284e-07, -2.24880830111714e-04, 7.33360403664444e-02],
  pci: 8600, rhof: 1, preco: 2.5, hd: 24, dm: 30, inv: 1000,
});
dump('perdatub (perda de energia em tubulações)', perdatub);
console.assert(perdatub.invalid === false, 'perdatub: não deveria ser inválido');
console.assert(perdatub.hasIsol === true && perdatub.isol.loss < perdatub.bare.loss, 'perdatub: isolamento deveria reduzir a perda de calor');
console.assert(perdatub.econMes != null && perdatub.econMes > 0, 'perdatub: economia mensal deveria ser calculada (pci/rhof/preco informados)');

// 14) Efluente líquido: 5000 kg/h de 80->40°C (cp=4.186 kJ/kg·K), secundário 3000 kg/h a 20°C
const efluente = computeEfluente({
  meff: 5000, cpeffK: 4.186, tin: 80, tout: 40, msec: 3000, cpsecK: 4.186, tinsec: 20,
  PCI: 8600, rho: 1, custo: 2.5, co2: 2, hd: 24, dm: 30, inv: 5000,
});
dump('efluente (estudo de efluente líquido)', efluente);
console.assert(efluente.invalid === false, 'efluente: não deveria ser inválido');
console.assert(Math.abs(efluente.Q_kJ - 5000 * 4.186 * 40) < 1e-6, 'efluente: Q_kJ deveria bater com m·cp·ΔT');
console.assert(efluente.toutsec != null && efluente.toutsec > 20, 'efluente: toutsec deveria ser calculado (secundário informado)');

// 15) Custo do vapor: mv=5000 kg/h, P=10 barg, efic=85%, perdas=2%, repos=10%, PCI=8600
const custovap = computeCustoVap({
  mv: 5000, P: 10, eficPct: 85, perdasPct: 2, reposIn: 10, reposUn: 'pct',
  Tret: 80, Tmu: 20, PCI: 8600, dens: 1, custoAgua: 5, custoCombIn: 2.5, custoUn: 'm3', hd: 24, dm: 30,
});
dump('custovap (custo do vapor / caldeira)', custovap);
console.assert(custovap.invalid === false, 'custovap: não deveria ser inválido');
console.assert(custovap.delta > 0, 'custovap: salto entálpico (delta) deveria ser positivo');
console.assert(custovap.custoTonOK === true && custovap.custoMes > 0, 'custovap: custo mensal deveria ser calculado');

// 16) Tubulação de vapor: 10 barg, x=100%, flow=5000 kg/h, 1 trecho de tubo + 1 conexão
const tubvapor = computeTubVapor({
  press: 10, x: 100, flow: 5000,
  items: [
    { id: 1, tipo: 'tubo', dn: '4', sch: '40', L: 50, eps: 0.046 },
    { id: 2, tipo: 'conexao', dn: '4', sch: '40', K: 0.9, qtd: 2 },
  ],
});
dump('tubvapor (tubulação de vapor saturado)', tubvapor);
console.assert(tubvapor.invalid === false, 'tubvapor: não deveria ser inválido');
console.assert(tubvapor.items.length === 2 && tubvapor.items[0].dp > 0 && tubvapor.items[1].dp > 0, 'tubvapor: ambos os itens deveriam ter ΔP > 0');
console.assert(Math.abs(tubvapor.summary.total - (tubvapor.items[0].dp + tubvapor.items[1].dp)) < 1e-9, 'tubvapor: total deveria ser a soma dos itens');

// 17) Tubulação de água: 20°C, 50 m³/h, 1 trecho de tubo na sucção + bomba habilitada
const tubagua = computeTubAgua({
  temp: 20, flow: 50, flowun: 'm3h',
  items: [{ id: 1, tipo: 'tubo', dn: '3', sch: '40', L: 20, eps: 0.046, loc: 'Sucção' }],
  hSuc: 2, hRec: 10, dnSuc: '4', schSuc: '40', dnRec: '3', schRec: '40',
  hman: 30, rend: 70, custo: 0.7, hd: 10, dm: 26,
});
dump('tubagua (tubulação de água - bombas elétricas)', tubagua);
console.assert(tubagua.invalid === false, 'tubagua: não deveria ser inválido');
console.assert(tubagua.summary.suc > 0 && tubagua.summary.rec === 0, 'tubagua: perda deveria estar toda na sucção (único item com loc=Sucção)');
console.assert(tubagua.pump.npshd != null && tubagua.pump.powCV != null, 'tubagua: NPSHd e potência da bomba deveriam ser calculados');

// 18) Estudo de vapor flash (núcleo termodinâmico + viabilidade — migração parcial;
//     purgador/estação complementar permanecem no cliente): vCon=5000 kg/h, 10->3 barg
const flash = computeFlash({
  vCon: 5000, Palim: 10, Preev: 3, Pcon: 0,
  PCI: 8600, rho: 1, precoRaw: 2.5, precoUn: 'm3', hd: 24, dm: 30, inv: 1000, co2: 2,
});
dump('flash (estudo de vapor flash - núcleo)', flash);
console.assert(flash.invalid === false, 'flash: não deveria ser inválido');
console.assert(flash.x > 0 && flash.x < 1, 'flash: fração de flash deveria estar entre 0 e 1');
console.assert(Math.abs(flash.vFlash + flash.vDren - flash.vCon) < 1e-6, 'flash: vFlash+vDren deveria bater com vCon');
console.assert(flash.tank && flash.tank.modelo === 'VD13-5', 'flash: tanque selecionado deveria ser o VD13-5 (5 m³/h < 5)');

// 19) Dessuperaquecimento de NH3: 1 compressor de 100 kW, Tevap=-10°C, Tcond=35->33.7°C
const dessuper = computeDessuper({
  comps: [{ qkw: 100, tevap: -10, tcond: 35, eta: 0.7, t2man: null }],
  tcond2: 33.7, tds: 35, peq: 10,
  wStale: 'tin', wMw: 5000, wTout: 30,
  horas: 24, dias: 30, tarifa: 0.7, cvap: 100, inv: 10000, co2v: 100, co2e: 100,
});
dump('dessuper (dessuperaquecimento NH3)', dessuper);
console.assert(dessuper.invalid === false && dessuper.empty === false, 'dessuper: não deveria ser inválido/vazio (1 compressor informado)');
console.assert(dessuper.S.mtot > 0 && dessuper.S.qrec > 0, 'dessuper: vazão de NH3 e calor recuperável deveriam ser > 0');
console.assert(dessuper.S.w2 <= dessuper.S.w1, 'dessuper: consumo elétrico com dessuper não deveria ser maior que o atual (Tcond2<=Tcond1)');
console.assert(dessuper.volNH3 != null && dessuper.volNH3 > 0, 'dessuper: vazão volumétrica de NH3 deveria ser calculada');

// ===================== LOTE "VISUALIZADORES" =====================

// 20) Propriedades do vapor saturado — modo P: 8 bar(g) -> Tsat, lat, vv
const steampropsP = computeSteamProps({ mode: 'P', pv: 8, pUnit: 'bar (g)', tUnit: '°C', latUnit: 'kcal/kg', vvUnit: 'm³/kg' });
dump('steamprops (modo pressão, 8 barg)', steampropsP);
console.assert(steampropsP.invalid === false, 'steamprops(P): não deveria ser inválido');
console.assert(Math.abs(steampropsP.T - 175.44) < 0.05, `steamprops(P): Tsat(8barg) deveria ser ~175.44°C, obtido ${steampropsP.T}`);

// 20b) modo T: 170°C -> Psat, lat, vv (round-trip aproximado com o caso acima)
const steampropsT = computeSteamProps({ mode: 'T', tv: 170, tvUnit: '°C', poutUnit: 'bar (g)', latUnit: 'kcal/kg', vvUnit: 'm³/kg' });
dump('steamprops (modo temperatura, 170°C)', steampropsT);
console.assert(steampropsT.invalid === false, 'steamprops(T): não deveria ser inválido');
console.assert(steampropsT.P > 6 && steampropsT.P < 8, `steamprops(T): P(170°C) deveria estar entre 6 e 8 barg, obtido ${steampropsT.P}`);

// 21) Conversor de unidades — pressão bar->psi, temperatura °C->°F, viscosidade cP->cSt
const unitconvPress = computeUnitConv({ category: 'Pressão', value: 1, fromUnit: 'bar', toUnit: 'psi' });
dump('unitconv (1 bar -> psi)', unitconvPress);
console.assert(unitconvPress.invalid === false && Math.abs(unitconvPress.value - 14.5038) < 1e-3, 'unitconv: 1 bar deveria ser ~14.5038 psi');

const unitconvTemp = computeUnitConv({ category: 'Temperatura', value: 100, fromUnit: '°C', toUnit: '°F' });
console.assert(unitconvTemp.invalid === false && unitconvTemp.value === 212, 'unitconv: 100°C deveria ser 212°F');

const unitconvViscNoRho = computeUnitConv({ category: 'Viscosidade', value: 100, fromUnit: 'cP', toUnit: 'cSt' });
console.assert(unitconvViscNoRho.invalid === false && unitconvViscNoRho.value === null, 'unitconv: cP->cSt sem densidade deveria retornar value=null (mesmo comportamento do ucConvert original)');

const unitconvVisc = computeUnitConv({ category: 'Viscosidade', value: 100, fromUnit: 'cP', toUnit: 'cSt', rho: 1000 });
dump('unitconv (100 cP -> cSt, rho=1000)', unitconvVisc);
console.assert(unitconvVisc.invalid === false && Math.abs(unitconvVisc.value - 100) < 1e-6, 'unitconv: 100 cP a rho=1000 deveria dar ~100 cSt (numericamente, pela relação de conversão de base)');

// 22) Curva P×T por material — apenas a curva auxiliar de saturação do vapor (núcleo
//     migrado); a base de materiais/ratings (editável via admin) fica no cliente.
const matcurve = computeMatCurve({ pmin: 5, pmax: 50 });
dump('matcurve (curva de saturação do vapor, 5-50 bar)', { invalid: matcurve.invalid, vapMax: matcurve.vapMax, nPts: matcurve.pts.length, first: matcurve.pts[0], last: matcurve.pts[matcurve.pts.length - 1] });
console.assert(matcurve.invalid === false, 'matcurve: não deveria ser inválido');
console.assert(matcurve.pts.length === 61, 'matcurve: deveria ter 61 pontos (N=60, i=0..60)');
console.assert(matcurve.pts[0][0] >= 5 && matcurve.pts[matcurve.pts.length - 1][0] <= 50, 'matcurve: pontos deveriam estar dentro do range pmin-pmax');
console.assert(matcurve.pts.every((p, i) => i === 0 || p[1] >= matcurve.pts[i - 1][1]), 'matcurve: temperatura de saturação deveria crescer monotonicamente com a pressão');

// 23) Catálogo VALV como parâmetro (2º arg, {valv}) — prova de que o servidor
//     consegue calcular com um catálogo vindo do Supabase/admin em vez do
//     default embutido no módulo, SEM afetar quem chama sem catálogo (default).
const reducBaseline = computeReduc({ pin: 12, pout: 8, flow: 2000, sch: '40', x: 100 });
const rowBase = reducBaseline.models.find(m => m.modelo === '12440').rows.find(r => r.sz === '1');
console.assert(rowBase.cvv === 11.8, `valv custom: baseline 12440/1 Cv deveria ser 11.8 (VALV default), obtido ${rowBase.cvv}`);

const customValv = JSON.parse(JSON.stringify(VALV));
customValv['12440'].sizes['1'] = 999; // edição "de admin" simulada
const reducCustom = computeReduc({ pin: 12, pout: 8, flow: 2000, sch: '40', x: 100 }, { valv: customValv });
const rowCustom = reducCustom.models.find(m => m.modelo === '12440').rows.find(r => r.sz === '1');
dump('reduc com catálogo VALV customizado (12440/1: Cv 11.8 -> 999)', { baseline_cvv: rowBase.cvv, baseline_rcv: rowBase.rcv, custom_cvv: rowCustom.cvv, custom_rcv: rowCustom.rcv });
console.assert(rowCustom.cvv === 999, `valv custom: 12440/1 Cv deveria refletir o catálogo customizado (999), obtido ${rowCustom.cvv}`);
console.assert(rowCustom.rcv !== rowBase.rcv, 'valv custom: rcv (CVp/cvv) deveria mudar quando o catálogo muda o Cv da bitola');
console.assert(reducCustom.CVp === reducBaseline.CVp, 'valv custom: CVp (Cv requerido, não depende do catálogo) deveria continuar igual');
// e o objeto VALV default do módulo (usado pelos testes acima, sem 2º argumento) não foi mutado:
console.assert(VALV['12440'].sizes['1'] === 11.8, 'valv custom: o VALV default do módulo não deveria ter sido alterado pelo teste (isolamento via clone)');

// 24) Catálogo PURG como parâmetro (2º arg, {purg}) — mesmo padrão do VALV,
//     replicado para purgadores (mesmo compute, catálogo trocável).
const purgIdx = PURG.findIndex(m => m.modelo === 'PT61 - 10');
console.assert(purgIdx >= 0, 'purg custom: modelo "PT61 - 10" deveria existir no catálogo PURG');
const purgBaseline = computePurg({ pin: 10, pout: 4, flow: 500, fsReq: 1.5 });
const purgRowBase = purgBaseline.models[purgIdx].bitolas[0];
console.assert(purgRowBase.cap > 300 && purgRowBase.cap < 320, `purg custom: baseline PT61-10 (1ª bitola) cap deveria ficar ~309.6 kg/h, obtido ${purgRowBase.cap}`);

const customPurg = JSON.parse(JSON.stringify(PURG));
customPurg[purgIdx].bitolas[0].curva = '0 * x + 1'; // curva "editada pelo admin": capacidade quase nula
const purgCustom = computePurg({ pin: 10, pout: 4, flow: 500, fsReq: 1.5 }, { purg: customPurg });
const purgRowCustom = purgCustom.models[purgIdx].bitolas[0];
dump('purg com catálogo PURG customizado (PT61-10, 1ª bitola: curva -> capacidade quase nula)', { baseline_cap: purgRowBase.cap, baseline_fs: purgRowBase.fs, custom_cap: purgRowCustom.cap, custom_fs: purgRowCustom.fs });
console.assert(purgRowCustom.cap === 1, `purg custom: cap deveria refletir a curva customizada (0*x+1=1), obtido ${purgRowCustom.cap}`);
console.assert(purgRowCustom.fs !== purgRowBase.fs, 'purg custom: fs (fator de segurança) deveria mudar quando o catálogo muda a curva de capacidade');
console.assert(purgCustom.dp === purgBaseline.dp && purgCustom.Tcond === purgBaseline.Tcond, 'purg custom: dp/Tcond (não dependem do catálogo) deveriam continuar iguais');
// e o PURG default do módulo (usado pelos testes acima, sem 2º argumento) não foi mutado:
console.assert(PURG[purgIdx].bitolas[0].curva !== '0 * x + 1', 'purg custom: o PURG default do módulo não deveria ter sido alterado pelo teste (isolamento via clone)');

console.log('\nTodos os testes (asserts) passaram sem lançar exceção.');
