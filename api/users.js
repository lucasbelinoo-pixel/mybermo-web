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
// Autenticação em duas camadas: (1) por-usuário, via lib/auth.js#requireUser
// (token Supabase do chamador) + checagem is_admin (lib/auth.js#isAdmin) —
// esta é a autenticação REAL do endpoint; (2) Basic Auth de site inteiro
// (middleware.js/SITE_PASS), enquanto ainda existir, é só uma camada extra
// que o usuário pode remover a qualquer momento sem quebrar isto aqui
// (middleware.js já deixa passar Bearer em qualquer /api/*).
//
// Tabela `profiles` (sql/01_setup.sql): id (=auth.users.id), nome, empresa,
// is_admin, modules (jsonb — array de ids de módulo BLOQUEADOS para aquele
// usuário; mesmo formato que o cliente usa em CURRENT_USER.block/modAllowed
// — ver index.html). Linhas antigas podem ter modules:{} (default da coluna);
// tratamos qualquer valor que não seja array como "nenhum módulo bloqueado".
// multi_login (boolean, default false): política de LOGIN ÚNICO — por
// padrão, logar numa máquina nova derruba as sessões anteriores do mesmo
// usuário (ver mbLoadProfileAndEnter/MB.sb.auth.signOut({scope:'others'}) em
// index.html); exceções: admins (sempre) e quem tem multi_login=true aqui.
import { requireUser, isAdmin, AuthError } from '../lib/auth.js';

const SUPABASE_URL = 'https://rzvuokutcuybzwlkmefn.supabase.co'; // mesmo valor de lib/catalogs.js e lib/auth.js

function normModules(m) {
  return Array.isArray(m) ? m : [];
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

  // Gestão de usuários exige a service_role key (única forma de criar/
  // excluir usuários e redefinir senha) — requireUser() abaixo já checa isso
  // e lança 500 com mensagem clara se a env não estiver configurada, então
  // não duplicamos a checagem aqui.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (e) {
    res.status(400).json({ error: 'Corpo da requisição inválido (JSON malformado).' });
    return;
  }
  const { action } = body;

  // ---- autenticação do chamador (camada 1: por-usuário; ver lib/auth.js) ----
  let caller;
  try {
    ({ user: caller } = await requireUser(req));
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    res.status(status).json({ error: (err && err.message) || 'não autenticado' });
    return;
  }

  let admin;
  try {
    admin = await isAdmin(caller.id);
  } catch (e) {
    res.status(500).json({ error: 'Falha ao verificar permissões de administrador.' });
    return;
  }
  if (!admin) {
    res.status(403).json({ error: 'Acesso restrito ao administrador.' });
    return;
  }

  // ---- ações ----
  try {
    if (action === 'list') {
      const [authResp, profResp] = await Promise.all([
        authAdminFetch('/users?per_page=1000', serviceKey),
        restFetch('/profiles?select=id,nome,empresa,is_admin,modules,multi_login', serviceKey),
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
          multiLogin: p.multi_login === true,
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
      const hasMultiLogin = typeof body.multi_login === 'boolean';
      if (!hasNome && !hasAdm && !hasModules && !hasMultiLogin) {
        res.status(400).json({ error: 'Nada para atualizar (informe nome, adm, modules e/ou multi_login).' });
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
      // Login único (política de sessão, ver mbLoadProfileAndEnter em
      // index.html): admins NUNCA são derrubados (independente deste flag);
      // para os demais, multi_login=true é a única exceção que permite mais
      // de uma sessão ativa ao mesmo tempo.
      if (hasMultiLogin) patch.multi_login = body.multi_login;
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
