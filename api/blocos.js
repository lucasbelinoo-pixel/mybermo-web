// api/blocos.js
// Vercel Serverless Function (Node, ESM) — serve os catálogos de imagem dos
// blocos "coloridos" (fábrica) usados na ferramenta de desenho / biblioteca
// de blocos. Antes esses catálogos (~3.4MB de base64) viviam como literais
// gigantes dentro do index.html; foram movidos para lib/blocks.js e passam a
// ser buscados em runtime via mbApiFetch('/api/blocos') (ver mbLoadBlocks()
// no index.html — disparado só após login, nunca mais no boot da página).
//
// Autenticação: exige sessão Supabase válida (Authorization: Bearer
// <access_token>, ver lib/auth.js#requireUser) — substitui a antiga
// dependência exclusiva da porta Basic Auth de site inteiro (middleware.js/
// SITE_PASS), que pode ser removida da Vercel depois de validado em produção.
import { BERMO_COLOR, BERMO_COLOR_PARTS } from '../lib/blocks.js';
import { requireUser, AuthError } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    await requireUser(req);
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    res.status(status).json({ error: (err && err.message) || 'não autenticado' });
    return;
  }

  try {
    // Cache no browser/CDN — dados estáticos, não mudam entre deploys.
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.status(200).json({ BERMO_COLOR, BERMO_COLOR_PARTS });
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
}
