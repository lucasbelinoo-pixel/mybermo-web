// api/ia.js
// Vercel Serverless Function (Node, ESM) — PILOTO de IA no desenho P&ID do
// myBermo, via API da Anthropic. Dois modos, escolhidos por body.acao:
//
//  - acao:'analisar' (Fase 1, default se acao ausente p/ compatibilidade
//    com o cliente anterior): SOMENTE LEITURA — recebe um resumo do desenho
//    e devolve um texto de análise. Nunca altera nada.
//
//  - acao:'montar' (Fase 2): recebe um pedido em texto livre + o catálogo de
//    blocos disponíveis (enviado pelo CLIENTE) e devolve um PLANO estruturado
//    (blocos + conexões) para o cliente pré-visualizar e, só se o usuário
//    confirmar, inserir no desenho como rascunho editável. Este endpoint
//    NUNCA insere nada sozinho — só propõe. Toda validação de que o plano é
//    utilizável (ids existem no catálogo enviado, índices de conexão válidos,
//    limite de blocos) acontece aqui, no servidor, antes de devolver ao
//    cliente — resposta inválida vira 422 com o problema, nunca é repassada
//    como se fosse válida.
//
// Autenticação + rate limit: MESMO padrão de api/calc.js — requireUser
// (obrigatório) e checkRateLimit (lib/rate.js) com o MESMO orçamento por
// usuário, compartilhado entre os dois modos (de propósito: evita que a
// rota de IA vire um canal paralelo sem limite).
//
// Chamada à API da Anthropic: POST https://api.anthropic.com/v1/messages,
// headers x-api-key (server-side, NUNCA exposto ao cliente — só existe na
// env da Vercel), anthropic-version fixo em '2023-06-01', content-type
// json. Modelo configurável via env IA_MODEL (default abaixo).
//
// Erros: sem ANTHROPIC_API_KEY -> 503 "IA não configurada neste ambiente."
// (fail-closed claro, não finge que funciona). Erro da API Anthropic ->
// repassa o status HTTP + a mensagem de erro dela (nunca o corpo cru, nunca
// a própria API key). maxDuration 60 (chamada de LLM pode levar alguns
// segundos, folga generosa).
import { requireUser, AuthError } from '../lib/auth.js';
import { checkRateLimit } from '../lib/rate.js';

export const maxDuration = 60;

const MAX_DESENHO_LEN = 200000; // ~200KB no JSON serializado de `desenho` (modo analisar)
const MAX_CATALOGO_ITENS = 400; // modo montar — mesmo limite combinado com o cliente
const MAX_CATALOGO_LEN = 50000; // ~50KB no JSON serializado do catálogo (modo montar)
const MAX_PEDIDO_LEN = 4000; // caracteres do pedido em texto livre (modo montar)
const MAX_BLOCOS_PLANO = 40; // teto de componentes num plano proposto
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-6'; // configurável via env IA_MODEL — ver comentário de topo

// ---------------------------------------------------------------- analisar
const SYSTEM_PROMPT_ANALISAR = `Você é um engenheiro sênior de sistemas de vapor e utilidades industriais, revisando um diagrama de processo e instrumentação (P&ID) montado na ferramenta myBermo.

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

async function handleAnalisar(req, res, body) {
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
        system: SYSTEM_PROMPT_ANALISAR,
        messages: [{ role: 'user', content: desenhoJson }],
      }),
    });
  } catch (e) {
    console.error('api/ia (analisar): falha ao contatar a API da Anthropic', e);
    res.status(502).json({ error: 'Falha ao contatar o serviço de IA. Tente novamente em instantes.' });
    return;
  }

  const data = await anthResp.json().catch(() => null);
  if (!anthResp.ok) {
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

// ------------------------------------------------------------------ montar
const SYSTEM_PROMPT_MONTAR = `Você monta P&IDs na ferramenta myBermo. Receberá um pedido em português e o catálogo de blocos disponíveis (id -> nome). Responda SOMENTE com JSON válido no formato: {"blocos":[{"id":"<id do catálogo>","tag":"<TAG sugerida ex CV-01>","obs":"<opcional>"}...], "conexoes":[[0,1],[1,2]...], "explicacao":"<1-3 frases do que montou e por quê>"} — conexoes são pares de ÍNDICES do array blocos, na ordem do fluxo (entrada->saída). Use APENAS ids que existem no catálogo; escolha componentes tecnicamente corretos para o pedido (ex.: estação de redução: bloqueio -> filtro -> redutora -> PSV/manômetro conforme boa prática -> bloqueio, bypass se pedido); TAGs no padrão do componente (CV/PG/PSV/FT...). Se o pedido for impossível com o catálogo, responda {"erro":"<explicação curta>"}.`;

// Extrai um objeto JSON do texto bruto devolvido pelo modelo, tolerante a
// cercas de código markdown (```json ... ``` ou ``` ... ```) ao redor do
// JSON e a texto extra antes/depois do objeto.
function extrairJson(texto) {
  if (typeof texto !== 'string' || !texto.trim()) return null;
  let t = texto.trim();
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca && cerca[1]) t = cerca[1].trim();
  try {
    return JSON.parse(t);
  } catch (e) {
    // fallback: recorta do primeiro '{' ao último '}' e tenta de novo —
    // cobre texto extra antes/depois do JSON que o modelo às vezes acrescenta
    const ini = t.indexOf('{');
    const fim = t.lastIndexOf('}');
    if (ini >= 0 && fim > ini) {
      try {
        return JSON.parse(t.slice(ini, fim + 1));
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

// Valida o plano já parseado (não o texto bruto). Retorna {ok:true} ou
// {ok:false, error:<mensagem clara do problema>}.
function validarPlano(plano, catalogIds) {
  if (!plano || typeof plano !== 'object' || Array.isArray(plano)) {
    return { ok: false, error: 'resposta da IA não é um objeto JSON válido.' };
  }
  if (!Array.isArray(plano.blocos)) {
    return { ok: false, error: 'plano sem lista "blocos" válida.' };
  }
  if (plano.blocos.length === 0) {
    return { ok: false, error: 'plano não propôs nenhum bloco.' };
  }
  if (plano.blocos.length > MAX_BLOCOS_PLANO) {
    return { ok: false, error: `plano excede o limite de ${MAX_BLOCOS_PLANO} blocos (propôs ${plano.blocos.length}).` };
  }
  for (let i = 0; i < plano.blocos.length; i++) {
    const b = plano.blocos[i];
    if (!b || typeof b !== 'object') {
      return { ok: false, error: `bloco #${i} inválido (não é um objeto).` };
    }
    if (typeof b.id !== 'string' || !b.id) {
      return { ok: false, error: `bloco #${i} sem "id".` };
    }
    if (!catalogIds.has(b.id)) {
      return { ok: false, error: `bloco #${i} usa id "${b.id}", que não existe no catálogo enviado.` };
    }
    if (typeof b.tag !== 'string' || !b.tag.trim()) {
      return { ok: false, error: `bloco #${i} (id "${b.id}") sem "tag".` };
    }
    if (b.obs != null && typeof b.obs !== 'string') {
      return { ok: false, error: `bloco #${i} (id "${b.id}") com "obs" inválida.` };
    }
  }
  if (plano.conexoes != null) {
    if (!Array.isArray(plano.conexoes)) {
      return { ok: false, error: 'plano com "conexoes" inválida (esperado array de pares).' };
    }
    for (let i = 0; i < plano.conexoes.length; i++) {
      const c = plano.conexoes[i];
      if (!Array.isArray(c) || c.length !== 2) {
        return { ok: false, error: `conexão #${i} inválida (esperado par [origem, destino]).` };
      }
      const [a, z] = c;
      if (!Number.isInteger(a) || !Number.isInteger(z)) {
        return { ok: false, error: `conexão #${i} com índices não inteiros.` };
      }
      if (a < 0 || a >= plano.blocos.length || z < 0 || z >= plano.blocos.length) {
        return { ok: false, error: `conexão #${i} referencia índice fora do plano (0..${plano.blocos.length - 1}).` };
      }
      if (a === z) {
        return { ok: false, error: `conexão #${i} liga um bloco a ele mesmo.` };
      }
    }
  }
  if (plano.explicacao != null && typeof plano.explicacao !== 'string') {
    return { ok: false, error: 'plano com "explicacao" inválida.' };
  }
  return { ok: true };
}

async function handleMontar(req, res, body) {
  const pedido = typeof body.pedido === 'string' ? body.pedido.trim() : '';
  if (!pedido) {
    res.status(400).json({ error: 'pedido ausente ou vazio.' });
    return;
  }
  if (pedido.length > MAX_PEDIDO_LEN) {
    res.status(413).json({ error: `pedido excede o tamanho máximo (${MAX_PEDIDO_LEN} caracteres).` });
    return;
  }

  const catalogo = body.catalogo;
  if (!Array.isArray(catalogo) || catalogo.length === 0) {
    res.status(400).json({ error: 'catálogo ausente ou vazio.' });
    return;
  }
  if (catalogo.length > MAX_CATALOGO_ITENS) {
    res.status(400).json({ error: `catálogo excede o limite de itens (máx. ${MAX_CATALOGO_ITENS}).` });
    return;
  }
  const catalogIds = new Set();
  for (let i = 0; i < catalogo.length; i++) {
    const it = catalogo[i];
    if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !it.id) {
      res.status(400).json({ error: `item #${i} do catálogo inválido (esperado {id,label}).` });
      return;
    }
    catalogIds.add(it.id);
  }
  let catalogoJson;
  try {
    catalogoJson = JSON.stringify(catalogo);
  } catch (e) {
    res.status(400).json({ error: 'catálogo inválido (não serializável).' });
    return;
  }
  if (catalogoJson.length > MAX_CATALOGO_LEN) {
    res.status(413).json({ error: `catálogo excede o tamanho máximo (${MAX_CATALOGO_LEN} caracteres).` });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'IA não configurada neste ambiente.' });
    return;
  }
  const model = process.env.IA_MODEL || DEFAULT_MODEL;

  const userMsg = JSON.stringify({ pedido, catalogo });

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
        max_tokens: 3000,
        system: SYSTEM_PROMPT_MONTAR,
        messages: [{ role: 'user', content: userMsg }],
      }),
    });
  } catch (e) {
    console.error('api/ia (montar): falha ao contatar a API da Anthropic', e);
    res.status(502).json({ error: 'Falha ao contatar o serviço de IA. Tente novamente em instantes.' });
    return;
  }

  const data = await anthResp.json().catch(() => null);
  if (!anthResp.ok) {
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

  const parsed = extrairJson(texto);
  if (!parsed || typeof parsed !== 'object') {
    res.status(422).json({ error: 'não foi possível interpretar a resposta da IA como JSON.' });
    return;
  }

  // Modelo reportou que o pedido é impossível com o catálogo enviado — não
  // é um erro de validação nosso, é repassado para o cliente mostrar a
  // explicação (guard #3 do pedido da rodada).
  if (typeof parsed.erro === 'string' && parsed.erro) {
    res.status(200).json({ erro: parsed.erro });
    return;
  }

  const val = validarPlano(parsed, catalogIds);
  if (!val.ok) {
    res.status(422).json({ error: val.error });
    return;
  }

  res.status(200).json({
    plano: {
      blocos: parsed.blocos,
      conexoes: Array.isArray(parsed.conexoes) ? parsed.conexoes : [],
      explicacao: typeof parsed.explicacao === 'string' ? parsed.explicacao : '',
    },
  });
}

// --------------------------------------------------------------- handler
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

  // Mesmo rate limit (e mesmo orçamento) de /api/calc — compartilhado entre
  // os dois modos de propósito (ver comentário de topo). Fail-open em
  // qualquer erro da checagem em si (checkRateLimit já é fail-open
  // internamente).
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

  const acao = body && body.acao === 'montar' ? 'montar' : 'analisar';
  if (acao === 'montar') {
    await handleMontar(req, res, body || {});
  } else {
    await handleAnalisar(req, res, body || {});
  }
}
