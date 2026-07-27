// lib/rate.js
// Rate limit por usuário para /api/calc (proteção anti-macro/loop infinito de
// cálculos disparado por engano — ex.: um script/extensão do navegador
// chamando o endpoint em loop, ou um bug de render que reenvia sem parar).
// NÃO é autenticação (isso é lib/auth.js#requireUser, fail-CLOSED) — isto é
// uma proteção ADICIONAL, fail-OPEN: qualquer falha aqui deixa o cálculo
// passar, nunca derruba um usuário legítimo por causa desta camada.
//
// Infra no Supabase (criada e mantida pelo usuário, fora deste repositório
// de migrações incrementais — mesmo padrão de sql/05_login_unico.sql, cujo
// ALTER também foi rodado manualmente):
//   - tabela rate_limit(user_id uuid, janela timestamptz, contagem int,
//     primary key(user_id, janela)) — RLS ligada SEM policies (só
//     service_role acessa; nem authenticated nem anon leem/escrevem direto).
//   - função rate_hit(p_user uuid, p_janela timestamptz) returns int,
//     security definer — limpa janelas antigas (>2h) do usuário, incrementa
//     o bucket (user_id,janela) e devolve a contagem já incrementada.
//     EXECUTE revogado de anon/authenticated: só chamável via REST
//     /rest/v1/rpc/rate_hit autenticado com a service_role key (nunca vai ao
//     navegador — mesma chave usada em lib/auth.js/api/users.js).
//
// DUAS CAMADAS:
//   1) MINUTO, via rate_hit/Postgres — autoritativa, compartilhada entre
//      TODAS as instâncias da function (a tabela é a fonte da verdade).
//      Limite: 90/minuto. Por quê 90 e não mais justo: geracaosuper tem
//      debounce ~2/s (até ~120/min só nesse módulo em uso normal intenso) +
//      vários módulos recalculam sozinhos no boot da tela (renderReduc etc.)
//      — 90/min dá folga generosa pra digitação rápida/uso legítimo sem
//      abrir muito espaço pra um loop descontrolado (que tipicamente dispara
//      dezenas/centenas de req por segundo, não por minuto).
//   2) HORA, EM MEMÓRIA (Map por userId neste módulo) — camada extra barata,
//      SEM chamada de rede. Limite: 1500/hora. APROXIMADO/BEST-EFFORT DE
//      PROPÓSITO: cada instância "quente" da serverless function tem seu
//      próprio contador (não é compartilhado entre instâncias, ao contrário
//      da camada 1); numa Vercel function com múltiplas instâncias
//      concorrentes, o limite real efetivo pode ser (1500 × nº de
//      instâncias). Aceitável aqui porque essa camada é só uma rede de
//      segurança adicional e barata — a camada 1 (minuto, via Postgres) é
//      quem garante o limite de verdade, compartilhado entre instâncias.
//
// PERFORMANCE — decisão registrada: a RPC (1 upsert leve no Postgres) é
// chamada A CADA REQUEST que chega até aqui, deliberadamente SEM tentar
// acumular/agregar incrementos no lado do Node antes de enviar (isso exigiria
// um buffer com flush periódico, código bem mais complexo, e ainda erraria o
// limite em caso de crash/cold start entre o incremento local e o flush) —
// a base de usuários desta ferramenta é pequena, então 1 upsert por cálculo
// é barato o bastante para não precisar dessa complexidade. A ÚNICA
// otimização aplicada (oferecida como aceitável pelo pedido original): um
// cache em memória de "bloqueado até X" por userId — enquanto o timestamp
// atual for menor que esse X, a RPC nem é chamada (resposta imediata,
// fail-closed só para ESSE usuário específico, sem custo de rede) — isso é
// o que realmente protege o Postgres de ficar recebendo uma rajada de
// upserts de um loop já identificado como bloqueado, sem precisar de buffer
// nenhum.
const SUPABASE_URL = 'https://rzvuokutcuybzwlkmefn.supabase.co'; // mesmo valor de lib/auth.js, lib/catalogs.js, api/users.js

const MINUTE_LIMIT = 90;   // camada 1 (Postgres, autoritativa) — ver comentário acima
const HOUR_LIMIT = 1500;   // camada 2 (memória, best-effort) — ver comentário acima

// userId -> timestamp (ms) até quando pular a RPC (já sabemos que este
// usuário está bloqueado no minuto corrente). Também serve pra não bater
// repetidamente no Postgres numa rajada depois do 91º pedido.
const _blockedUntil = new Map();
// userId -> { hourKey, count } — camada 2, ver comentário acima.
const _hourly = new Map();

function pruneMap(map, now, isExpired) {
  if (map.size <= 1000) return;
  for (const [k, v] of map) { if (isExpired(v, now)) map.delete(k); }
}

function currentMinuteISO(nowMs) {
  return new Date(Math.floor(nowMs / 60000) * 60000).toISOString();
}

function secondsToNextMinute(nowMs) {
  return Math.max(1, Math.ceil((60000 - (nowMs % 60000)) / 1000));
}

function secondsToNextHour(nowMs) {
  return Math.max(1, Math.ceil((3600000 - (nowMs % 3600000)) / 1000));
}

// Camada 2 (hora, em memória, best-effort — ver comentário no topo do
// arquivo). Retorna true se este request estourou o limite horário.
function bumpHourlyAndCheck(userId, nowMs) {
  const hourKey = Math.floor(nowMs / 3600000);
  const hit = _hourly.get(userId);
  if (hit && hit.hourKey === hourKey) {
    hit.count += 1;
    return hit.count > HOUR_LIMIT;
  }
  _hourly.set(userId, { hourKey, count: 1 });
  pruneMap(_hourly, hourKey, (v) => v.hourKey !== hourKey);
  return false;
}

async function callRateHit(serviceKey, userId, janelaISO) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rate_hit`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user: userId, p_janela: janelaISO }),
  });
  if (!res.ok) throw new Error(`rate_hit: HTTP ${res.status}`);
  const data = await res.json().catch(() => null);
  // PostgREST devolve o retorno escalar da função "cru" (ex.: 7), não
  // embrulhado num objeto — mas aceitamos {count:N}/{rate_hit:N} também,
  // caso a forma de chamada mude no futuro (RPC com Prefer diferente etc.).
  const n = typeof data === 'number' ? data
    : (data && typeof data.count === 'number') ? data.count
    : (data && typeof data.rate_hit === 'number') ? data.rate_hit
    : Number(data);
  if (!Number.isFinite(n)) throw new Error('rate_hit: resposta em formato inesperado');
  return n;
}

// checkRateLimit(userId): { limited: boolean, retryAfterSeconds: number }
// FAIL-OPEN em qualquer erro (sem service key, rede, RPC ainda não criada,
// resposta inesperada) — devolve limited:false. A autenticação em si
// (lib/auth.js#requireUser, chamada ANTES desta função em api/calc.js)
// continua fail-CLOSED; esta é só a proteção adicional anti-macro.
export async function checkRateLimit(userId) {
  if (!userId) return { limited: false, retryAfterSeconds: 0 };
  const now = Date.now();

  // Atalho: usuário já sabidamente bloqueado neste minuto — nem chama a RPC
  // (ver "PERFORMANCE" no topo do arquivo).
  const until = _blockedUntil.get(userId);
  if (until && until > now) {
    return { limited: true, retryAfterSeconds: Math.ceil((until - now) / 1000) };
  }

  // Camada 2 (hora, em memória, best-effort) — barata, roda sempre, antes da
  // RPC; se já estourou a hora, nem precisa consultar o Postgres.
  if (bumpHourlyAndCheck(userId, now)) {
    const retryAfterSeconds = secondsToNextHour(now);
    _blockedUntil.set(userId, now + retryAfterSeconds * 1000);
    return { limited: true, retryAfterSeconds };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return { limited: false, retryAfterSeconds: 0 }; // fail-open (sem env configurada)

  try {
    const janelaISO = currentMinuteISO(now);
    const count = await callRateHit(serviceKey, userId, janelaISO);
    if (count > MINUTE_LIMIT) {
      const retryAfterSeconds = secondsToNextMinute(now);
      _blockedUntil.set(userId, now + retryAfterSeconds * 1000);
      pruneMap(_blockedUntil, now, (v) => v <= now);
      return { limited: true, retryAfterSeconds };
    }
    return { limited: false, retryAfterSeconds: 0 };
  } catch (e) {
    // fail-open: rede fora do ar, função rate_hit ainda não criada no
    // Supabase, resposta inesperada, etc. — nunca bloqueia por causa disso.
    return { limited: false, retryAfterSeconds: 0 };
  }
}
