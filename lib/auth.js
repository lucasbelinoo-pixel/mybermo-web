// lib/auth.js
// Helper compartilhado por api/calc.js, api/blocos.js e api/users.js: valida
// o access_token (JWT do Supabase Auth) enviado pelo cliente em
// "Authorization: Bearer <token>" e devolve quem chamou. Esta é a
// substituição, por-usuário, da porta Basic Auth de site inteiro
// (middleware.js/SITE_PASS) — depois que este login por usuário estiver
// validado em produção, o SITE_PASS pode ser removido da Vercel sem deixar
// nenhum endpoint aberto (cada um se autentica por conta própria).
//
// Validação real: GET {SUPABASE_URL}/auth/v1/user com apikey = service_role
// (mesmo padrão já usado em api/users.js). CACHE em escopo de módulo (só
// sobrevive entre invocações "quentes" da mesma function na Vercel — não é
// compartilhado entre functions/instâncias) por hash do token, para não
// bater no GoTrue (Supabase Auth) a cada cálculo. TTL curto (~5min) OU até o
// "exp" do próprio JWT, o que vier primeiro.
//
// Sem SUPABASE_SERVICE_ROLE_KEY configurada: nunca "abre" silenciosamente —
// lança AuthError(500) com mensagem clara, igual ao que api/users.js já
// fazia antes desta refatoração.
const SUPABASE_URL = 'https://rzvuokutcuybzwlkmefn.supabase.co'; // mesmo valor de lib/catalogs.js e api/users.js

const TTL_MS = 5 * 60 * 1000;
const _cache = new Map(); // hash(token) -> { user, exp }

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

// Hash não-criptográfico só para chave de cache (o token em si nunca é
// logado/gravado em lugar nenhum, só usado nos headers da requisição ao
// Supabase e como entrada deste hash).
function hashToken(token) {
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = (Math.imul(31, h) + token.charCodeAt(i)) | 0;
  }
  return h + ':' + token.length;
}

function decodeExpMs(token) {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch (e) {
    return null;
  }
}

function extractToken(req) {
  const authHeader = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(authHeader).trim());
  return m ? m[1] : null;
}

// Valida a sessão do chamador. Lança AuthError(401) se não houver token ou
// se ele for inválido/expirado; AuthError(500) se o servidor não estiver
// configurado (env ausente). Sucesso: { user: {id, email}, token }.
export async function requireUser(req) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new AuthError(500, 'Autenticação indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.');
  }

  const token = extractToken(req);
  if (!token) {
    throw new AuthError(401, 'não autenticado (Authorization: Bearer <access_token> ausente). Faça login novamente.');
  }

  const cacheKey = hashToken(token);
  const now = Date.now();
  const hit = _cache.get(cacheKey);
  if (hit && hit.exp > now) {
    return { user: hit.user, token };
  }

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    throw new AuthError(401, 'não autenticado (falha ao validar sessão). Tente novamente.');
  }
  if (!res.ok) {
    throw new AuthError(401, 'não autenticado (sessão inválida ou expirada). Faça login novamente.');
  }
  const data = await res.json().catch(() => null);
  if (!data || !data.id) {
    throw new AuthError(401, 'não autenticado (sessão inválida ou expirada). Faça login novamente.');
  }
  const user = { id: data.id, email: data.email || '' };

  const jwtExp = decodeExpMs(token);
  const exp = Math.min(now + TTL_MS, jwtExp || (now + TTL_MS));
  _cache.set(cacheKey, { user, exp });
  if (_cache.size > 500) {
    for (const [k, v] of _cache) { if (v.exp <= now) _cache.delete(k); }
  }

  return { user, token };
}

// Confere profiles.is_admin do usuário (lido com service_role — não passa
// pela RLS; é a própria checagem "é admin?"). Usado por api/users.js; fica
// aqui para reuso caso outro endpoint precise da mesma checagem no futuro.
export async function isAdmin(userId) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return false;
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=is_admin`;
  const res = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  if (!res.ok) return false;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] && rows[0].is_admin === true;
}
