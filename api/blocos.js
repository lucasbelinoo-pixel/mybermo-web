// api/blocos.js
// Vercel Serverless Function (Node, ESM) — serve os catálogos de imagem dos
// blocos "coloridos" (fábrica) usados na ferramenta de desenho / biblioteca
// de blocos. Antes esses catálogos (~3.4MB de base64) viviam como literais
// gigantes dentro do index.html; foram movidos para lib/blocks.js e passam a
// ser buscados em runtime via fetch('/api/blocos') (ver mbLoadBlocks() no
// index.html).
//
// Autenticação: por enquanto o site inteiro já está atrás de Basic Auth
// (middleware.js / SITE_PASS), o que já protege este endpoint. Autenticação
// por usuário/JWT fica para depois.
import { BERMO_COLOR, BERMO_COLOR_PARTS } from '../lib/blocks.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
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
