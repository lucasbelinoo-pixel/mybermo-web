// api/ia.js
// Vercel Serverless Function (Node, ESM) — PILOTO: revisão de engenharia de
// um desenho P&ID (myBermo) via API da Anthropic. SOMENTE LEITURA: este
// endpoint só LÊ a estrutura do desenho enviada pelo cliente e devolve um
// texto de análise — nunca altera nada no desenho (não há endpoint de
// escrita aqui, e o cliente não aplica nada automaticamente do resultado).
//
// Autenticação + rate limit: MESMO padrão de api/calc.js/api/pdf.js —
// requireUser (obrigatório) e checkRateLimit (lib/rate.js) com o MESMO
// orçamento por usuário (90/min via Postgres, 1500/h em memória) — uma
// análise de desenho conta junto dos cálculos/PDFs, de propósito (pedido
// explícito da rodada): evita que a rota de IA vire um canal paralelo sem
// limite.
//
// Body esperado: { desenho } — objeto JSON estruturado (ver
// mbBuildDesenhoResumo/index.html): { projeto, blocos:[...], conexoes:[...] }.
// NENHUM base64/imagem/coordenada de pixel deveria vir aqui (o cliente já
// filtra isso) — mas o limite de tamanho abaixo (200KB, no texto serializado
// de `desenho`) é a proteção do lado do servidor contra payloads grandes
// demais (custo de tokens da API da Anthropic, tempo de function).
//
// Chamada à API da Anthropic: POST https://api.anthropic.com/v1/messages,
// headers x-api-key (server-side, NUNCA exposto ao cliente — só existe na
// env da Vercel), anthropic-version fixo em '2023-06-01', content-type
// json. Modelo configurável via env IA_MODEL (default abaixo) justamente
// porque o id exato de modelo muda com o tempo — se a Anthropic devolver
// "modelo desconhecido", o erro chega LEGÍVEL ao cliente (não é engolido)
// para ajustar a env sem precisar mexer em código.
//
// Erros: sem ANTHROPIC_API_KEY -> 503 "IA não configurada neste ambiente."
// (fail-closed claro, não finge que funciona). Erro da API Anthropic ->
// repassa o status HTTP + a mensagem de erro dela (nunca o corpo cru, nunca
// a própria API key). maxDuration 60 (chamada de LLM pode levar alguns
// segundos, folga generosa).
import { requireUser, AuthError } from '../lib/auth.js';
import { checkRateLimit } from '../lib/rate.js';

export const maxDuration = 60;

const MAX_DESENHO_LEN = 200000; // ~200KB no JSON serializado de `desenho`
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-6'; // configurável via env IA_MODEL — ver comentário de topo

// Prompt de sistema — engenheiro sênior de vapor/utilidades revisando um
// P&ID montado no myBermo. Pedido explícito: NÃO inventar componentes que
// não estão no JSON recebido; responder em português; formato de achados
// com severidade + título curto + explicação (1-2 frases) + onde (TAGs).
const SYSTEM_PROMPT = `Você é um engenheiro sênior de sistemas de vapor e utilidades industriais, revisando um diagrama de processo e instrumentação (P&ID) montado na ferramenta myBermo.

Você vai receber, em JSON, um resumo do desenho: a lista de componentes ("blocos", cada um com tag, tipo, grupo quando fizer parte de um agrupamento, e pressão/vazão/observações quando o usuário preencheu esses dados) e a lista de conexões entre componentes (pares de tags/ids, ou a string "linha sem conexão definida" para linhas soltas, sem as duas pontas ligadas).

Analise o desenho e aponte, quando aplicável:
- Componentes de proteção ou drenagem que podem estar faltando (ex.: purgador em ponto baixo/coletor de condensado, válvula de segurança logo após uma válvula redutora de pressão, filtro/strainer antes de equipamentos sensíveis, linha de bypass em válvulas críticas).
- Coerência de TAGs (tags duplicadas entre componentes, componentes sem tag).
- Coerência de pressões e vazões entre componentes conectados (ex.: pressão/vazão de saída de um componente muito diferente da entrada do componente seguinte).
- Boas práticas gerais de projeto de tubulação de vapor e condensado.

REGRA IMPORTANTE: baseie-se SOMENTE no que está descrito no JSON recebido. NÃO invente componentes, conexões ou valores que não constam ali. Se um dado (pressão/vazão) não foi informado para um componente, não presuma um valor — apenas mencione a ausência da informação se isso for relevante para a análise.

Responda em português. Formato: uma lista de achados, um por parágrafo, cada um assim:
**[SEVERIDADE] Título curto** — explicação de 1 a 2 frases. Onde: TAGs/blocos envolvidos.
(SEVERIDADE é ALTA, MÉDIA ou BAIXA.)

Se o desenho estiver tecnicamente correto e completo dentro do que foi informado, diga isso explicitamente no início e destaque o que está bem resolvido, antes de eventuais achados menores.`;

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

  // Mesmo rate limit (e mesmo orçamento) de /api/calc e /api/pdf — ver
  // comentário de topo. Fail-open em qualquer erro da checagem em si
  // (checkRateLimit já é fail-open internamente).
  try {
    const rl = await checkRateLimit(user && user.id);
    if (rl.limited) {
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      res.status(429).json({ error: 'Muitos pedidos em sequência. Aguarde alguns instantes e tente novamente.' });
      return;
    }
  } catch (e) {
    console.error('api/ia: falha ao checar rate limit (fail-open)', e);
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch (e) {
    res.status(400).json({ error: 'corpo inválido (JSON esperado)' });
    return;
  }
  const desenho = body && body.desenho;
  if (!desenho || typeof desenho !== 'object') {
    res.status(400).json({ error: 'desenho ausente' });
    return;
  }
  let desenhoJson;
  try {
    desenhoJson = JSON.stringify(desenho);
  } catch (e) {
    res.status(400).json({ error: 'desenho inválido (não serializável)' });
    return;
  }
  if (desenhoJson.length > MAX_DESENHO_LEN) {
    res.status(413).json({ error: `desenho excede o tamanho máximo (${MAX_DESENHO_LEN} caracteres).` });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'IA não configurada neste ambiente.' });
    return;
  }
  const model = process.env.IA_MODEL || DEFAULT_MODEL;

  let anthResp;
  try {
    anthResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: desenhoJson }],
      }),
    });
  } catch (e) {
    console.error('api/ia: falha ao contatar a API da Anthropic', e);
    res.status(502).json({ error: 'Falha ao contatar o serviço de IA. Tente novamente em instantes.' });
    return;
  }

  const data = await anthResp.json().catch(() => null);
  if (!anthResp.ok) {
    // Repassa a mensagem de erro da Anthropic (nunca a API key, nunca
    // headers) — objetivo explícito: se for "modelo desconhecido" (env
    // IA_MODEL desatualizada), o texto chega legível pra corrigir a env.
    const msg = (data && data.error && data.error.message)
      ? data.error.message
      : `Erro do serviço de IA (HTTP ${anthResp.status}).`;
    const status = (anthResp.status >= 400 && anthResp.status < 600) ? anthResp.status : 502;
    res.status(status).json({ error: msg });
    return;
  }

  const texto = (data && Array.isArray(data.content) && data.content[0] && typeof data.content[0].text === 'string')
    ? data.content[0].text
    : '';
  if (!texto) {
    res.status(502).json({ error: 'Resposta da IA em formato inesperado.' });
    return;
  }
  res.status(200).json({ texto });
}
