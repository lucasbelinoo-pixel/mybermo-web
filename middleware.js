import { next } from '@vercel/functions';

// Porta de proteção durante a migração: exige uma senha única (Basic Auth)
// antes de servir QUALQUER coisa do site (inclusive o HTML com as fórmulas).
// Configurada pela variável de ambiente SITE_PASS na Vercel.
//
// PASSO FINAL da migração: TODOS os endpoints /api/* agora se autenticam
// sozinhos por usuário (Authorization: Bearer <access_token do Supabase>,
// ver lib/auth.js#requireUser, usado por api/calc.js, api/blocos.js e
// api/users.js). Por isso o bypass abaixo vale para /api/* inteiro (antes só
// valia para /api/users): isto evita o conflito Basic×Bearer (o mesmo
// cabeçalho Authorization não pode carregar as duas credenciais ao mesmo
// tempo) enquanto SITE_PASS ainda existir, SEM depender de um novo deploy
// para o usuário poder remover SITE_PASS na Vercel quando quiser — a partir
// daí o site abre direto na tela de login do app, e cada /api/* já exige
// sessão válida por conta própria.

export const config = {
  matcher: '/((?!favicon.ico).*)',
};

export default function middleware(request) {
  const PASS = process.env.SITE_PASS;
  if (!PASS) return next(); // sem senha configurada => não bloqueia

  const USER = process.env.SITE_USER || 'bermo';
  const auth = request.headers.get('authorization') || '';

  // /api/* usa o MESMO cabeçalho Authorization para o token do Supabase
  // (Bearer), o que sobrescreve a credencial Basic da porta e fazia o
  // navegador pedir senha de novo. Deixa passar: cada endpoint valida o
  // token por conta própria (requireUser, lib/auth.js) — autenticação mais
  // forte, por usuário, no lugar da senha única do site inteiro.
  try {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/') && auth.startsWith('Bearer ')) return next();
  } catch (e) {}

  if (auth.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6));
      const i = decoded.indexOf(':');
      const u = decoded.slice(0, i);
      const p = decoded.slice(i + 1);
      if (u === USER && p === PASS) return next();
    } catch (e) {}
  }
  return new Response('Autenticação necessária', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="myBermo", charset="UTF-8"' },
  });
}
