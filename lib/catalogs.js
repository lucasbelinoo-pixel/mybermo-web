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
// Seed de trims (plug × Kvs × dPmáx × sede × curso) dos catálogos ARI-STEVI — ESPELHO EXATO
// das constantes equivalentes em index.html (ARI_32470_TRIMS_2024_07, ARI_12440_TRIMS_2013_08,
// ARI_45440_TRIMS_2021_02, ARI_32448_TRIMS_2024_07 + f2f de cada um). Precisa existir também
// aqui porque /api/calc roda no servidor (Vercel) e não executa nenhum código do index.html —
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
// Curso/Travel (mm) por Ø de sede — ver comentário completo em index.html junto de
// ARI_470_CURSO_POR_SEDE (mesma tabela, extraída das mesmas págs. 6/7/8/15 do PDF).
const ARI_470_CURSO_POR_SEDE = { 3: 20, 5: 20, 12: 20, 18: 20, 22: 20, 25: 20, 32: 20, 40: 30, 50: 30, 65: 30, 80: 30, 100: 30, 125: 50, 150: 50, 200: 65 };
Object.keys(ARI_32470_TRIMS_2024_07).forEach((dn) => {
  ARI_32470_TRIMS_2024_07[dn].forEach((t) => { if (t.sede != null && ARI_470_CURSO_POR_SEDE[t.sede] != null) t.curso = ARI_470_CURSO_POR_SEDE[t.sede]; });
});
const ARI_32470_F2F_ANSI150 = { '1': 184, '1.1/2': 222, '2': 254, '3': 298, '4': 352, '6': 451, '8': 543 };
// Face a face 35470 (ANSI300, mesmo catálogo STEVI 470/471, pág. 18/19 linha "L"/ANSI300) —
// espelho exato de ARI_35470_F2F_ANSI300 em index.html.
const ARI_35470_F2F_ANSI300 = { '1': 197, '1.1/2': 235, '2': 267, '3': 318, '4': 368, '6': 473, '8': 568 };

// 12440 — ARI-STEVI 440/441 (DN15-250), Fig.12.440 PN16 — espelho exato de
// ARI_12440_TRIMS_2013_08 / ARI_12440_F2F em index.html (ver comentário completo lá: 1
// seat/travel/dPmáx por bitola, Kvs "reduzido" sem dPmáx próprio publicado = mesmo dPmáx da
// bitola; NPS "5"/DN125 não semeado — sem Cv em VALV['12440'].sizes para ancorar).
const ARI_12440_TRIMS_2013_08 = {
  '1/2': [{ plug: 'parabolico', kvs: 4, dpmax: 40, sede: 21, curso: 20 }, { plug: 'parabolico', kvs: 2.5, dpmax: 40, sede: 21, curso: 20 }],
  '3/4': [{ plug: 'parabolico', kvs: 6.3, dpmax: 40, sede: 21, curso: 20 }, { plug: 'parabolico', kvs: 4, dpmax: 40, sede: 21, curso: 20 }, { plug: 'parabolico', kvs: 2.5, dpmax: 40, sede: 21, curso: 20 }],
  '1': [{ plug: 'parabolico', kvs: 10, dpmax: 40, sede: 27, curso: 20 }, { plug: 'parabolico', kvs: 6.3, dpmax: 40, sede: 27, curso: 20 }],
  '1.1/4': [{ plug: 'parabolico', kvs: 16, dpmax: 40, sede: 31, curso: 20 }, { plug: 'parabolico', kvs: 10, dpmax: 40, sede: 31, curso: 20 }],
  '1.1/2': [{ plug: 'parabolico', kvs: 25, dpmax: 30, sede: 41, curso: 20 }, { plug: 'parabolico', kvs: 16, dpmax: 30, sede: 41, curso: 20 }],
  '2': [{ plug: 'parabolico', kvs: 40, dpmax: 20, sede: 51, curso: 20 }, { plug: 'parabolico', kvs: 25, dpmax: 20, sede: 51, curso: 20 }],
  '2.1/2': [{ plug: 'parabolico', kvs: 63, dpmax: 8, sede: 66, curso: 30 }, { plug: 'parabolico', kvs: 40, dpmax: 8, sede: 66, curso: 30 }, { plug: 'vport', kvs: 63, dpmax: 30, sede: 66, curso: 30 }],
  '3': [{ plug: 'parabolico', kvs: 100, dpmax: 4, sede: 81, curso: 30 }, { plug: 'parabolico', kvs: 63, dpmax: 4, sede: 81, curso: 30 }, { plug: 'vport', kvs: 100, dpmax: 25, sede: 81, curso: 30 }],
  '4': [{ plug: 'parabolico', kvs: 160, dpmax: 1.5, sede: 101, curso: 30 }, { plug: 'parabolico', kvs: 100, dpmax: 1.5, sede: 101, curso: 30 }, { plug: 'vport', kvs: 160, dpmax: 25, sede: 101, curso: 30 }],
  '6': [{ plug: 'parabolico', kvs: 400, dpmax: 1, sede: 151, curso: 50 }, { plug: 'parabolico', kvs: 250, dpmax: 1, sede: 151, curso: 50 }, { plug: 'vport', kvs: 400, dpmax: 10, sede: 151, curso: 50 }],
  '8': [{ plug: 'vport', kvs: 630, dpmax: 5, sede: 201, curso: 65 }],
  '10': [{ plug: 'vport', kvs: 1000, dpmax: 5, sede: 251, curso: 65 }],
};
const ARI_12440_F2F = { '1/2': 130, '3/4': 150, '1': 160, '1.1/4': 180, '1.1/2': 200, '2': 230, '2.1/2': 290, '3': 310, '4': 350, '6': 480, '8': 600, '10': 730 };

// 45440 — ARI-STEVI 440-ANSI (NPS 1/2"-2"), Fig.45.440 ANSI300 — espelho exato de
// ARI_45440_TRIMS_2021_02 / ARI_45440_F2F em index.html. Só plug parabólico (catálogo não
// lista outro).
const ARI_45440_TRIMS_2021_02 = {
  '1/2': [{ plug: 'parabolico', kvs: 3.3, dpmax: 40, sede: 21, curso: 20 }],
  '3/4': [{ plug: 'parabolico', kvs: 5.4, dpmax: 40, sede: 21, curso: 20 }],
  '1': [{ plug: 'parabolico', kvs: 8.4, dpmax: 40, sede: 27, curso: 20 }],
  '1.1/4': [{ plug: 'parabolico', kvs: 12.8, dpmax: 30, sede: 41, curso: 20 }],
  '1.1/2': [{ plug: 'parabolico', kvs: 20, dpmax: 30, sede: 41, curso: 20 }],
  '2': [{ plug: 'parabolico', kvs: 28.4, dpmax: 20, sede: 51, curso: 20 }],
};
const ARI_45440_F2F = { '1/2': 117, '3/4': 117, '1': 139, '1.1/4': 186, '1.1/2': 186, '2': 209 };

// 32448 — ARI-STEVI 448/449 (DN15-100), Fig.12.448 PN16 — espelho exato de
// ARI_32448_TRIMS_2024_07 / ARI_32448_F2F em index.html. Plugs Parabólico + Perfurado (sem
// V-port, catálogo não lista); dPmáx do Parabólico varia por Ø de sede (tabela abaixo);
// Perfurado é sempre 40 bar onde existe.
const ARI_32448_CURSO_POR_SEDE = { 3: 10, 5: 10, 12: 10, 16: 10, 22: 10, 28: 15, 35: 15, 43: 15, 56: 20, 70: 25, 95: 30 };
const ARI_32448_DPMAX_PARAB_POR_SEDE = { 3: 40, 5: 40, 12: 40, 16: 40, 22: 40, 28: 40, 35: 30, 43: 30, 56: 10, 70: 8, 95: 3 };
const ARI_32448_TRIMS_2024_07 = {
  '1/2': [
    { plug: 'parabolico', kvs: 0.1, sede: 3 }, { plug: 'parabolico', kvs: 0.16, sede: 3 }, { plug: 'parabolico', kvs: 0.25, sede: 3 },
    { plug: 'parabolico', kvs: 0.4, sede: 5 }, { plug: 'parabolico', kvs: 0.63, sede: 5 },
    { plug: 'parabolico', kvs: 1, sede: 12 }, { plug: 'parabolico', kvs: 1.6, sede: 12 }, { plug: 'parabolico', kvs: 2.5, sede: 12 }, { plug: 'parabolico', kvs: 4, sede: 12 },
    { plug: 'perfurado', kvs: 1, dpmax: 40, sede: 12 }, { plug: 'perfurado', kvs: 1.6, dpmax: 40, sede: 12 }, { plug: 'perfurado', kvs: 2.5, dpmax: 40, sede: 12 },
  ],
  '3/4': [
    { plug: 'parabolico', kvs: 0.1, sede: 3 }, { plug: 'parabolico', kvs: 0.16, sede: 3 }, { plug: 'parabolico', kvs: 0.25, sede: 3 },
    { plug: 'parabolico', kvs: 0.4, sede: 5 }, { plug: 'parabolico', kvs: 0.63, sede: 5 },
    { plug: 'parabolico', kvs: 1, sede: 12 }, { plug: 'parabolico', kvs: 1.6, sede: 12 }, { plug: 'parabolico', kvs: 2.5, sede: 12 }, { plug: 'parabolico', kvs: 4, sede: 12 },
    { plug: 'parabolico', kvs: 6.3, sede: 16 },
    { plug: 'perfurado', kvs: 1, dpmax: 40, sede: 12 }, { plug: 'perfurado', kvs: 1.6, dpmax: 40, sede: 12 }, { plug: 'perfurado', kvs: 2.5, dpmax: 40, sede: 12 },
    { plug: 'perfurado', kvs: 4, dpmax: 40, sede: 16 },
  ],
  '1': [
    { plug: 'parabolico', kvs: 0.1, sede: 3 }, { plug: 'parabolico', kvs: 0.16, sede: 3 }, { plug: 'parabolico', kvs: 0.25, sede: 3 },
    { plug: 'parabolico', kvs: 0.4, sede: 5 }, { plug: 'parabolico', kvs: 0.63, sede: 5 },
    { plug: 'parabolico', kvs: 1, sede: 12 }, { plug: 'parabolico', kvs: 1.6, sede: 12 }, { plug: 'parabolico', kvs: 2.5, sede: 12 }, { plug: 'parabolico', kvs: 4, sede: 12 },
    { plug: 'parabolico', kvs: 6.3, sede: 16 }, { plug: 'parabolico', kvs: 10, sede: 22 },
    { plug: 'perfurado', kvs: 1, dpmax: 40, sede: 12 }, { plug: 'perfurado', kvs: 1.6, dpmax: 40, sede: 12 }, { plug: 'perfurado', kvs: 2.5, dpmax: 40, sede: 12 },
    { plug: 'perfurado', kvs: 4, dpmax: 40, sede: 16 }, { plug: 'perfurado', kvs: 6.3, dpmax: 40, sede: 22 },
  ],
  '1.1/4': [
    { plug: 'parabolico', kvs: 1, sede: 12 }, { plug: 'parabolico', kvs: 1.6, sede: 12 }, { plug: 'parabolico', kvs: 2.5, sede: 12 }, { plug: 'parabolico', kvs: 4, sede: 12 },
    { plug: 'parabolico', kvs: 6.3, sede: 16 }, { plug: 'parabolico', kvs: 10, sede: 22 }, { plug: 'parabolico', kvs: 16, sede: 28 },
    { plug: 'perfurado', kvs: 1, dpmax: 40, sede: 12 }, { plug: 'perfurado', kvs: 1.6, dpmax: 40, sede: 12 }, { plug: 'perfurado', kvs: 2.5, dpmax: 40, sede: 12 },
    { plug: 'perfurado', kvs: 4, dpmax: 40, sede: 16 }, { plug: 'perfurado', kvs: 6.3, dpmax: 40, sede: 22 }, { plug: 'perfurado', kvs: 10, dpmax: 40, sede: 28 },
  ],
  '1.1/2': [
    { plug: 'parabolico', kvs: 6.3, sede: 16 }, { plug: 'parabolico', kvs: 10, sede: 22 }, { plug: 'parabolico', kvs: 16, sede: 28 }, { plug: 'parabolico', kvs: 25, sede: 35 },
    { plug: 'perfurado', kvs: 4, dpmax: 40, sede: 16 }, { plug: 'perfurado', kvs: 6.3, dpmax: 40, sede: 22 }, { plug: 'perfurado', kvs: 10, dpmax: 40, sede: 28 }, { plug: 'perfurado', kvs: 16, dpmax: 40, sede: 35 },
  ],
  '2': [
    { plug: 'parabolico', kvs: 10, sede: 22 }, { plug: 'parabolico', kvs: 16, sede: 28 }, { plug: 'parabolico', kvs: 25, sede: 35 }, { plug: 'parabolico', kvs: 40, sede: 43 },
    { plug: 'perfurado', kvs: 6.3, dpmax: 40, sede: 22 }, { plug: 'perfurado', kvs: 10, dpmax: 40, sede: 28 }, { plug: 'perfurado', kvs: 16, dpmax: 40, sede: 35 }, { plug: 'perfurado', kvs: 25, dpmax: 40, sede: 43 },
  ],
  '2.1/2': [
    { plug: 'parabolico', kvs: 16, sede: 28 }, { plug: 'parabolico', kvs: 25, sede: 35 }, { plug: 'parabolico', kvs: 40, sede: 43 }, { plug: 'parabolico', kvs: 63, sede: 56 },
    { plug: 'perfurado', kvs: 10, dpmax: 40, sede: 28 }, { plug: 'perfurado', kvs: 16, dpmax: 40, sede: 35 }, { plug: 'perfurado', kvs: 25, dpmax: 40, sede: 43 }, { plug: 'perfurado', kvs: 40, dpmax: 40, sede: 56 },
  ],
  '3': [
    { plug: 'parabolico', kvs: 25, sede: 35 }, { plug: 'parabolico', kvs: 40, sede: 43 }, { plug: 'parabolico', kvs: 63, sede: 56 }, { plug: 'parabolico', kvs: 100, sede: 70 },
    { plug: 'perfurado', kvs: 16, dpmax: 40, sede: 35 }, { plug: 'perfurado', kvs: 25, dpmax: 40, sede: 43 }, { plug: 'perfurado', kvs: 40, dpmax: 40, sede: 56 }, { plug: 'perfurado', kvs: 63, dpmax: 40, sede: 70 },
  ],
  '4': [
    { plug: 'parabolico', kvs: 40, sede: 43 }, { plug: 'parabolico', kvs: 63, sede: 56 }, { plug: 'parabolico', kvs: 100, sede: 70 }, { plug: 'parabolico', kvs: 160, sede: 95 },
    { plug: 'perfurado', kvs: 25, dpmax: 40, sede: 43 }, { plug: 'perfurado', kvs: 40, dpmax: 40, sede: 56 }, { plug: 'perfurado', kvs: 63, dpmax: 40, sede: 70 }, { plug: 'perfurado', kvs: 100, dpmax: 40, sede: 95 },
  ],
};
Object.keys(ARI_32448_TRIMS_2024_07).forEach((dn) => {
  ARI_32448_TRIMS_2024_07[dn].forEach((t) => {
    if (t.curso == null && ARI_32448_CURSO_POR_SEDE[t.sede] != null) t.curso = ARI_32448_CURSO_POR_SEDE[t.sede];
    if (t.dpmax == null && t.plug === 'parabolico' && ARI_32448_DPMAX_PARAB_POR_SEDE[t.sede] != null) t.dpmax = ARI_32448_DPMAX_PARAB_POR_SEDE[t.sede];
  });
});
const ARI_32448_F2F = { '1/2': 130, '3/4': 150, '1': 160, '1.1/4': 180, '1.1/2': 200, '2': 230, '2.1/2': 290, '3': 310, '4': 350 };

// Regra de plug "padrão de estoque" por modelo — espelho exato de ARI_TRIM_SEED_PADRAO_PLUG
// em index.html.
const TRIM_SEED_PADRAO_PLUG = {
  '32470': (dn) => (parseInchLocal(dn) <= 2) ? 'parabolico' : 'vport',
  '35470': (dn) => (parseInchLocal(dn) <= 2) ? 'parabolico' : 'vport',
  '12440': (dn) => (parseInchLocal(dn) <= 2.5) ? 'parabolico' : 'vport',
  '45440': () => 'parabolico',
  '32448': () => 'parabolico',
};
const TRIM_SEED_MODELS = ['32470', '35470', '12440', '45440', '32448']; // mesma lista de ARI_TRIM_SEED_MODELS no index.html
// 32470/35470 usam a MESMA tabela de trims (mesmo catálogo STEVI 470/471); 12440/45440/32448
// são catálogos próprios, cada um com sua própria tabela — mesmo mapeamento de index.html.
const TRIM_SEED_TRIMS_BY_MODEL = { '32470': ARI_32470_TRIMS_2024_07, '35470': ARI_32470_TRIMS_2024_07, '12440': ARI_12440_TRIMS_2013_08, '45440': ARI_45440_TRIMS_2021_02, '32448': ARI_32448_TRIMS_2024_07 };
const TRIM_SEED_F2F_BY_MODEL = { '32470': ARI_32470_F2F_ANSI150, '35470': ARI_35470_F2F_ANSI300, '12440': ARI_12440_F2F, '45440': ARI_45440_F2F, '32448': ARI_32448_F2F };

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
      const regraPlug = TRIM_SEED_PADRAO_PLUG[mdl] || ((d) => (parseInchLocal(d) <= 2) ? 'parabolico' : 'vport');
      const plugEstoque = regraPlug(dn);
      const tol = (kvs) => Math.max(0.5, kvs * 0.03);
      seed[dn].forEach((s) => {
        const idx = existentes.findIndex((r) => r && r.plug === s.plug && Math.abs(Number(r.kvs) - s.kvs) < 0.01);
        if (idx >= 0) {
          const existente = existentes[idx];
          const faltaSede = (existente.sede == null || existente.sede === '') && s.sede != null;
          const faltaDpmax = (existente.dpmax == null || existente.dpmax === '') && s.dpmax != null;
          const faltaCurso = (existente.curso == null || existente.curso === '') && s.curso != null;
          if (faltaSede || faltaDpmax || faltaCurso) {
            // NUNCA mutar o objeto de linha original in-place: ele pode ser o MESMO objeto
            // referenciado por valvIn (fallback compartilhado de lib/engine.js ou o cache de
            // loadCatalogo) — troca por uma cópia (clone raso) só nesta posição do array clonado.
            const clone = Object.assign({}, existente);
            if (faltaSede) clone.sede = s.sede;
            if (faltaDpmax) clone.dpmax = s.dpmax;
            if (faltaCurso) clone.curso = s.curso;
            existentes[idx] = clone;
          }
          return;
        }
        const row = { plug: s.plug, kvs: s.kvs, dpmax: s.dpmax, sede: s.sede };
        if (s.curso != null) row.curso = s.curso;
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
