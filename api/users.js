// api/users.js
// Vercel Serverless Function (Node, ESM) — dispatcher ÚNICO para gestão de
// usuários (Supabase Auth + tabela `profiles`). Única function nova (plano
// Hobby limita o número de functions) — todas as ações passam por `action`
// no corpo da requisição, mesmo padrão de api/calc.js.
//
// Por que isto precisa de servidor: criar/excluir usuários e redefinir senha
// exigem a service_role key do Supabase (ignora RLS) — essa chave NUNCA pode
// ir para o navegador. O cliente só manda o access_token da PRÓPRIA sessão
// (Authorization: Bearer ...); este servidor valida esse token, confirma que
// quem chamou é admin (profiles.is_admin, lido com service_role) e só então
// executa a ação pedida com a service_role.
//
// Autenticação em duas camadas: (1) Basic Auth de site inteiro já existente
// (middleware.js/SITE_PASS) protege o endpoint de acesso anônimo externo;
// (2) aqui, por-usuário: token Supabase do chamador + checagem is_admin.
//
// Tabela `profiles` (sql/01_setup.sql): id (=auth.users.id), nome, empresa,
// is_admin, modules (jsonb — array de ids de módulo BLOQUEADOS para aquele
// usuário; mesmo formato que o cliente usa em CURRENT_USER.block/modAllowed
// — ver index.html). Linhas antigas podem ter modules:{} (default da coluna);
// tratamos qualquer valor que não seja array como "nenhum módulo bloqueado".
const SUPABASE_URL = 'https://rzvuokutcuybzwlkmefn.supabase.co'; // mesmo valor de lib/catalogs.js

function normModules(m) {
  return Array.isArray(m) ? m : [];
}

// GET /auth/v1/user — identifica o dono do access_token (não precisa ser
// admin; só confirma que o token é válido e devolve {id,email}).
async function getCallerFromToken(token, serviceKey) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data || !data.id) return null;
  return { id: data.id, email: data.email || '' };
}

// Confere profiles.is_admin do chamador (lido com service_role — não passa
// pela RLS, mas a checagem "é admin?" É a própria substituta da RLS aqui).
async function callerIsAdmin(callerId, serviceKey) {
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(callerId)}&select=is_admin`;
  const res = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) return false;
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows[0] && rows[0].is_admin === true;
}

async function authAdminFetch(path, serviceKey, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...opts,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* resposta não-JSON */ }
  return { ok: res.ok, status: res.status, json };
}

async function restFetch(path, serviceKey, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* resposta não-JSON */ }
  return { ok: res.ok, status: res.status, json };
}

// Mensagem de erro upstream (Supabase) sem nunca ecoar a service_role (a
// chave só viaja em headers de requisição nossos, nunca em corpo de
// resposta do Supabase — mas por segurança nunca fazemos console.log/return
// de headers de requisição, só do corpo de resposta deles).
function upstreamMsg(json, fallback) {
  if (json && typeof json === 'object') {
    return json.msg || json.message || json.error_description || json.error || fallback;
  }
  return fallback;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    res.status(500).json({ error: 'Gestão de usuários indisponível: SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (e) {
    res.status(400).json({ error: 'Corpo da requisição inválido (JSON malformado).' });
    return;
  }
  const { action } = body;

  // ---- autenticação do chamador (camada 2: por-usuário) ----
  const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(authHeader).trim());
  if (!m) {
    res.status(401).json({ error: 'Requisição sem token (Authorization: Bearer <access_token>).' });
    return;
  }
  const token = m[1];

  let caller;
  try {
    caller = await getCallerFromToken(token, serviceKey);
  } catch (e) {
    res.status(401).json({ error: 'Falha ao validar sessão.' });
    return;
  }
  if (!caller) {
    res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    return;
  }

  let isAdmin;
  try {
    isAdmin = await callerIsAdmin(caller.id, serviceKey);
  } catch (e) {
    res.status(500).json({ error: 'Falha ao verificar permissões de administrador.' });
    return;
  }
  if (!isAdmin) {
    res.status(403).json({ error: 'Acesso restrito ao administrador.' });
    return;
  }

  // ---- ações ----
  try {
    if (action === 'list') {
      const [authResp, profResp] = await Promise.all([
        authAdminFetch('/users?per_page=1000', serviceKey),
        restFetch('/profiles?select=id,nome,empresa,is_admin,modules', serviceKey),
      ]);
      if (!authResp.ok) {
        res.status(502).json({ error: 'Falha ao listar usuários (Supabase Auth): ' + upstreamMsg(authResp.json, `HTTP ${authResp.status}`) });
        return;
      }
      const authUsers = Array.isArray(authResp.json) ? authResp.json : (authResp.json && authResp.json.users) || [];
      const profiles = {};
      if (profResp.ok && Array.isArray(profResp.json)) {
        for (const p of profResp.json) profiles[p.id] = p;
      }
      const now = Date.now();
      const users = authUsers.map((u) => {
        const p = profiles[u.id] || {};
        const banned = u.banned_until ? Date.parse(u.banned_until) : 0;
        const ativo = !(banned && banned > now);
        return {
          id: u.id,
          email: u.email || '',
          nome: p.nome || (u.user_metadata && u.user_metadata.nome) || '',
          adm: p.is_admin === true,
          modules: normModules(p.modules),
          ativo,
          criado_em: u.created_at || null,
        };
      });
      users.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.email.localeCompare(b.email));
      res.status(200).json({ users });
      return;
    }

    if (action === 'create') {
      const email = String(body.email || '').trim();
      const senha = String(body.senha || '');
      const nome = String(body.nome || '').trim();
      const adm = !!body.adm;
      const modules = normModules(body.modules);
      if (!email || !senha || !nome) {
        res.status(400).json({ error: 'E-mail, senha e nome são obrigatórios.' });
        return;
      }
      const createResp = await authAdminFetch('/users', serviceKey, {
        method: 'POST',
        body: JSON.stringify({ email, password: senha, email_confirm: true, user_metadata: { nome } }),
      });
      if (!createResp.ok) {
        res.status(400).json({ error: 'Falha ao criar usuário: ' + upstreamMsg(createResp.json, `HTTP ${createResp.status}`) });
        return;
      }
      const newId = createResp.json && createResp.json.id;
      if (!newId) {
        res.status(502).json({ error: 'Usuário criado no Auth, mas a resposta não trouxe o id — verifique manualmente no painel Supabase.' });
        return;
      }
      // upsert em profiles: o gatilho handle_new_user (sql/01_setup.sql) já
      // deve ter criado a linha com nome a partir de user_metadata, mas
      // fazemos upsert explícito para também gravar is_admin/modules (o
      // gatilho não mexe nesses dois campos) e para não depender de timing.
      const profResp = await restFetch('/profiles?on_conflict=id', serviceKey, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{ id: newId, nome, empresa: 'BERMO', is_admin: adm, modules }]),
      });
      if (!profResp.ok) {
        res.status(502).json({ error: 'Usuário criado no Auth, mas falhou ao gravar o perfil (nome/admin/módulos): ' + upstreamMsg(profResp.json, `HTTP ${profResp.status}`) + '. Edite o usuário para corrigir.' });
        return;
      }
      res.status(200).json({ ok: true, id: newId });
      return;
    }

    if (action === 'update') {
      const id = String(body.id || '');
      if (!id) { res.status(400).json({ error: 'id é obrigatório.' }); return; }
      const hasNome = typeof body.nome === 'string';
      const hasAdm = typeof body.adm === 'boolean';
      const hasModules = Array.isArray(body.modules);
      if (!hasNome && !hasAdm && !hasModules) {
        res.status(400).json({ error: 'Nada para atualizar (informe nome, adm e/ou modules).' });
        return;
      }
      if (hasAdm && body.adm === false && id === caller.id) {
        res.status(400).json({ error: 'Você não pode remover sua própria permissão de administrador.' });
        return;
      }
      const patch = {};
      if (hasNome) patch.nome = String(body.nome).trim();
      if (hasAdm) patch.is_admin = body.adm;
      if (hasModules) patch.modules = body.modules;
      const patchResp = await restFetch(`/profiles?id=eq.${encodeURIComponent(id)}`, serviceKey, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
      if (!patchResp.ok) {
        res.status(502).json({ error: 'Falha ao atualizar perfil: ' + upstreamMsg(patchResp.json, `HTTP ${patchResp.status}`) });
        return;
      }
      // mantém user_metadata.nome em sincronia (mbLoadProfileAndEnter usa
      // profiles.nome como fonte principal, mas o metadata é o que o
      // gatilho handle_new_user usa para NOVOS logins/perfis recriados).
      if (hasNome) {
        await authAdminFetch(`/users/${encodeURIComponent(id)}`, serviceKey, {
          method: 'PUT',
          body: JSON.stringify({ user_metadata: { nome: patch.nome } }),
        }).catch(() => {});
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'setpass') {
      const id = String(body.id || '');
      const senha = String(body.senha || '');
      if (!id || !senha) { res.status(400).json({ error: 'id e senha são obrigatórios.' }); return; }
      const r = await authAdminFetch(`/users/${encodeURIComponent(id)}`, serviceKey, {
        method: 'PUT',
        body: JSON.stringify({ password: senha }),
      });
      if (!r.ok) {
        res.status(400).json({ error: 'Falha ao redefinir senha: ' + upstreamMsg(r.json, `HTTP ${r.status}`) });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'setactive') {
      const id = String(body.id || '');
      const ativo = !!body.ativo;
      if (!id) { res.status(400).json({ error: 'id é obrigatório.' }); return; }
      if (!ativo && id === caller.id) {
        res.status(400).json({ error: 'Você não pode desativar sua própria conta.' });
        return;
      }
      // GoTrue não tem um campo "ativo" booleano direto — usa ban_duration
      // (string de duração, ou "none" para reverter). "876000h" ~= 100 anos,
      // na prática equivale a desativado até alguém reativar manualmente.
      const r = await authAdminFetch(`/users/${encodeURIComponent(id)}`, serviceKey, {
        method: 'PUT',
        body: JSON.stringify({ ban_duration: ativo ? 'none' : '876000h' }),
      });
      if (!r.ok) {
        res.status(400).json({ error: 'Falha ao ' + (ativo ? 'reativar' : 'desativar') + ' usuário: ' + upstreamMsg(r.json, `HTTP ${r.status}`) });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'delete') {
      const id = String(body.id || '');
      if (!id) { res.status(400).json({ error: 'id é obrigatório.' }); return; }
      if (id === caller.id) {
        res.status(400).json({ error: 'Você não pode excluir sua própria conta.' });
        return;
      }
      const r = await authAdminFetch(`/users/${encodeURIComponent(id)}`, serviceKey, { method: 'DELETE' });
      if (!r.ok) {
        res.status(400).json({ error: 'Falha ao excluir usuário: ' + upstreamMsg(r.json, `HTTP ${r.status}`) });
        return;
      }
      // defensivo — o FK profiles.id -> auth.users.id (on delete cascade)
      // já deveria ter apagado a linha junto; se por algum motivo não
      // apagou, tentamos aqui também (não falha a operação se der erro).
      await restFetch(`/profiles?id=eq.${encodeURIComponent(id)}`, serviceKey, { method: 'DELETE' }).catch(() => {});
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: `Ação desconhecida: ${action}` });
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
}
