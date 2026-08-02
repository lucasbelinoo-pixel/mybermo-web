# Auditoria — fórmulas de engenharia ainda presentes no cliente (index.html)

> **Atualização (ETAPA 2, Bloco 0 + Bloco 1)** — ver seção "BLOCO 0 — resultado
> do rastreio de confirmação" e "BLOCO 1 — remoção de código morto" ao final
> deste arquivo. O restante do documento abaixo é a auditoria original
> (somente leitura) e permanece válido para as categorias B/C/D.

Somente leitura na auditoria original. Nenhum código foi alterado naquela
etapa. `git status` deve mostrar `audit_formulas.md` como o ÚNICO arquivo
novo/modificado além de `index.html` (Bloco 1 já alterou `index.html`,
propositalmente) — não commitar.

Contexto confirmado nesta auditoria:
- Todos os 14 módulos secundários (tanque, perdatub, bicoinj, sensortemp,
  flash, efluente, veloc, condens, custovap, tubvapor, tubagua, restub,
  dessuper) e os módulos principais (reduc/reducSuper/reducAr/reducAgua,
  purg, psv, matcurve, steamprops, unitconv) **já fazem** `fetch('/api/calc',
  {module:'X',...})` e usam a resposta do servidor para o painel de
  resultado principal. Ou seja: nenhum módulo está "100% no cliente" hoje.
- O que sobrou no cliente não é (na maior parte) o cálculo principal, e sim:
  (1) um "núcleo compartilhado" de fórmulas de `lib/engine.js` duplicadas
  localmente para alimentar selects/validação/preview síncronos antes (ou
  em vez) do round-trip ao servidor; (2) helpers específicos de alguns
  módulos que constroem GRÁFICOS (séries com dezenas de pontos, varrendo um
  parâmetro) ou FOLHAS TÉCNICAS/relatórios imprimíveis que o servidor não
  expõe como série — só como ponto único.

Método: para cada função nomeada pelo coordenador (e para uma amostra
representativa do núcleo compartilhado) tracei o grafo de chamadas real via
grep (quem chama quem) e comparei com o que `lib/engine.js`/`api/calc.js`
já retornam, para decidir se dá para trocar por `data.<campo>` do servidor.

---

## 1) Núcleo compartilhado (client ⟷ `lib/engine.js`, duplicado)

Cruzando os nomes de função exportados por `lib/engine.js` (91 no total)
contra definições locais em `index.html`, **39 têm cópia local**:

```
aberturaFrac, aguaDpChoked, aguaRhoT, aguaSG, aguaVol, arRho, arWmass, arXt,
bicoQ, brzCapKgh, calcBronze, calcValv, calcValvANSI, colSeqAgua,
colSeqVapor, cvReq, cvReqAgua, cvReqAr, fluxoAgua, injCap, interp, interpC,
isBorboleta, kdrLineVapor, khSup, parseInch, pipeArea, pmaxValv, psvOverNum,
rOfT, sortedSizes, steamHg, steamHl, steamLookup, steamLookupT, tOfR,
valveAbas, vaporVolSup, vaporVolWet, xtDefault
```
+ 3 declaradas como `const fn = (...)=>...` que o grep de `function` não
pegou: `vaporTemp` (linha 2009), `vaporPress` (2010), `ATM` (2012).

Todas ficam no primeiro `<script>` grande (linhas ~1687–5930), no mesmo
escopo léxico top-level de `admSave`, `renderValv`, etc. — acessíveis por
identificador "puro" de qualquer outro `<script>` da página (mesmo padrão
já mapeado em rounds anteriores).

**Papel real hoje** (confirmado nos módulos que tracei a fundo; ver §2/§3):
não alimentam mais o painel principal de resultado (que já lê `data.*` do
servidor) — servem para (a) popular/filtrar selects e validar entradas
*antes* do fetch (ex.: `modelsForTab`, `flValvPick`, `flFillValv`,
`aberturaFrac`), e (b) alimentar gráficos/folhas técnicas que precisam de
várias amostras (ex.: `vaporTemp`/`steamHl`/`steamHg` dentro de
`purgSheetHTML`, `kshReport`, `chartLoss`).

**Categoria**: majoritariamente **B** (o valor final já vem do servidor;
o que resta é conveniência de UI/latência) com uma franja **C** onde
alimentam gráfico/folha técnica sem endpoint de série no servidor (ver §3).
Não tracei individualmente as 39 — é o primeiro item da fila de execução
(ver §4, bloco 0): repetir para cada uma o mesmo grep de "quem chama" antes
de decidir remover.

---

## 2) Itens citados pelo coordenador — rastreados a fundo

### `bare()` — index.html:9763 (módulo "Perdas em tubulações" / isolamento)
- Chama `hAir()` (9752).
- **Nenhum call-site além da própria definição.** `computePerdaTub`
  (servidor) já calcula e retorna `data.bare` — é isso que
  `window.perdaTubCalc` (9835) renderiza.
- **Categoria A — código morto.** Remover já.

### `insul()` — index.html:9771 (mesmo módulo)
- Chama `hAir()`.
- Chamada por `lossAt(d,espi)` (9879), que é chamada por `chartLoss(d)`
  (9895) — o gráfico "perda × espessura de isolamento" do relatório
  imprimível (`perdaTubReport`/`perdaSheet`). `chartLoss` varre ~28 valores
  de espessura chamando `insul()` a cada um.
- `computePerdaTub` só devolve o resultado para **uma** espessura (a
  escolhida no formulário) — não uma série.
- **Categoria C** — precisa de novo campo/endpoint (aceitar array de
  espessuras, ou expor a fórmula pronta para sweep) antes de remover.
  Ver também `chartComp` (9907), mesmo padrão (não abri o código completo,
  mas está no mesmo módulo/mesmo raciocínio).

### `hAir()` — index.html:9752
- Só é chamada por `bare()` (morta) e `insul()` (viva via `chartLoss`).
- **Categoria C** (arrasta com `insul`) — mas se `bare()` for removida,
  `hAir` continua necessária enquanto `insul`/`chartLoss` não migrarem.

### `flashCore()` — index.html:10263 (módulo Vapor Flash)
- Calcula localmente hf1/hf2/hg2/x/vFlash/vDren/tank/dPdren — **o mesmo
  bloco que `computeFlash` (servidor) já devolve em `data.*`.**
- Chamada por `window.flashCalc` (10292): usada para (1) validar antes de
  chamar `/api/calc`, (2) `flUpdatePurg(c.vDren,c.dPdren)` — pré-popula o
  select de purgador **antes** do fetch resolver (feedback instantâneo).
  O painel de resultado em si usa `data` (servidor), não `c`.
- Também chamada por `window.flashPurgSync` (10254).
- **Categoria B** — a saída termodinâmica já vem do servidor; o único uso
  vivo é o preview síncrono do select de purgador. Migrar = aceitar que o
  select de purgador só atualiza depois do round-trip (ou manter uma
  versão mínima só com vDren/dPdren, sem recalcular hf1/hf2/x).

### `compStation()` — index.html:10273 (mesmo módulo, "estação complementar")
- Calcula CVp (`cvReq`), velocidades de entrada/saída (`pipeArea`,
  `vaporVolWet`) e escolhe válvula (`flValvPick`/`VALV`) — **isso NÃO
  existe em `computeFlash`** (servidor). Renderizado via `d.comp` em
  `window.flashCalc`.
- **Categoria C** — precisa de um campo/sub-endpoint novo no servidor
  (reaproveitando lógica parecida com `computeVeloc`/seleção de válvula)
  antes de poder sair do cliente.

### `purgFn()` / `purgCapacity()` / `purgChartSVG()` / `purgSheetHTML()` — index.html:3414/3987/4005/4038
- **`purgFn`** faz `new Function("x","return "+expr+";")` a partir do
  campo `curva` do catálogo PURG (string tipo
  `"-8.2282 * x ** 2 + 107.62 * x + 165.33"`) — é o ÚNICO `new Function`
  em todo o `index.html` (confirmado por grep).
- Usado por `purgCapacity` (calcula 1 ponto) e por `purgChartSVG` (varre
  ~40 pontos de ΔP para desenhar a curva de capacidade no SVG da folha
  técnica) e por `purgSheetHTML` (o ponto de operação impresso).
- Disparado por duplo-clique numa linha de `renderPurg` →
  `openPurgReport(modelo,sz)` (4099) → `printPurgReport` (4123).
- `computePurg` (servidor) **também avalia essas curvas**, mas só devolve
  capacidade no ΔP atual por modelo/bitola — não uma série amostrada.
- **Categoria C — o item de MAIOR risco/esforço**: (a) precisa de um novo
  retorno do servidor (série de pontos, ex. `purgCurve`) para o gráfico;
  (b) a técnica `new Function` sobre string vinda de dados é também um
  ponto sensível por si só (execução de "código" a partir de dado editável
  por admin) — mesmo migrando o gráfico, vale reavaliar se essa avaliação
  deveria acontecer só no servidor (mais fácil de auditar/sandbox) e o
  cliente só receber pontos prontos.

### `dsCalcAll()` — index.html:10884 (Dessuperaquecimento)
- **Zero call-sites** (só a definição). `computeDessuper` já cobre o painel
  principal via `dsCalc` (fetch em `/api/calc`).
- **Categoria A — código morto.** Remover já.

### `dsWater()` — index.html:10930
- **Zero call-sites reais.** Há um comentário na própria função (linha
  ~11000) admitindo que a lógica foi **replicada manualmente inline** em
  vez de chamar a função — ou seja, o "efeito colateral" dela (sincronizar
  o campo de água "obsoleto") foi copiado à mão para outro lugar do código,
  e a função original ficou órfã.
- **Categoria A — código morto.** Remover já (depois de confirmar que a
  cópia inline mencionada no comentário 11000 continua sendo o caminho
  realmente usado — checagem de 1 minuto antes de apagar).

### `calcItem()` / `summary()` / `colebrook()` / `muVal()` / `rhoVal()` / `dnID()` — DUAS cópias quase idênticas
- Módulo Tubulação de Vapor: index.html:11173 (`calcItem`), 11191
  (`summary`), 11170 (`colebrook`), 11167/11168 (`muVal`/`rhoVal`).
- Módulo Tubulação de Água: index.html:11441 (`calcItem`), 11452
  (`summary`), 11438 (`colebrook`), 11421/11422 (`rhoVal`/`muVal`).
- Ambos os módulos já fazem fetch (`module:'tubvapor'`/`'tubagua'`) e o
  servidor (`computeTubVapor`/`computeTubAgua`, confirmado lendo
  `lib/engine.js:1150-1180`) **sempre devolve `items` (por linha) e
  `summary`** quando `invalid:false`.
- No render (`window.tubVapCalc`/`window.tubAguaCalc`), as linhas da
  tabela usam `resById[it.id]` (dados do servidor); só a linha
  `const s=(data&&data.summary)||summary();` cai no `summary()` local — e
  isso só acontece quando `data.summary` é `undefined`, o que só ocorre
  quando `data.invalid===true` (nenhum dado calculável ainda).
- **Categoria B** — praticamente já cobertos pelo servidor; o fallback só
  cobre o estado "formulário vazio/inválido". Migrar = fazer o servidor
  devolver um `summary` zerado mesmo quando `invalid`, ou simplesmente
  não tentar montar resumo nesse estado (a tabela já mostra "—" linha a
  linha). Baixo risco.

### `kshReport()` — index.html:2750 (folha técnica de redução com vapor superaquecido)
- Usa `vaporTemp()` local sobre `REP.tsup` (cache do último `renderReducSuper`)
  para calcular um fator "Ks" só para o relatório impresso.
- **Categoria B** — cálculo simples (1 lookup), plausível de virar campo
  do servidor (`computeReducSuper` já tem tudo que precisa) mas baixo
  risco/baixa prioridade por ser leve.

### `calcValv()` / `calcValvANSI()` / `calcBronze()` / `brzCapKgh()` / `kdrLineVapor()` / `colSeqVapor()` / `colSeqAgua()` / `psvOverNum()` — PSV (válvula de segurança)
- Definidas ~linhas 2048–2200ish; alimentam `openPsvReport` (2414) /
  `printPsvReport` (2497) — a folha técnica de PSV, mesmo padrão do
  purgador (gráfico + ponto de operação impressos).
- `computePSV` (servidor) já existe e cobre o painel principal
  (`renderValv`/aba PSV lê `/api/calc module:'psv'`), mas **não tracei em
  detalhe** se a folha técnica de PSV usa a resposta do servidor (como
  `purgSheetHTML`/`purgChartSVG` fazem para o purgador com dados PRÓPRIOS
  reavaliados) ou se recalcula do zero com essas 8 funções — só confirmei
  que elas existem e são chamadas pelos relatórios PSV.
- **Categoria C (candidata, não confirmada)** — mesma classe de risco do
  purgador (gráfico de curva de capacidade). **Precisa do mesmo tratamento
  de call-graph que dei a `purgFn`/`purgCapacity` antes de decidir.**
  Sinalizo como próximo item a investigar com a mesma profundidade.

---

## 3) Matemática de UI/geometria — NÃO é fórmula de engenharia (categoria D)

Fica no cliente, não é alvo de proteção:
- Toda a geometria SVG dos gráficos (`chartSVG`, `chartLoss`, `chartComp`,
  `purgChartSVG`): escalas de eixo (`px`/`py`/`X`/`Y`), `niceTicks`,
  montagem de `polyline`/`<text>`/grid — isso é layout, não física. A
  parte de engenharia é só a SÉRIE DE VALORES que alimenta o gráfico
  (coberta em §2/§3 acima como B/C).
- Motor de desenho P&ID (`bermo-line-helpers`, `r3-group-library-script`,
  zoom/pan, posicionamento de portas/faces) — já fora de escopo desde os
  rounds anteriores.
- Formatação/conversão de exibição (`uNum`, `umSel`) — apresentação. Only
  `uConv` faz conversão de unidade "de verdade", mas é matemática de
  conversão padrão (não proprietária) — baixa prioridade, não é alvo
  central da proteção (termodinâmica/dimensionamento/capacidades).

---

## 4) Plano de execução em blocos (menor risco primeiro)

**Bloco 0 — pré-requisito (não muda nada, só investigação):**
repetir o mesmo grep de "quem chama" (usado aqui para `bare`/`insul`/
`flashCore`/`compStation`/`purgFn`/`dsCalcAll`/`dsWater`) para:
(a) as 39 funções do "núcleo compartilhado" (§1), uma a uma;
(b) o cluster PSV (`calcValv`/`calcValvANSI`/`calcBronze`/`brzCapKgh`/
`kdrLineVapor`/`colSeqVapor`/`colSeqAgua`/`psvOverNum`) — mesmo nível de
detalhe que recebi para o purgador.
Sem isso, remover qualquer uma delas é arriscado — algumas podem ter um
segundo call-site fora do que já vi.

**Bloco 1 — Categoria A (risco zero, fazer já):**
- Remover `dsCalcAll()` (10884) e `dsWater()` (10930) — dessuper.
- Remover `bare()` (9763) — perdatub/isolamento.
- Depois de cada remoção: `node --check` nos scripts tocados, abrir os
  módulos afetados (dessuper, perdatub) no navegador e conferir que nada
  quebrou (nenhuma referência deveria sobrar).

**Bloco 2 — Categoria B de baixo risco (usar dado do servidor, remover
duplicata):**
- `calcItem`/`summary`/`colebrook`/`muVal`/`rhoVal`/`dnID` em tubvapor e
  tubagua — fazer o servidor sempre devolver `summary` (mesmo zerado) e
  então apagar as 2 cópias locais.
- `kshReport()` — mover o fator Ks para dentro de `computeReducSuper` como
  campo extra da resposta.
- `flashCore()` — reduzir ao mínimo necessário para o preview do select de
  purgador (ou aceitar 1 round-trip de latência); parar de recalcular
  hf1/hf2/x localmente.

**Bloco 3 — Categoria C, começando pelo mais simples:**
- `compStation()` (flash "estação complementar") — criar um novo campo/
  sub-endpoint no servidor para CVp + velocidades + seleção de válvula.
- `insul()`/`hAir()`/`chartLoss()`/`chartComp()` (isolamento) — decidir se
  o servidor aceita array de espessuras (sweep) ou se essa fórmula
  específica (correlação de convecção natural/forçada, não é
  dimensionamento proprietário de válvula/purgador) fica no cliente por
  ser menos sensível — **decisão do coordenador**, não técnica pura.

**Bloco 4 — Categoria C de maior risco (fazer por último, com mais
tempo/teste):**
- Folha técnica de purgador (`purgFn`/`purgCapacity`/`purgChartSVG`) — novo
  endpoint de série no servidor + decidir se a avaliação da expressão
  `curva` deve sair do cliente por completo (hoje é o único `new Function`
  do app).
- Folha técnica de PSV (cluster `calcValv`/etc.) — mesmo tratamento, depois
  de fazer o Bloco 0(b) para confirmar exatamente o que está vivo.

**Pontos mais arriscados a destacar para o coordenador:**
1. `purgFn`/`new Function` — único ponto de "eval" do app; migrar o
   gráfico é uma coisa, decidir se a avaliação da curva deve mesmo
   acontecer no cliente é outra (mais estratégica).
2. Gráficos que fazem sweep de parâmetro (`chartLoss`/`chartComp` no
   isolamento, `purgChartSVG` no purgador) — são os únicos casos onde o
   servidor precisa de uma CAPACIDADE NOVA (série, não ponto único), não
   só "devolver um campo que já calcula".
3. O cluster PSV não recebeu o mesmo nível de rastreio que o purgador —
   tratar como "categoria C não confirmada" até o Bloco 0(b).

---

## BLOCO 0 — resultado do rastreio de confirmação

Método: para cada uma das 39 funções do "núcleo compartilhado" (§1) + 3
extras (`vaporTemp`/`vaporPress`/`ATM`, declaradas como `const fn=(...)=>`)
+ o cluster PSV (subconjunto das 39), rodei `grep -E "\bNOME\b"` no
`index.html` inteiro e conferi manualmente cada linha retornada — inclusive
dentro de arrays de strings/`onclick=`/comentários — para não confundir
"menção ao nome" com "chamada real".

### Cluster PSV — veredito
`calcValv`, `calcValvANSI`, `brzCapKgh`, `kdrLineVapor`, `colSeqVapor`,
`colSeqAgua`, `psvOverNum` → **VIVAS**. Confirmado: `openPsvReport()`
(index.html, folha técnica de PSV, disparada por duplo-clique na tabela de
resultado) chama `calcValv`/`calcValvANSI` diretamente para montar a tabela
completa por bocal — exatamente o mesmo padrão já mapeado para o purgador
(`purgFn`/`purgCapacity`). `brzCapKgh` também vive via `openBronzeReport()`
(folha técnica das válvulas de alívio bronze MIPEL). Portanto o cluster PSV
vira **Categoria C confirmada** (mesma classe de risco do purgador — folha
técnica que recalcula do zero, não só o painel principal), não mais
"candidata não confirmada".

Uma função do cluster, porém, é diferente:
- **`calcBronze`** (linha ~2131) → **MORTA**. É a única do cluster com
  zero call-sites. A tabela de válvulas bronze (`tableBronze`, chamada em
  `openReport`/linha ~2363) hoje lê `rows` de `data.bronze[k]` — ou seja,
  **do servidor** — não mais de `calcBronze()`. Ficou órfã quando o painel
  principal de PSV migrou para o servidor; só a folha técnica (que usa
  `calcValv`/`calcValvANSI`/`brzCapKgh` diretamente) continuou viva.

### Demais 38 funções do núcleo compartilhado — vivas, com uma exceção
Todas as outras (`aberturaFrac`, `aguaDpChoked`, `aguaRhoT`, `aguaSG`,
`arRho`, `arWmass`, `arXt`, `bicoQ`, `cvReq`, `cvReqAgua`, `cvReqAr`,
`fluxoAgua`, `interp`, `interpC`, `isBorboleta`, `khSup`, `parseInch`,
`pipeArea`, `pmaxValv`, `sortedSizes`, `steamHg`, `steamHl`, `steamLookup`,
`valveAbas`, `vaporVolSup`, `vaporVolWet`, `xtDefault`, `vaporTemp`,
`vaporPress`, `ATM`) têm call-sites reais confirmados (preview síncrono de
selects, folhas técnicas, ou consumidas por outras funções vivas) — **vivas**,
sem remoção nesta rodada.

Exceção: **`aguaVol`** (linha ~3007) → **MORTA**. Tinha 2 ocorrências no
grep bruto, mas a segunda NÃO era uma chamada real — era só uma *string*
com o nome `'aguaVol'` dentro de um array (`['cvReq','cvReqAr',...,
'aguaVol'].forEach(...)`) usado para copiar referências de função para um
objeto `MB.calc` (ver achado abaixo). Fora dessa string e da própria
definição, `aguaVol()` nunca é chamada.

### Achado adicional (fora da lista original, mas do mesmo tipo de
verificação): bloco `MB.calc` / `MB.reduc` inteiro estava morto
Ao investigar a falsa pista de `aguaVol`, encontrei um bloco maior e mais
antigo, todo órfão: `MB.calc={}` + o `forEach` que o populava +
`MB.reduc.inputs()` + `MB.reduc.compute()` (linhas ~2609–2643, logo antes
de `renderReduc()`). O próprio comentário acima do bloco já dizia o que
era: *"Camada backend-ready da Redução de Pressão (ADITIVA — não altera
render/report validados)"* — um protótipo de uma API de cálculo client-side
alternativa, escrito ANTES da arquitetura real `/api/calc` existir.
`MB.reduc.compute()` reimplementava por completo o dimensionamento de Cv de
redução de pressão (chamando `cvReq`, `modelsForTab`, `pmaxValv`,
`sortedSizes`, `aberturaFrac` — só para produzir um resultado que nada lia).
Busquei `MB\.calc\.` e `MB\.reduc\.` no arquivo inteiro: **zero** outras
ocorrências. As funções que ele referenciava (`cvReq`, `khSup`, `velOut`,
etc.) continuam vivas por CONTA PRÓPRIA, com call-sites independentes — só
o bloco `MB.calc`/`MB.reduc` em si (e `aguaVol`, que só aparecia ali) era
morto.

### Nenhum outro código morto detectado
Fora do que está listado no Bloco 1 abaixo, não encontrei mais candidatos
com zero call-sites reais entre as 39 funções + cluster PSV + o achado
`MB.calc`/`MB.reduc`.

---

## BLOCO 1 — remoção de código morto (executada)

Removidas do `index.html`, todas com prova de zero call-sites reais
(grep pelo nome exato, incluindo dentro de strings/`onclick=`/comentários,
antes e depois da remoção):

| Função/bloco | Linha (antes) | Motivo | Grep antes → depois |
|---|---|---|---|
| `dsCalcAll()` | ~10884 | Já confirmada na auditoria original | 1 → 0 |
| `dsWater()` | ~10930 | Já confirmada na auditoria original (lógica replicada à mão em outro lugar, comentário próprio admite isso) | 1 → 0 (resta 1 menção em comentário de prosa, não-código) |
| `bare()` | ~9763 | Já confirmada — servidor já devolve `data.bare` | 1 → 0 |
| `calcBronze()` | ~2131 | Nova (Bloco 0) — `tableBronze` já lê `data.bronze[k]` do servidor | 1 → 0 |
| `injCap()` | ~9584 | Nova (Bloco 0) — zero call-sites (única ocorrência era a própria definição) | 1 → 0 |
| `steamLookupT()` | ~4151 | Nova (Bloco 0) — zero call-sites; `steamLookup()` (por pressão) continua viva e é a usada de fato | 1 → 0 |
| `tOfR()` | ~10146 | Nova (Bloco 0) — zero chamadas externas; comentário no código confirma que `computeSensorTemp` no servidor assumiu o cálculo | 1 → 0 |
| `rOfT()` | ~10145 | Nova (Bloco 0) — órfã em cascata: seu único chamador era `tOfR()` (também morta) | 2 → 0 (resta 1 menção em comentário de prosa) |
| constantes `A,B,C` (Callendar–Van Dusen) | ~10144 | Usadas só por `rOfT`/`tOfR` (removidas junto) | — |
| `aguaVol()` | ~3007 | Nova (Bloco 0) — só aparecia em string dentro do bloco `MB.calc` morto | 2 → 0 |
| bloco `MB.calc`/`MB.reduc.inputs`/`MB.reduc.compute` | ~2609–2643 | Nova (Bloco 0) — protótipo pré-`/api/calc`, órfão por completo | `MB\.calc\.`/`MB\.reduc\.`: 0 → 0 (já eram 0 fora da própria definição) |

Total: **9 funções + 1 bloco (3 membros) + 3 constantes** removidos, 114
linhas removidas / 4 linhas de comentário adicionadas (net **-110 linhas**).

**NÃO removido** (categorias B/C/D da auditoria original — seguem em uso):
`hAir()`/`insul()` (usadas por `chartLoss`/`lossAt` do relatório de
isolamento), `flashCore()`/`compStation()`, `purgFn()`/`purgCapacity()`/
`purgChartSVG()`, `calcValv`/`calcValvANSI`/`brzCapKgh`/`kdrLineVapor`/
`colSeqVapor`/`colSeqAgua`/`psvOverNum` (cluster PSV, confirmado vivo no
Bloco 0), `calcItem`/`summary`/`colebrook`/`muVal`/`rhoVal` (tubvapor e
tubagua), `kshReport()`, e as 38 funções restantes do núcleo compartilhado.

### Validação
- `grep -o '<script' index.html | wc -l` → **24** (inalterado).
- `node --check` em todos os 23 `<script>` inline (extraídos e checados
  individualmente) → **0 erros**.
- `node test_reduc.mjs` → **passou integralmente**, incluindo
  `reduc.CVp === 4.734848484848485` e os testes #23/#24 (catálogos VALV/PURG
  customizados) — confirma que `lib/engine.js`/servidor não foram tocados.
- `git diff --numstat index.html` → **114 linhas removidas, 4
  adicionadas** (comentários explicativos no lugar do código morto);
  **5.546 bytes** (~5,4 KB) a menos no arquivo. Efeito pequeno porque o
  código morto removido era enxuto — o grosso da redução de tamanho já
  tinha acontecido na ETAPA 1 (catálogos).

### O que testar no navegador (áreas tocadas)
1. **Dessuperaquecimento NH₃** (aba "Dessuperaquecimento"): adicionar
   compressor(es), conferir que o cálculo principal (`dsCalc`, que já usa
   `/api/calc module:'dessuper'`) continua funcionando normalmente, e que
   o campo de água (`ds_w_*`, cujo comportamento antes vinha de uma cópia
   manual da lógica de `dsWater()`, não da função em si) ainda sincroniza
   corretamente ao trocar vazão/temperatura de entrada/saída.
2. **Relatório de isolamento (perdatub)**: abrir a aba "Perdas em
   tubulações", preencher os dados, conferir que o painel principal (que já
   vinha do servidor antes desta rodada) continua igual, e — mais
   importante — clicar em "Gerar relatório" e conferir que o gráfico de
   perda × espessura de isolamento (`chartLoss`, que usa `insul()`/`hAir()`,
   NÃO removidas) ainda desenha a curva corretamente (ele ficou logo ao
   lado de `bare()`, que foi removida).
3. **Sensor de temperatura** (aba "Sensor de temperatura RTD"): conferir
   que o cálculo (`sensorTempCalc`, que já usa `/api/calc
   module:'sensortemp'`/`computeSensorTemp`) continua correto nos dois
   modos (resistência→temperatura e temperatura→resistência) — a remoção
   de `rOfT`/`tOfR`/`A,B,C` não deveria mudar nada, já que eles não eram
   mais chamados, mas vale conferir visualmente.
4. **Redução de pressão (vapor saturado)**: conferir que a aba "Redução"
   continua funcionando normalmente (o bloco morto `MB.calc`/`MB.reduc`
   removido nunca era chamado pelo `renderReduc()` real, que fica logo
   depois no arquivo).
5. **Injetores de vapor / tanque** e **Propriedades do vapor** (steamprops):
   conferir que nada mudou visualmente — `injCap()` e `steamLookupT()`
   eram órfãs.
6. **Válvula de segurança (PSV)**: conferir a folha técnica (duplo-clique
   numa linha do resultado) tanto para modelo bronze (MIPEL) quanto para
   os demais — a tabela de bronze na folha técnica agora depende
   inteiramente de `data.bronze` vindo do servidor (já era assim antes;
   só a função órfã `calcBronze()` foi removida, sem mudança de
   comportamento esperada).

---

## BLOCO 2 (ETAPA 2) — Categoria B: relatório/select passa a usar dado do servidor

Alvos tratados: tubvapor, tubagua, `flashCore()`, `kshReport()`.

### 1) Tubulação de vapor (tubvapor) — REMOVIDO

- Removidas: `steamMuSat`, `muVal`, `rhoVal`, `dnID`, `colebrook`,
  `calcItem`, `summary` (index.html, dentro da IIFE ~11056–11269).
- Adicionado `let LAST_TUBVAPOR=null;` (guardado logo após um fetch
  bem-sucedido em `window.tubVapCalc`, `null` no `catch`) e
  `SUMMARY_ZERO={pTubo:0,pCon:0,total:0,comp:0,nAcc:0,ppm:null,okT:true,
  okC:true}` como valor-padrão para o estado "sem dado ainda" (substitui
  o antigo fallback que chamava `summary()` local).
  Note that this SUMMARY_ZERO name is scoped inside tubvapor's own IIFE;
  a segunda constante homônima existe dentro da IIFE do tubagua com
  formato diferente ({suc,rec,dist,loc,total}) — não colidem (closures
  separadas).
- `tubVapSheet()` (a folha impressa) foi reescrita para ler `rho`, `mu`,
  `Tsat` e o resumo (`s`) de `LAST_TUBVAPOR` e para montar um
  `resById` (a partir de `LAST_TUBVAPOR.items`) em vez de chamar
  `calcItem(it)` por item — mesmo padrão que `window.tubVapCalc` já usava
  no render ao vivo da tabela.
- `window.tubVapReport` ganhou uma guarda:
  `if(!LAST_TUBVAPOR||LAST_TUBVAPOR.invalid){alert('Calcule antes de
  gerar o relatório.');return;}` — defesa extra, já que o botão "Gerar
  relatório" só é injetado (`mbLastPanelBtn`) quando `ITEMS.length>0`,
  não quando `!data.invalid`; sem essa guarda seria possível abrir a
  folha com item(ns) mas sem cálculo válido do servidor.
- Fluxo confirmado: o botão que abre `tubVapReport` só existe depois de
  um `mbLastPanelBtn(...)` chamado dentro do `else` de sucesso de
  `window.tubVapCalc` (ou seja, só aparece após pelo menos um fetch
  concluído) — mas como visto acima, isso não garante `!invalid`, daí a
  guarda adicionada.
- `velChart`/`tempChart` (gráficos da folha) permanecem chamando
  `vaporTemp`/`vaporVolWet` (núcleo compartilhado, Categoria C/D — fora
  do escopo) — não foram tocados.

### 2) Tubulação de água (tubagua) — REMOVIDO (parcial) + MANTIDO (parcial, com justificativa)

- **Removidas** (9 funções, viraram mortas depois da migração):
  `calcItem`, `summary`, `colebrook`, `muVal`, `dnID`, `pump`, `velAt`,
  `massFlow`, `pvapVal`.
- **Mantidas, com justificativa** (não são seguras de remover):
  - `rhoVal()` — tem um segundo call-site AO VIVO e SÍNCRONO em
    `window.agFlowUnChange` (conversão de unidade de vazão ao trocar o
    `<select>` de unidade — precisa responder na hora, sem round-trip
    assíncrono). Continua existindo só para esse uso; o relatório e o
    `tubAguaCalc` pararam de depender dela para os valores exibidos
    (agora vêm de `data.rho`/`LAST_TUBAGUA.rho`).
  - `qVol()` — usada por `energyChart()` (gráfico só do relatório,
    consumo anual × pressão da bomba); decidi não migrar esse gráfico
    porque `qVol`/`rhoVal` já precisam continuar vivas por outro motivo
    (acima), então não há ganho de "código morto" em tocar nele — ficou
    fora do escopo desta rodada.
  - `winterp()` — dependência interna de `rhoVal()` (mantida).
  - `tempV()` — só lê um campo de input (`uBase('ag_temp')`), não é
    fórmula de engenharia; trivial e inofensiva, mantida.
- Adicionado `let LAST_TUBAGUA=null;` (mesmo padrão do tubvapor),
  `SUMMARY_ZERO={suc:0,rec:0,dist:0,loc:0,total:0}` e
  `PUMP_ZERO={gamma:null,npshd:null,...}` como defaults para os estados
  "sem dado ainda" dos 3 fallbacks que existiam
  (`(data&&data.summary)||summary()`, `(data&&data.pump)||pump()`, e o
  `vsuc/vrec` que caía em `velAt(...)`).
- `tubAguaSheet()` foi reescrito para ler `massFlow`, `q` (→ vazão
  volumétrica), `rho`, `mu`, `pvap`, `summary`, `pump` de `LAST_TUBAGUA`
  e para montar `resById` a partir de `LAST_TUBAGUA.items` (em vez de
  `calcItem(it)` por item) — confirmado que `computeTubAgua` (servidor)
  já devolve exatamente esses campos (`rho, mu, pvap, q, massFlow, items,
  summary, pump`), lendo `lib/engine.js:1205-1249`.
- `window.tubAguaReport` ganhou a mesma guarda de invalid/ausência de
  dado que `tubVapReport`.
- `energyChart()` (gráfico só do relatório) foi deixado intocado —
  continua chamando `qVol()`/`rhoVal()` locais (ambas mantidas vivas por
  outro motivo, ver acima); migrá-lo não removeria código morto extra e
  adicionaria risco sem benefício líquido nesta rodada.
- Fluxo confirmado: mesmo padrão do tubvapor — botão só existe após
  sucesso de `window.tubAguaCalc`; guarda de `invalid` adicionada por
  defesa.

### 3) `flashCore()` (~10197) — MANTIDO, reclassificado de B (tentativo) para C

- Reexaminado o call-graph completo em `window.flashCalc` (10228) e
  `window.flashPurgSync` (10188). `flashCore()` tem **dois papéis
  síncronos**, nenhum deles um simples "preview antes do fetch":
  1. **Portão de validação** em `flashCalc`: `const c=flashCore(); if(!c)
     {...retorna sem chamar a API...}` — evita round-trip de rede
     enquanto o formulário está incompleto/inválido (`vCon<=0` ou
     `Palim<=Preev`).
  2. **Preenchimento imediato do `<select>` de purgador** — tanto em
     `flashCalc` quanto em `window.flashPurgSync` (ligado ao `onchange`
     do `<select id="fl_purg">`, index.html:1131): ao trocar o MODELO de
     purgador, `flashPurgSync` chama `flashCore()` de forma síncrona só
     para recalcular `vDren`/`dPdren` e repopular instantaneamente o
     `<select>` de BITOLA (`flUpdatePurgSz`) — sem isso, a lista de
     bitolas ficaria vazia/desatualizada até a resposta assíncrona de
     `flashCalc()` (que é chamada em seguida, mas só termina depois de
     um round-trip de rede).
- Confirmado que o servidor (`computeFlash`) já devolve os mesmos campos
  termodinâmicos (`hf1,hf2,hg2,hg1,hfg2,x,vFlash,vDren,dPdren,tank`) —
  então o VALOR em si é, sim, uma duplicata (Categoria B "pura"). O que
  impede a remoção é o USO síncrono, não a fórmula.
- Migrar exigiria aceitar um atraso de rede visível toda vez que o
  usuário troca o modelo de purgador (o `<select>` de bitola ficaria
  vazio/piscando até o fetch resolver) — UX pior sem necessidade, e
  ainda tocaria a mesma área que o código do servidor já documenta como
  intencionalmente cliente-only: o comentário em `lib/engine.js`, logo
  antes de `flashSelTank`/`computeFlash`, diz explicitamente que "a
  seleção de purgador de drenagem... permanece 100% no cliente, pois
  depende de estado de UI... replicar isso no servidor duplicaria lógica
  de catálogo editável". `flashCore()` é o que alimenta essa seleção com
  `vDren`/`dPdren` a tempo (antes do round-trip).
- **Decisão: MANTIDO.** Reclassificado de "B tentativo" (auditoria
  original) para **Categoria C** — precisa de um trabalho de arquitetura
  (ex.: cache do último `dPdren`/`vDren` conhecido + atualização
  otimista, ou aceitar/mitigar o atraso) que está fora do escopo de
  "qualidade acima de completude" desta rodada. Nenhuma linha alterada
  em `flashCore()`/`compStation()`/`flUpdatePurg*`.

### 4) `kshReport()` (~2706, dentro da folha ISA de válvula redutora) — MANTIDO, reclassificado de B (tentativo) para C

- Reexaminados os 3 call-sites: `recalcReport()` (3543, tabela ao vivo
  dos cenários I/II/III), `generateReport()` (3615, geração final do PDF)
  e mais um em ~3760 (impressão). Todos pertencem à MESMA folha técnica
  ISA da válvula redutora (`openReport`/`REP`, ~3436) — o mesmo tipo de
  relatório interativo multi-cenário já confirmado vivo no Bloco 0 para
  o cluster PSV (`openPsvReport`), só que para a válvula redutora, não
  para a de segurança.
- Esse relatório permite ao usuário editar **3 cenários** (pin/pout/
  flow/x) diretamente nas células da tabela impressa, com recálculo
  SÍNCRONO a cada tecla digitada (`m.querySelectorAll('.sc').forEach(i=>
  i.addEventListener('input',recalcReport))`, linha 3523) — não existe
  um único "último cálculo do servidor" para os 3 cenários lerem: cada
  cenário é um "e se" independente, digitado livremente pelo usuário,
  sem round-trip nenhum no loop atual.
- Migrar `kshReport()` para o servidor exigiria ou (a) disparar uma
  requisição a cada tecla digitada em qualquer um dos 3 cenários — sem
  debounce isso é uma regressão real de rede/latência — ou (b) construir
  uma camada de debounce/cache específica para essa tabela editável, o
  que é um trabalho de arquitetura, não uma troca simples de "usar dado
  do servidor" como em tubvapor/tubagua (onde já existe exatamente 1
  fetch e exatamente 1 consumidor síncrono do resultado).
- Também não é Categoria D pura: a fórmula em si (correção de
  superaquecimento `Ks = sqrt((Ts+273,15)/(Tsat+273,15))`) é uma relação
  termodinâmica real, não geometria de UI — por isso não a reclassifiquei
  como D, e sim como C.
- **Decisão: MANTIDO**, reclassificado de "B tentativo" (auditoria
  original, antes de tracear o call-graph completo) para **Categoria C**.
  Nenhuma linha alterada em `kshReport()`/`recalcReport()`/
  `generateReport()`.

### Validação (Bloco 2)
- `grep -o '<script' index.html | wc -l` → **24** (inalterado).
- `node --check` nos 23 `<script>` inline extraídos individualmente →
  **0 erros**.
- `node test_reduc.mjs` → passou integralmente, incluindo
  `reduc.CVp === 4.734848484848485` (testes #23/#24, catálogos VALV/PURG
  customizados) e as saídas de `tubvapor`/`tubagua` do próprio script de
  teste batendo com os campos usados na migração (`rho, mu, Tsat, items,
  summary` / `rho, mu, pvap, q, massFlow, items, summary, pump`).
- Zero call-sites ativos restantes (grep, escopo das IIFEs tubvapor e
  tubagua) para as 16 funções removidas nesta rodada
  (`steamMuSat,muVal,rhoVal,dnID,colebrook,calcItem,summary` em tubvapor
  + `calcItem,summary,colebrook,muVal,dnID,pump,velAt,massFlow,pvapVal`
  em tubagua — 7 + 9 = 16; note que `rhoVal`/`muVal`/`dnID`/`colebrook`/
  `calcItem`/`summary` existem em AMBOS os módulos como funções LOCAIS
  distintas por closure — contam uma vez por módulo).
- `git diff --numstat index.html`: 48 inserções / 90 remoções; arquivo
  2.231 bytes menor (5.645.769 → 5.643.538). Commitado por processo externo
  como `6bdd5ab` (nunca dei `git push`).

---

## BLOCO 3 (ETAPA 2) — Categoria C, parte 1: migração de verdade (novo servidor)

Alvos: (a) `compStation()` (estação complementar do flash); (b) curvas do
gráfico de isolamento (`insul`/`hAir`/`lossAt` → `chartLoss`/`chartComp`).
Diferente do Bloco 2 (só religar o cliente ao que o servidor JÁ devolvia),
aqui o servidor ganhou capacidade NOVA: `computeFlashComp` (novo compute +
novo case `flashcomp` no dispatcher) e `computePerdaTub.curva` (campo novo
na resposta existente).

### (a) `compStation()` → `computeFlashComp` (novo módulo `flashcomp`)

**Fluxo real encontrado (antes de mexer):** `compStation()` tinha um único
call-site no cliente, `index.html` linha ~10248, dentro do bloco de sucesso
de `window.flashCalc` — ou seja, DEPOIS do fetch principal (`module:'flash'`)
já ter resolvido, não em `onchange`/tecla direta. Os campos `fc_w`/`fc_p1`/
`fc_p2` têm `oninput="...flashCalc()"` e `fc_valv`/`fc_on` têm
`onchange="...flashCalc()"` — ou seja, QUALQUER edição da estação
complementar já disparava o `flashCalc()` assíncrono existente; `compStation()`
só rodava síncrono DEPOIS que esse fetch já tinha voltado. Isso significa que
não havia nenhum call síncrono-por-tecla a proteger — a migração podia usar
exatamente o fluxo assíncrono que já existia, sem herança de round-trips
extras por keystroke.

**Como liguei ao async:** criei `computeFlashComp(inputs, {valv})` em
`lib/engine.js` (verbatim de `compStation()`: `cvReq`, `vaporVolWet`,
`pipeArea`, `sortedSizes`+`aberturaFrac` — todos já existiam no servidor;
só faltavam `velClass()` e um `flValvPick()` server-side, portados
verbatim). Registrei `flashcomp: computeFlashComp` no `HANDLERS` de
`api/calc.js` e adicionei `'flashcomp'` ao `VALV_MODULES` (mesmo padrão de
`reduc`/`reducAr`/`reducAgua`/`reducSuper`: recebe `{valv}` carregado do
Supabase via `loadValv`). Em `window.flashCalc`, troquei o fetch único por
`Promise.all([fetch('flash'), fetch('flashcomp')])` — os dois módulos rodam
em paralelo, então a latência total continua sendo ~1 round-trip, não 2
serializados. O `modelo` da válvula enviado ao servidor é o valor JÁ
selecionado no `<select id="fc_valv">` — esse select continua sendo
populado/filtrado 100% no cliente por `flUpdateCompSelects()`/`flValvPick()`
(cliente, mantidas) usando `modelsForTab('vapor')`→`isAtivo('ctrl',m)`
(estado de UI/admin local) — o servidor NÃO replica esse filtro de
"ativo no cadastro", só resolve a matemática para o modelo que chegou já
escolhido. Isso é consistente com o comentário já existente em
`lib/engine.js` (antes de `flashSelTank`) que documenta essa mesma decisão
para a seleção de purgador.
- Removido: `compStation()` (index.html, ~10207).
- Removido (colateral, ficou morta): `velClass()` — só era chamada por
  `compStation()`; o servidor já devolve `clin`/`clout` prontos.
- Mantido: `flValvPick()` (cliente) — tem uso vivo e independente em
  `flUpdateCompSelects()` (popula o `<select>` com preview de bitola/abertura
  por modelo, para TODOS os modelos ativos, não só o escolhido — isso é
  filtragem de UI, não a mesma coisa que `computeFlashComp` faz).
- `data.comp` (a resposta de `flashcomp`, quando `!invalid`) é atribuído a
  `FLAST.comp`/`d.comp` exatamente como `compStation()` fazia antes — mesmo
  formato de campos (`W,P1,P2,sch,dnin,dnout,CVp,vin,vout,clin,clout,
  valvMdl,valvSz,valvCv,valvAb,pmax,p1ok`) — `flashSheet()`/`chartComp`-like
  trechos do relatório e o painel "Estação complementar" não precisaram de
  nenhuma mudança de template.

**Verificação do fluxo (CRÍTICO):** o painel "Estação complementar" e o
relatório (`flashReport`/`flashSheet`, via `flashData()`/`FLAST`) só são
preenchidos dentro do `if(!data.invalid){...}` de `window.flashCalc`, após
AMBOS os fetches (`flash` e `flashcomp`) resolverem com sucesso — se
`flashcomp` falhar (erro de rede, HTTP não-ok), o `catch` compartilhado do
`Promise.all` aborta o `flashCalc` inteiro (mesma mensagem de erro, `FLAST=
null`), em vez de mostrar um painel "Estação complementar" com dado
parcial/obsoleto. Isso é uma pequena mudança de comportamento em relação a
antes (antes, uma falha de rede no `flash` não podia derrubar `compStation()`,
que era 100% síncrono/cliente) — decisão consciente: falhar fechado (mostrar
erro, não renderizar nada) é mais seguro que mostrar dados desatualizados ou
inconsistentes, e é o mesmo padrão já usado em tubvapor/tubagua (Bloco 2).

### (b) Curvas do gráfico de isolamento (`chartLoss`) → `computePerdaTub.curva`

**Grade de espessuras replicada:** NÃO é uma lista fixa de 28-40 valores
"universais" — é uma grade DEPENDENTE da instalação, recalculada a cada
requisição a partir do `espi` (espessura escolhida) que o cliente já envia:
`xmax = Math.max(24, Math.ceil(espi*2.5/2)*2)` (mm), com **29 pontos**
(`N=28`, i de 0 a 28, `t = xmax*i/28`). O ponto `t=0` é a perda SEM
isolamento (`bare.loss`); os demais usam `perdaTubInsul()` — a mesma função
que o servidor já usava para o ponto único da espessura escolhida (só
generalizei para rodar em loop pelos 29 pontos). Isso bate exatamente com o
que `chartLoss(d)` fazia no cliente (`xmax`/`N=28`/`t<=0?d.lossNu:lossAt(d,t)`),
verbatim.
- `computePerdaTub` (lib/engine.js) ganhou o campo `curva` (array de
  `{esp, loss}`, só quando `hasIsol===true`; `null` caso contrário — mesmo
  guard que o cliente já usava, `!d.hasIsol||!d.isolKc`).
- `window.perdaTubCalc` agora grava `curva:data.curva||null` dentro de
  `LAST` (o cache síncrono que já existia — `LAST` não é novo, só ganhou um
  campo).
- `chartLoss(d)` foi reescrito para ler `d.curva` (mapeado para pares
  `[esp,loss]`) em vez de rodar o loop local chamando `lossAt(d,t)`. `xmax`
  agora é derivado do último ponto da série (`d.curva[d.curva.length-1].esp`)
  em vez de recalculado — resultado idêntico, já que o servidor usa a mesma
  fórmula.
- `chartComp(d)` **não precisou de nenhuma mudança** — já lia só campos
  escalares de `d` (`lossNu`, `tsurfNu`, `lossIsol`, `tsi`), todos vindos de
  `LAST`/resposta do servidor desde antes desta rodada; nunca chamava
  `insul`/`hAir`/`lossAt` diretamente.
- Removidas (zero call-sites confirmados por grep): `hAir()`, `insul()`,
  `lossAt()`, e as constantes auxiliares que só existiam para elas
  (`p5`, `p3`, `aptccf`, `apkvcf`, `apacf`, `appncf`, `pcs`, `SIG`, `PI`,
  `ln`) — `KCAL` (usada por `reportData()`) foi preservada, separada do
  `const` que as agrupava.

**Verificação do fluxo (CRÍTICO):** `perdaTubReport()` já tinha a guarda
`if(!LAST||!LAST.hasIsol){alert(...);return;}` (pré-existente, não mexi) e
o botão "Gerar relatório" só é renderizado quando `hasIsol===true` no HTML
de saída de `perdaTubCalc` — ou seja, o relatório (e portanto `chartLoss`)
só é alcançável depois de um cálculo bem-sucedido com isolamento válido.
`chartLoss(d)` ganhou uma guarda extra (`if(!d.curva||!d.curva.length)
return '';`) para o caso defensivo de `LAST` existir mas `curva` estar
ausente — retorna string vazia (gráfico não desenhado) em vez de estourar
exceção.

### Testes novos (`test_reduc.mjs`)
- **13b/13c** (perdatub.curva): 29 pontos; `curva[0]` bate com `bare.loss`;
  última espessura da série segue a fórmula `xmax` com os inputs do teste
  (espi=50 → xmax=64); perda cai monotonicamente conforme a espessura
  cresce; toda perda é > 0; sem isolamento (`espi` omitido) → `curva===null`.
- **18b/18c/18d** (computeFlashComp): caso válido (CVp/vin/vout/bitola
  calculados, `p1ok===true`); `on:'N'` → `invalid:true,on:false`; `P1<=P2`
  com `on:'S'` → `invalid:true,on:true` (distingue "desabilitada" de
  "dados incompletos", replicando os 2 estados que `compStation()` também
  distinguia via `return null` em pontos diferentes).
- **23b** (catálogo VALV customizado em `computeFlashComp`): reduzir o
  `PMax_barg` do modelo `32470` via clone do VALV muda `pmax`/`p1ok` na
  resposta, sem alterar o VALV default do módulo (mesmo padrão de
  isolamento-por-clone dos testes #23/#24 já existentes).

### Validação
- `grep -o '<script' index.html | wc -l` → **24** (inalterado).
- `node --check` nos 23 `<script>` inline + `lib/engine.js` + `api/calc.js`
  → **0 erros**.
- `node test_reduc.mjs` → passou integralmente (`reduc.CVp ===
  4.734848484848485`, testes #23/#24 + os novos 13b/13c/18b/18c/18d/23b),
  exit code 0, nenhum "Assertion failed" na saída.
- Zero call-sites ativos restantes (grep) para `compStation`, `velClass`,
  `hAir`, `insul`, `lossAt` — só aparecem em comentários explicativos.
- Tamanho: `index.html` **1.681 bytes menor** (removeu mais do que os
  ~200 bytes de código novo do fetch paralelo); `lib/engine.js` **3.129
  bytes maior** (esperado — capacidade nova: `computeFlashComp` +
  `curva`); `api/calc.js` +6/-2 linhas (novo case + entrada no
  `VALV_MODULES`).

### O que testar no navegador
1. **Vapor flash — estação complementar**: abrir "Estudo de vapor flash",
   preencher vazão/pressões principais, marcar "Possui estação
   complementar? Sim", preencher vazão/pressões/Ø da estação e escolher uma
   válvula redutora no `<select>`. Confirmar que o painel "Estação
   complementar" mostra CVp implícito via bitola/abertura, velocidades de
   entrada/saída e classificação (cores/õ texto Alta/OK/Baixa, se aplicável
   na UI) — sem travar/piscar ao digitar. Trocar o modelo de válvula no
   `<select>` e confirmar que o painel atualiza. Gerar o relatório e
   conferir a seção "Estação complementar" da folha impressa.
2. **Isolamento de tubulação — gráfico "Perda × espessura"**: abrir "Perda
   de energia em tubulações", preencher os dados do tubo + selecionar um
   isolamento com espessura > 0, conferir que o painel principal (perda com/
   sem isolamento) continua igual, clicar em "Gerar relatório" e conferir
   que o gráfico "Perda × espessura do isolamento" (`chartLoss`) desenha a
   curva normalmente (linha decrescente, ponto vermelho na espessura
   escolhida) e que o gráfico de comparação (`chartComp`, barras) também
   aparece normalmente.
3. **Sem isolamento**: no mesmo módulo, deixar o isolamento em "(sem
   isolamento)" e confirmar que NÃO aparece erro no console e que o botão
   "Gerar relatório" fica desabilitado/oculto (mensagem "Selecione um
   isolamento...").

## BLOCO 4 (ETAPA 2) — Categoria C, final: purgador (curva/`new Function`) e PSV (folhas)

Alvos: (a) avaliação da curva de capacidade do purgador (`purgFn`/
`purgCapacity`/`purgChartSVG` — único `new Function()` do app) usada na
folha técnica e no gráfico; (b) folhas técnicas do PSV (`calcValv`/
`calcValvANSI`/`brzCapKgh` chamados direto de `openPsvReport`/
`openBronzeReport`). Diferente do purgador, o PSV não precisou de
capacidade NOVA no servidor — `computePSV` já devolvia `r911`/`r942`/
`ansi`/`bronze` completos desde a rodada anterior (2ª rodada de migração);
faltava só o cliente parar de recalcular localmente e passar a ler dessa
resposta. O purgador SIM precisou de um endpoint novo (`computePurgCurve`),
porque a folha técnica pede a curva de UM modelo/bitola específico sob
demanda (duplo-clique), não de todos os ~240 pares modelo/bitola do
catálogo a cada tecla do cálculo principal.

### (b) PSV — `openPsvReport`/`openBronzeReport` → `LAST_PSV` (sem função nova no servidor)

**Fluxo real encontrado:** `renderValv()` já buscava `module:'psv'` a cada
recálculo (`oninput`/`onchange` da tela principal) mas descartava a
resposta depois de montar as tabelas — não guardava em nenhum cache.
`openPsvReport(modelo,bocal,setP)` e `openBronzeReport(key,dn,setP)` são
SÍNCRONOS, chamados via `ondblclick` nas linhas das tabelas (que só
existem depois de um cálculo bem-sucedido) — e cada um recalculava tudo de
novo (`calcValv`/`calcValvANSI`/`brzCapKgh`) lendo campos do DOM
(`vs_setp`,`vs_backp`,`vs_tagua`,`vs_tar`), com o MESMO fluido/pressão/
vazão que já tinham gerado a tabela clicada — recomputação 100%
redundante. O `oninput` dos campos de referência da folha (`psr_cli`,
`psr_ref`, etc.) só reinvoca o *closure* `sheet()`/`window._psvSheet` já
calculado — nunca dispara um novo `calcValv`, então não havia
recálculo-por-tecla a proteger (diferente do `kshReport`, que continua
como está).
- Adicionado `let LAST_PSV=null;` perto de `renderValv()`; a resposta do
  fetch (`data`) é guardada em `LAST_PSV` só quando o `fetch` teve sucesso
  (`resp.ok`); em erro de rede/HTTP, `LAST_PSV=null` (mesmo padrão
  LAST_X/invalid dos blocos anteriores).
- `openPsvReport`: `rows` agora vem de `LAST_PSV.ansi` (ANSI) ou de
  `[...LAST_PSV.r911, ...LAST_PSV.r942]` (DIN) em vez de chamar
  `calcValvANSI`/`calcValv`. Removida a lógica de remapeamento especial de
  bocal (`rows.slice(0,16).map(...).find(...)`) que existia porque o
  array bruto de `calcValv` tinha rótulos de bocal diferentes dos que
  `tableSeg` mostrava para as 3 últimas linhas (25.942/25.943) — não é
  mais necessária porque `LAST_PSV.r942` já vem do servidor com os
  rótulos corretos (`"15/20"`,`"20/25"`,`"25/32"`), os MESMOS que
  `tableSeg` usou para montar o `ondblclick`. Adicionada guarda
  `if(!LAST_PSV||LAST_PSV.err||LAST_PSV.errCode){alert(...);return;}`.
- `openBronzeReport`: `W`/`fs` agora vêm de
  `(LAST_PSV.bronze[key]||[]).find(r=>r.dn===dn)` em vez de chamar
  `brzCapKgh(fluidKey,dn,psi,tA)` direto — `LAST_PSV.bronze[key]` já é
  exatamente o array que `tableBronze` usou para desenhar a linha
  clicada (mesma fonte, sem risco de divergência). Mesma guarda de
  `LAST_PSV` ausente/erro.
- Removidos (zero call-sites externos confirmados por grep antes de
  remover): `kdrLineVapor`, `colSeqVapor`, `colSeqAgua`, `calcValv`,
  `calcValvANSI`, `brzCapKgh` — as 3 primeiras só eram chamadas de dentro
  de `calcValv` (morte em cascata, mesmo padrão do `velClass()` no Bloco
  3). Junto caíram as tabelas `BRZ_CAP`/`BRZ_PSI`, que só existiam para
  `brzCapKgh` (interpolação 25-150 PSI) — confirmado por grep que não
  tinham nenhum outro uso.
- Mantidos: `psvOverNum(modelo,fluidKey)`/`psvOver(modelo,fluidKey)`
  (cliente, 2 argumentos) — leem `PSV_MODELS[modelo]['Overpressure']`,
  editável no cadastro do admin; são DIFERENTES do `psvOverNum(model)` do
  servidor (1 argumento, tabela `PSV_OVER_DIN` fixa, usada só dentro da
  matemática de `calcValv`) — o cliente usa a versão com override para o
  campo "Sobrepressão"/cálculo de P0 exibido na folha, que é
  display/admin, não motor de cálculo. `BRZ_AR_RHO`, `BRZ_DN`,
  `BRZ_DN_MM`, `BRZ_DIM`, `BRZ_MAT`, `BRZ_MODELS`, `BRZ_FLU_LBL` — tabelas
  de referência/exibição (dimensões, materiais, rótulos), ainda usadas
  por `brzDimTable`/`brzMatTable`/`tableBronze`/`openBronzeReport`/
  `renderValv` (essa última exibe `BRZ_AR_RHO` na densidade do ar).
  `ANSI_NPS`/`ANSI_A0`/`ANSI_ORIF`/`ANSI_D0` — mantidas porque também
  alimentam uma tabela de dimensões exibida em outro lugar da tela
  (`psvDimRows`-like), não só `calcValvANSI`.

**Verificação do fluxo (CRÍTICO):** as tabelas com `ondblclick` (`tableSeg`,
`tableSegANSI`, `tableBronze`) só são renderizadas dentro do HTML de saída
de `renderValv()`, ou seja, só existem depois de um cálculo bem-sucedido —
mas isso por si só não garante `LAST_PSV` sem erro (ex.: um cálculo com
`errCode` preenchido ainda pode ter deixado tabelas de uma rodada anterior
na tela, se o usuário mudar um campo para um estado inválido depois de já
ter uma tabela válida renderizada). Por isso as guardas explícitas em
`openPsvReport`/`openBronzeReport` (`!LAST_PSV||LAST_PSV.err||
LAST_PSV.errCode`) são defesa em profundidade, mesmo padrão dos blocos
anteriores.

### (a) Purgador — `purgFn`/`purgCapacity`/`purgChartSVG` → `computePurgCurve` (novo módulo `purgcurve`)

**Fluxo real encontrado:** a tabela principal (`renderPurg`/`purgRows`) já
usava só dados do servidor (`computePurg`, migrado numa rodada anterior);
o `new Function` só sobrevivia na folha técnica/gráfico
(`openPurgReport`→`purgSheetHTML`→`purgChartSVG`→`purgCapacity`→`purgFn`),
disparada por `ondblclick` numa linha da tabela (só existe pós-cálculo) —
E, separadamente, no módulo de FLASH: `purgBitolasOK(model,vDren,dPdren)`
(chamada por `flUpdatePurg`/`flUpdatePurgSz`, por sua vez chamadas de
`window.flashPurgSync`, um `onchange` sobre os campos da estação de
purga/dreno) usa `purgCapacity` para filtrar SINCRONAMENTE quais bitolas
de cada modelo de boia atendem a vazão/ΔP de dreno atuais, a cada troca de
seleção — e `window.flashCalc` (sucesso) também chama `purgCapacity` uma
vez para o painel de margem do purgador escolhido. Ou seja,
`purgCapacity`/`purgFn` têm DOIS consumidores estruturalmente diferentes:
a folha técnica (contexto de relatório, migrável) e o dropdown de purga do
flash (preenchimento síncrono por tecla/onchange, mesma classe de exceção
já aplicada a `flashCore()` nos Blocos 2/3 — não dá para trocar por fetch
assíncrono sem atrasar a resposta da UI).
- Criado `computePurgCurve(inputs, {purg})` em `lib/engine.js`: para UM
  `modelo`+`sz`, reusa `purgFnSafe`/`purgTokenize`/`purgParse`/
  `purgEvalAst` (o parser seguro que `computePurg` já usava — SEM
  eval/`new Function`) para devolver o ponto de capacidade no ΔP atual
  (`cap`) E a série completa do gráfico (`curva:[{dp,cap}]`).
- **Grade replicada:** 41 pontos (`N=40`, `i` de 0 a 40,
  `x = xmax*i/40`), `xmax = Math.max(dpmax||6, dp*1.15, 1)` — exatamente a
  fórmula que `purgChartSVG` usava no cliente (`dpmax` = `dPMax_barg` da
  bitola escolhida no catálogo PURG; fallback 6 bar se a bitola não tiver
  `dPMax_barg`).
- Novo case `purgcurve: computePurgCurve` no `HANDLERS` de `api/calc.js`;
  adicionado `'purgcurve'` ao `PURG_MODULES` (mesmo padrão de `purg`:
  recebe `{purg}` carregado do Supabase via `loadCatalogo('purg', PURG)`).
- `renderPurg()` ganhou `let LAST_PURG=null;` (guarda a última resposta de
  `module:'purg'` — não estritamente necessária para a folha, que busca a
  própria curva sob demanda, mas mantém o padrão consistente com os
  outros módulos e fica disponível para uso futuro).
- `openPurgReport(modelo,sz)` passou a ser **assíncrona**: mostra um
  placeholder "Calculando folha técnica…" no modal, busca
  `module:'purgcurve'` com `{modelo,sz,pin,pout,flow}` (lidos do DOM da
  tela principal — `pg_pin`/`pg_pout`/`pg_flow` — no momento em que a
  folha é aberta, os MESMOS valores que a linha clicada já refletia),
  guarda a resposta em `let LAST_PURGSHEET=null;` (cache dedicado da
  folha, separado de `LAST_PURG`) e só então monta o HTML do modal. Em
  erro de rede/HTTP, mostra mensagem de erro dentro do próprio modal (com
  botão "Fechar") em vez de deixar o modal vazio/quebrado.
- `purgSheetHTML(modelo,sz)` e `purgChartSVG(curveData,dpOp,vazao)` foram
  reescritas para ler de `LAST_PURGSHEET`/`curveData` (parâmetro) em vez
  de chamar `purgCapacity(modelo,sz,dp)`/`purgFn(expr)` — nada é
  recalculado, só formatado/desenhado a partir da série já pronta.
- `refreshPurgSheet`/`printPurgReport` (chamadas pelo `oninput` dos campos
  de referência da folha e pelo botão "Imprimir") continuam chamando
  `purgSheetHTML(modelo,sz)` sem buscar de novo no servidor — reusam o
  `LAST_PURGSHEET` já em cache, mesmo padrão de "edição de cabeçalho não
  dispara novo cálculo" da folha do PSV.
- Removidos (zero call-sites no CAMINHO DA FOLHA/GRÁFICO, confirmados por
  grep): a chamada de `purgCapacity`/`purgFn` de dentro de
  `purgChartSVG`/`purgSheetHTML`.
- **Mantidos deliberadamente** (com comentário no código explicando por
  quê): `purgFn`/`purgCapacity` inteiros — ainda têm 2 call-sites vivos
  dentro do módulo de flash (`purgBitolasOK` e `window.flashCalc`), que
  precisam do resultado SÍNCRONO para popular/filtrar o `<select>` de
  purgador de dreno a cada troca de modelo/bitola. Migrar esse uso
  exigiria transformar `flUpdatePurg`/`flUpdatePurgSz`/`flashPurgSync` em
  assíncronos (fetch por `onchange`), o que atrasaria visivelmente a
  resposta do dropdown a cada seleção — risco maior que o benefício,
  então, seguindo a instrução de "qualidade acima de completude", optei
  por manter esse uso como está e sinalizar, em vez de forçar uma mudança
  arriscada de UX. Essa é a MESMA classe de exceção já usada para
  `flValvPick()`/`flashCore()` nos Blocos 2/3.

**`new Function` — antes/depois:** `grep -c "new Function" index.html` →
**1 antes, 1 depois** (inalterado). O único `new Function` do app
(`purgFn`, linha da definição) continua existindo, mas agora só é
alcançado pelo fluxo síncrono do flash — o caminho da folha técnica/
gráfico do purgador (que era o motivo original de existir) não passa mais
por ele. Não bati a meta "ideal 0" da instrução; documentando o motivo
estrutural acima em vez de forçar a remoção.

**Verificação do fluxo (CRÍTICO):** as linhas da tabela principal
(`ondblclick="openPurgReport(...)"`) só existem dentro do HTML de saída de
`renderPurg()`, ou seja, só depois de um cálculo bem-sucedido. Diferente
dos outros blocos, aqui NÃO reusei uma guarda `LAST_X` pré-existente — o
próprio `openPurgReport` agora tem sua guarda embutida no `try/catch` do
fetch (`LAST_PURGSHEET=null` + modal de erro em vez de renderizar com dado
ausente).

### Testes novos (`test_reduc.mjs`)
- **6c** (PSV — dados prontos para as folhas): `[...psv.r911,
  ...psv.r942]` soma 16 linhas com `bocal` único (confere que
  `openPsvReport` consegue achar a linha clicada por
  `rows.find(r=>r.bocal===bocal)` sem a lógica de remapeamento antiga);
  `psv.bronze['Fig. 037']` tem linha `dn==='1'` com `W0` calculado
  (confere que `openBronzeReport` acha por
  `rows.find(r=>r.dn===dn)`).
- **5b** (`computePurgCurve`, BK45 1/2"): 41 pontos; `cap` no ΔP atual
  bate com a fórmula verbatim (`154.2*x**0.401`); série monotonicamente
  crescente (lei de potência, fisicamente coerente — vazão cresce com ΔP
  através de um orifício fixo); toda capacidade ≥ 0; `xmax` bate com
  `max(dpmax||6, dp*1.15, 1)`; `dpmax` bate com o catálogo (22).
- **5c** (`computePurgCurve`, FTV 120 2.1/2"): quadrática com coeficiente
  líder negativo tem um pico dentro da faixa plotada (vértice ≈10,11 bar,
  dentro de `dpmax=12,3`) — a série NÃO é monotônica: sobe e cai antes do
  fim (comportamento físico esperado de um fit polinomial de bancada,
  "achatamento" perto do limite da bitola); mesmo assim toda capacidade
  continua ≥ 0.
- **5d**: modelo inexistente → `{invalid:true}`, sem lançar exceção.

### Validação
- `grep -o '<script' index.html | wc -l` → **24** (inalterado).
- `node --check` nos 23 `<script>` inline + `lib/engine.js` + `api/calc.js`
  → **0 erros**.
- `node test_reduc.mjs` → passou integralmente (todos os testes dos
  Blocos 2/3 + os novos 5b/5c/5d/6c), exit code 0, nenhum "Assertion
  failed" na saída.
- `grep -c "new Function" index.html` → **1 antes, 1 depois** (ver
  justificativa acima).
- Zero call-sites restantes (grep) para `calcValv`, `calcValvANSI`,
  `kdrLineVapor`, `colSeqVapor`, `colSeqAgua`, `brzCapKgh`, `BRZ_CAP`,
  `BRZ_PSI` — só aparecem em comentários explicativos.
- Tamanho: `index.html` **1.424 bytes menor** (líquido — removeu mais do
  que os ~800 bytes de código novo do fetch/cache do purgador+PSV);
  `lib/engine.js` **1.715 bytes maior** (`computePurgCurve` novo);
  `api/calc.js` +5/-2 linhas (novo case + entrada no `PURG_MODULES` +
  comentário atualizado).

### O que testar no navegador
1. **Purgador — folha técnica e gráfico**: em "Seleção de Purgador",
   calcular normalmente, dar duplo-clique numa linha de resultado
   (qualquer modelo/bitola). Confirmar que aparece brevemente "Calculando
   folha técnica…" e, em seguida, a folha completa com o gráfico "Curva
   de Vazão × Diferença de pressão" desenhado (linha azul + ponto vermelho
   no ΔP de operação). Editar um campo de referência (Cliente/Data/etc.)
   e confirmar que a folha NÃO refaz a requisição (atualiza na hora, sem
   piscar "Calculando…" de novo). Imprimir/gerar PDF e conferir que o
   gráfico aparece na versão impressa. Testar com um modelo cuja curva
   tenha coeficiente líder negativo (ex.: FTV 120) e confirmar que o
   gráfico mostra um pico visível, não uma reta sempre crescente.
2. **Purgador — dropdown de dreno no flash continua instantâneo**: em
   "Estudo de vapor flash", com "Possui estação complementar? Sim" e um
   purgador de boia selecionado, trocar o modelo/bitola do purgador de
   dreno várias vezes seguidas e confirmar que a lista de bitolas
   disponíveis atualiza instantaneamente (sem espera de rede) — este
   fluxo continua 100% síncrono, propositalmente não migrado.
3. **PSV — folha DIN/ANSI**: em "Válvula de segurança", calcular para
   vapor saturado (ou água/ar), dar duplo-clique numa linha de qualquer
   card de resultado (25.911/35.911/25.942/ANSI). Confirmar que a folha
   abre com o bocal correto pré-selecionado (mesma linha clicada) e os
   valores de capacidade/F.S. batendo com a tabela. Editar campos de
   referência e confirmar que não há nova chamada de rede (Network tab).
4. **PSV — folha bronze**: no mesmo módulo, com um fluido/pressão que
   ative os cards "Fig. 037"/"Fig. 038", duplo-clique numa linha da
   tabela bronze. Confirmar que a folha mostra a capacidade/F.S. da
   bitola clicada corretamente.
5. **PSV — caso de erro**: colocar a pressão de abertura fora da faixa
   (ex.: < 0,2 barg) e confirmar que NENHUMA tabela com `ondblclick`
   aparece (só a mensagem de erro) — logo não há como abrir uma folha com
   dado inválido/obsoleto nesse estado.
