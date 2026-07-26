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

async function loadCatalogo(nome, fallback) {
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

export async function loadValv(fallback) {
  return loadCatalogo('valv', fallback);
}
