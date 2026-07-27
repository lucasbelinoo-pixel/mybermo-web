// api/pdf.js
// Vercel Serverless Function (Node, ESM) — gera o PDF de UMA folha de dados
// (FD) a partir do HTML já renderizado no cliente (o mesmo HTML salvo por
// _fdHtmlSave/fdSync — ver index.html, logFD()). Usado por
// window.mbProjBaixarFDs (index.html) para baixar o ZIP de FDs do projeto em
// PDF em vez de HTML "cru" (comportamento anterior, mantido como fallback —
// ver comentário em mbProjBaixarFDs).
//
// Autenticação: exige sessão Supabase válida, MESMO padrão de api/calc.js
// (Authorization: Bearer <access_token>, ver lib/auth.js#requireUser).
// Rate limit: reusa lib/rate.js#checkRateLimit — a MESMA contagem de
// /api/calc (90/min via Postgres, 1500/h em memória, por usuário). Gerar PDF
// é bem mais pesado que um cálculo comum; compartilhar o mesmo orçamento é
// deliberado (pedido explícito da rodada que criou este endpoint) — evita
// que alguém contorne o rate limit de cálculo simplesmente batendo em
// /api/pdf em loop, e também limita quantos PDFs (cada um com um Chromium
// efêmero) um usuário consegue gerar em sequência.
//
// SEGURANÇA — o HTML recebido é, na prática, sempre a FD do PRÓPRIO usuário
// autenticado (o cliente só chama isto a partir de mbProjBaixarFDs, com o
// html que ELE MESMO gerou e salvou), mas ainda assim é renderizado num
// Chromium do servidor — por isso, antes de setContent():
//   - page.setJavaScriptEnabled(false): a FD é puramente estática (texto,
//     tabelas, SVG/canvas já "congelados" em data: URL quando aplicável) —
//     desligar JS elimina qualquer risco de um <script> (por engano ou
//     manipulação do HTML salvo) rodar no Chromium do servidor.
//   - page.setRequestInterception(true) + abort de qualquer request cujo
//     protocolo seja http:/https: — as imagens de uma FD são sempre data:
//     URLs (ver _fdHtmlSave/fdSync, index.html), então nenhuma requisição de
//     rede legítima deveria sair da página; isso fecha a porta pra SSRF a
//     partir do Chromium do servidor (ex.: HTML apontando <img src="http://
//     ip-interno/...">). data:/blob:/about: continuam liberados (é o que a
//     FD usa de verdade).
//
// LIMITES: html até ~400KB (MAX_HTML_LEN abaixo — mesmo teto usado no
// cliente por _fdHtmlSave/fdSync para o que é salvo/sincronizado por FD, ver
// index.html); maxDuration 60s (cold start do Chromium + render podem ser
// lentos na primeira invocação "fria" da function).
//
// VERSÕES — puppeteer-core + @sparticuz/chromium, par declarado e testado:
//   @sparticuz/chromium@147.0.0  (as próprias devDependencies do pacote,
//     publicadas no npm, fixam "puppeteer-core": "^24.40.0" — ou seja, é o
//     par que o PRÓPRIO pacote testa)
//   puppeteer-core@24.40.0
// Escolha DELIBERADAMENTE conservadora, não a mais recente disponível
// (latest hoje: chromium@149.0.0 / puppeteer-core@25.4.0): a partir de
// @sparticuz/chromium@148.0.0 o engines.node exigido sobe para
// "^22.17.0 || >=24.0.0"; este projeto não tem vercel.json nem
// package.json#engines fixando a versão de Node da Vercel, então não há
// como garantir aqui que o projeto vai rodar em Node ≥22.17 — usar a versão
// mais nova arriscaria quebrar o build/runtime inteiro se a function
// estiver em Node 20.x (ainda comum/pode ser o padrão do projeto). Já
// @sparticuz/chromium@147.0.0 exige só node ">=20.11.0", compatível tanto
// com Node 20 quanto 22/24 — ver relatório da rodada para o que só o deploy
// confirma (versão real de Node usada pela function, tamanho do bundle
// dentro do limite da Vercel, memória disponível etc.).
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { requireUser, AuthError } from '../lib/auth.js';
import { checkRateLimit } from '../lib/rate.js';

export const maxDuration = 60;

const MAX_HTML_LEN = 400000; // mesmo cap de _fdHtmlSave/fdSync (index.html)

// Reduz o ruído visual (fundo animado/gráficos) que a FD não precisa no PDF.
chromium.setGraphicsMode = false;

// Cache em escopo de módulo: reusa o browser entre invocações "quentes" da
// mesma instância de function (cold start do Chromium é o custo caro aqui).
// Não é compartilhado entre instâncias concorrentes — cada uma tem o seu.
let _browserPromise = null;

async function getBrowser() {
  if (_browserPromise) {
    try {
      const b = await _browserPromise;
      if (b && b.connected) return b;
    } catch (e) {
      // browser anterior morreu/desconectou — relança abaixo
    }
    _browserPromise = null;
  }
  _browserPromise = puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: 'shell' }),
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
  try {
    return await _browserPromise;
  } catch (e) {
    _browserPromise = null; // não guarda um launch falho em cache
    throw e;
  }
}

// Bloqueia qualquer request de rede real feita pela página (SSRF hardening
// — ver comentário de topo). data:/blob:/about: (o que a FD realmente usa)
// continuam liberados.
function blockExternalRequests(page) {
  return page.setRequestInterception(true).then(() => {
    page.on('request', (req) => {
      const url = req.url();
      if (/^https?:\/\//i.test(url)) {
        req.abort().catch(() => {});
      } else {
        req.continue().catch(() => {});
      }
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let user;
  try {
    ({ user } = await requireUser(req));
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    res.status(status).json({ error: (err && err.message) || 'não autenticado' });
    return;
  }

  // Mesmo rate limit (e mesmo orçamento) de /api/calc — ver comentário de
  // topo. Fail-open em qualquer erro da checagem em si (checkRateLimit já é
  // fail-open internamente).
  try {
    const rl = await checkRateLimit(user && user.id);
    if (rl.limited) {
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      res.status(429).json({ error: 'Muitos pedidos em sequência. Aguarde alguns instantes e tente novamente.' });
      return;
    }
  } catch (e) {
    console.error('api/pdf: falha ao checar rate limit (fail-open)', e);
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (e) {
    res.status(400).json({ error: 'corpo inválido (JSON esperado)' });
    return;
  }
  const html = body && body.html;
  if (!html || typeof html !== 'string') {
    res.status(400).json({ error: 'html ausente' });
    return;
  }
  if (html.length > MAX_HTML_LEN) {
    res.status(413).json({ error: `html excede o tamanho máximo (${MAX_HTML_LEN} caracteres).` });
    return;
  }

  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setJavaScriptEnabled(false); // FD é estática — ver comentário de topo
    await blockExternalRequests(page);
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.status(200).send(Buffer.from(pdf));
  } catch (err) {
    console.error('api/pdf: falha ao gerar PDF', err);
    res.status(500).json({ error: (err && err.message) || 'falha ao gerar PDF' });
  } finally {
    if (page) { try { await page.close(); } catch (e) {} }
  }
}
