import { next } from '@vercel/functions';

// Porta de proteção durante a migração: exige uma senha única (Basic Auth)
// antes de servir QUALQUER coisa do site (inclusive o HTML com as fórmulas).
// Configurada pela variável de ambiente SITE_PASS na Vercel.
// Quando os cálculos estiverem no servidor, basta remover SITE_PASS para liberar
// e passar a depender só do login do Supabase.

export const config = {
  matcher: '/((?!favicon.ico).*)',
};

export default function middleware(request) {
  const PASS = process.env.SITE_PASS;
  if (!PASS) return next(); // sem senha configurada => não bloqueia

  const USER = process.env.SITE_USER || 'bermo';
  const auth = request.headers.get('authorization') || '';
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
