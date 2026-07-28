// lib/catalogs.js
// Carrega catálogos "editáveis pelo admin" do Supabase (tabela `catalogos`,
// {nome text pk, data jsonb, atualizado_em}) para o SERVIDOR usar nos
// cálculos, em vez do catálogo hardcoded em lib/engine.js. Começa só pelo
// VALV (válvulas); materiais/purgadores seguem o mesmo padrão depois.
//
// Fonte de verdade: RLS na tabela `catalogos` permite leitura só a usuários
// autenticados e escrita só a admin — aqui, no servidor, lemos com a
// service_role key (ignora RLS; é o próprio backend, não um usuário).
//
// Cache em escopo de módulo (sobrevive entre invocações "quentes" da mesma
// função serverless) com TTL curto, para não bater no Supabase a cada
// requisição. Fallback seguro: se a env SUPABASE_SERVICE_ROLE_KEY não
// existir, ou a leitura vier vazia/der erro, usa o catálogo hardcoded
// passado pelo chamador (comportamento atual, sem Supabase).
const SUPABASE_URL = 'https://rzvuokutcuybzwlkmefn.supabase.co';
const TTL_MS = 60 * 1000;

const _cache = {}; // nome -> { data, ts }

export async function loadCatalogo(nome, fallback) {
  const now = Date.now();
  const hit = _cache[nome];
  if (hit && (now - hit.ts) < TTL_MS) {
    return hit.data;
  }

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    // Sem a env (ainda não configurada na Vercel): não tenta rede, mantém o
    // fallback hardcoded — é exatamente o comportamento de hoje.
    _cache[nome] = { data: fallback, ts: now };
    return fallback;
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/catalogos?nome=eq.${encodeURIComponent(nome)}&select=data`;
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    const data = Array.isArray(rows) && rows[0] && rows[0].data && typeof rows[0].data === 'object'
      ? rows[0].data
      : null;
    if (!data || !Object.keys(data).length) throw new Error('resposta vazia ou sem dados (catálogo ainda não migrado?)');
    _cache[nome] = { data, ts: now };
    return data;
  } catch (err) {
    console.error(`loadCatalogo('${nome}'): falha ao carregar do Supabase, usando fallback hardcoded —`, err && err.message ? err.message : err);
    // Cacheia o fallback também (mesmo TTL) para não bater no Supabase a
    // cada request enquanto ele estiver fora/mal configurado.
    _cache[nome] = { data: fallback, ts: now };
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Seed de trims (plug × Kvs × dPmáx × sede) do catálogo ARI-STEVI 470/471 ANSI
// (edição 07/24), modelos 32470 (ANSI150) e 35470 (ANSI300, mesmo catálogo/tabela de
// trims, só o f2f muda) — ESPELHO EXATO das constantes ARI_32470_TRIMS_2024_07 (+
// ARI_32470_F2F_ANSI150 / ARI_35470_F2F_ANSI300) em index.html. Precisa existir também aqui porque
// /api/calc roda no servidor (Vercel) e não executa nenhum código do index.html —
// sem este espelho, um trimSel enviado pelo cliente não encontraria `md.trims`
// no catálogo que o servidor carrega (Supabase ou o fallback de lib/engine.js) e
// resolveTrim() sempre cairia em "sem trim". Ao editar uma cópia, replicar na outra.
const ARI_32470_TRIMS_2024_07 = {
  '1': [
    { plug: 'parabolico', kvs: 0.1, dpmax: 40, sede: 3 }, { plug: 'parabolico', kvs: 0.16, dpmax: 40, sede: 3 }, { plug: 'parabolico', kvs: 0.25, dpmax: 40, sede: 3 },
    { plug: 'parabolico', kvs: 0.4, dpmax: 40, sede: 5 }, { plug: 'parabolico', kvs: 0.63, dpmax: 40, sede: 5 }, { plug: 'parabolico', kvs: 1, dpmax: 40, sede: 12 },
    { plug: 'parabolico', kvs: 1.6, dpmax: 40, sede: 12 }, { plug: 'parabolico', kvs: 2.5, dpmax: 40, sede: 12 }, { plug: 'parabolico', kvs: 4, dpmax: 40, sede: 18 },
    { plug: 'parabolico', kvs: 6.3, dpmax: 40, sede: 22 }, { plug: 'parabolico', kvs: 10, dpmax: 40, sede: 25 },
    { plug: 'perfurado', kvs: 2.5, dpmax: 40, sede: 18 }, { plug: 'perfurado', kvs: 4, dpmax: 40, sede: 22 }, { plug: 'perfurado', kvs: 6.3, dpmax: 40, sede: 25 },
  ],
  '1.1/2': [
    { plug: 'parabolico', kvs: 10, dpmax: 40, sede: 25 }, { plug: 'parabolico', kvs: 16, dpmax: 40, sede: 32 }, { plug: 'parabolico', kvs: 25, dpmax: 30, sede: 40 },
    { plug: 'perfurado', kvs: 6.3, dpmax: 40, sede: 25 }, { plug: 'perfurado', kvs: 10, dpmax: 40, sede: 32 }, { plug: 'perfurado', kvs: 16, dpmax: 40, sede: 40 },
  ],
  '2': [
    { plug: 'parabolico', kvs: 16, dpmax: 40, sede: 32 }, { plug: 'parabolico', kvs: 25, dpmax: 40, sede: 40 }, { plug: 'parabolico', kvs: 40, dpmax: 30, sede: 50 },
    { plug: 'perfurado', kvs: 10, dpmax: 40, sede: 32 }, { plug: 'perfurado', kvs: 16, dpmax: 40, sede: 40 }, { plug: 'perfurado', kvs: 25, dpmax: 40, sede: 50 },
  ],
  '3': [
    { plug: 'parabolico', kvs: 40, dpmax: 30, sede: 50 }, { plug: 'parabolico', kvs: 63, dpmax: 15, sede: 65 }, { plug: 'parabolico', kvs: 100, dpmax: 8, sede: 80 },
    { plug: 'vport', kvs: 63, dpmax: 30, sede: 65 }, { plug: 'vport', kvs: 100, dpmax: 30, sede: 80 },
    { plug: 'perfurado', kvs: 25, dpmax: 40, sede: 50 }, { plug: 'perfurado', kvs: 40, dpmax: 40, sede: 65 }, { plug: 'perfurado', kvs: 63, dpmax: 40, sede: 80 },
  ],
  '4': [
    { plug: 'parabolico', kvs: 63, dpmax: 15, sede: 65 }, { plug: 'parabolico', kvs: 100, dpmax: 8, sede: 80 }, { plug: 'parabolico', kvs: 160, dpmax: 4, sede: 100 },
    { plug: 'vport', kvs: 63, dpmax: 30, sede: 65 }, { plug: 'vport', kvs: 100, dpmax: 30, sede: 80 }, { plug: 'vport', kvs: 160, dpmax: 25, sede: 100 },
    { plug: 'perfurado', kvs: 40, dpmax: 40, sede: 65 }, { plug: 'perfurado', kvs: 63, dpmax: 40, sede: 80 }, { plug: 'perfurado', kvs: 100, dpmax: 40, sede: 100 },
  ],
  '6': [
    { plug: 'parabolico', kvs: 160, dpmax: 4, sede: 100 }, { plug: 'parabolico', kvs: 250, dpmax: 2, sede: 125 }, { plug: 'parabolico', kvs: 400, dpmax: 2, sede: 150 },
    { plug: 'vport', kvs: 160, dpmax: 25, sede: 100 }, { plug: 'vport', kvs: 250, dpmax: 15, sede: 125 }, { plug: 'vport', kvs: 400, dpmax: 15, sede: 150 },
    { plug: 'perfurado', kvs: 100, dpmax: 40, sede: 100 }, { plug: 'perfurado', kvs: 160, dpmax: 40, sede: 125 }, { plug: 'perfurado', kvs: 250, dpmax: 40, sede: 150 },
  ],
  '8': [
    { plug: 'vport', kvs: 250, dpmax: 15, sede: 125 }, { plug: 'vport', kvs: 400, dpmax: 15, sede: 150 }, { plug: 'vport', kvs: 630, dpmax: 12, sede: 200 },
    { plug: 'perfurado', kvs: 160, dpmax: 40, sede: 125 }, { plug: 'perfurado', kvs: 250, dpmax: 40, sede: 150 }, { plug: 'perfurado', kvs: 400, dpmax: 30, sede: 200 },
  ],
};
const ARI_32470_F2F_ANSI150 = { '1': 184, '1.1/2': 222, '2': 254, '3': 298, '4': 352, '6': 451, '8': 543 };
// Face a face 35470 (ANSI300, mesmo catálogo STEVI 470/471, pág. 18/19 linha "L"/ANSI300) —
// espelho exato de ARI_35470_F2F_ANSI300 em index.html.
const ARI_35470_F2F_ANSI300 = { '1': 197, '1.1/2': 235, '2': 267, '3': 318, '4': 368, '6': 473, '8': 568 };
const TRIM_SEED_MODELS = ['32470', '35470']; // modelos com seed de catálogo validada (mesma lista de ARI_TRIM_SEED_MODELS no index.html)
// Ambos os modelos usam a MESMA tabela de trims (mesmo catálogo STEVI 470/471); só o f2f
// muda por classe de pressão (ANSI150 x ANSI300) — mesmo mapeamento de index.html.
const TRIM_SEED_TRIMS_BY_MODEL = { '32470': ARI_32470_TRIMS_2024_07, '35470': ARI_32470_TRIMS_2024_07 };
const TRIM_SEED_F2F_BY_MODEL = { '32470': ARI_32470_F2F_ANSI150, '35470': ARI_35470_F2F_ANSI300 };

// Merge ADITIVO e idempotente do seed acima — devolve um objeto VALV novo, com os
// modelos de TRIM_SEED_MODELS CLONADOS (trims/f2f mesclados) e todos os demais modelos
// mantidos POR REFERÊNCIA (não copia o catálogo inteiro, barato). Importante: NÃO muta o
// objeto recebido — `valv` pode ser a MESMA constante `VALV` importada de lib/engine.js
// (fallback compartilhado, module-level) e usada por outros pontos do código/testes;
// mutar in-place a alteraria permanentemente para o processo inteiro (inclusive entre
// invocações "quentes" da function serverless). ACRESCENTA combinações plug+Kvs e bitolas
// de f2f ausentes, e também PREENCHE campos ausentes (sede, dpmax) em trims já existentes
// cujo par plug+Kvs bata com o seed — sem nunca sobrescrever um valor já preenchido (edição
// do admin, via Supabase, sempre vence). Isso corrige o caso de trims salvos numa rodada
// anterior (antes do campo `sede` existir no seed): sem o backfill, o merge aditivo antigo
// (baseado em .some(), pulava a combinação inteira) deixava esses trims para sempre sem
// sede/dPmáx, mesmo depois do seed ganhar esses campos. Roda a cada loadValv() bem
// sucedido (Supabase OU fallback), então funciona mesmo antes de qualquer admin salvar
// trims manualmente.
function applyTrimSeed(valvIn) {
  if (!valvIn || typeof valvIn !== 'object') return valvIn;
  const relevantes = TRIM_SEED_MODELS.filter((mdl) => valvIn[mdl]);
  if (!relevantes.length) return valvIn;
  const valv = Object.assign({}, valvIn); // shallow copy do catálogo (não duplica modelos não tocados)
  relevantes.forEach((mdl) => {
    const seed = TRIM_SEED_TRIMS_BY_MODEL[mdl];
    const f2fSeed = TRIM_SEED_F2F_BY_MODEL[mdl];
    if (!seed) return;
    const mdOrig = valvIn[mdl];
    // clona só o necessário do modelo (trims/f2f por bitola); o resto (sizes, curso, xt...) fica por referência
    const md = valv[mdl] = Object.assign({}, mdOrig);
    md.trims = Object.assign({}, mdOrig.trims);
    Object.keys(md.trims).forEach((dn) => { md.trims[dn] = (md.trims[dn] || []).slice(); });
    md.f2f = Object.assign({}, mdOrig.f2f);
    if (f2fSeed) Object.keys(f2fSeed).forEach((dn) => {
      if (md.f2f[dn] == null || md.f2f[dn] === '') md.f2f[dn] = f2fSeed[dn];
    });
    Object.keys(seed).forEach((dn) => {
      const existentes = md.trims[dn] = md.trims[dn] || [];
      const jaTemPadrao = existentes.some((r) => r && r.padrao);
      const atual = md.sizes && md.sizes[dn];
      const atualKvs = (atual != null && !isNaN(Number(atual))) ? Number(atual) * 0.865 : null;
      const plugEstoque = (parseInchLocal(dn) <= 2) ? 'parabolico' : 'vport';
      const tol = (kvs) => Math.max(0.5, kvs * 0.03);
      seed[dn].forEach((s) => {
        const idx = existentes.findIndex((r) => r && r.plug === s.plug && Math.abs(Number(r.kvs) - s.kvs) < 0.01);
        if (idx >= 0) {
          const existente = existentes[idx];
          const faltaSede = (existente.sede == null || existente.sede === '') && s.sede != null;
          const faltaDpmax = (existente.dpmax == null || existente.dpmax === '') && s.dpmax != null;
          if (faltaSede || faltaDpmax) {
            // NUNCA mutar o objeto de linha original in-place: ele pode ser o MESMO objeto
            // referenciado por valvIn (fallback compartilhado de lib/engine.js ou o cache de
            // loadCatalogo) — troca por uma cópia (clone raso) só nesta posição do array clonado.
            const clone = Object.assign({}, existente);
            if (faltaSede) clone.sede = s.sede;
            if (faltaDpmax) clone.dpmax = s.dpmax;
            existentes[idx] = clone;
          }
          return;
        }
        const row = { plug: s.plug, kvs: s.kvs, dpmax: s.dpmax, sede: s.sede };
        if (!jaTemPadrao && s.plug === plugEstoque && atualKvs != null && Math.abs(s.kvs - atualKvs) <= tol(s.kvs)) row.padrao = true;
        existentes.push(row);
      });
    });
  });
  return valv;
}
function parseInchLocal(s) { // cópia mínima de parseInch (lib/engine.js) — evita import circular por tão pouco
  if (s.indexOf('.') >= 0) { const [a, b] = s.split('.'); const [n, d] = b.split('/'); return +a + (+n) / (+d); }
  if (s.indexOf('/') >= 0) { const [n, d] = s.split('/'); return (+n) / (+d); }
  return +s;
}

export async function loadValv(fallback) {
  const valv = await loadCatalogo('valv', fallback);
  try { return applyTrimSeed(valv); } catch (err) { console.error('loadValv: falha ao aplicar seed de trims ARI (não bloqueia)', err && err.message ? err.message : err); return valv; }
}
