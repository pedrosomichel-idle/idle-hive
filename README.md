# IdleHive

App desktop (Windows) que abre várias contas/sites em painéis lado a lado
dentro de uma única janela, cada um com sessão isolada — cookies, cache e
login próprios, sem uma conta derrubar a outra. Não separa IP: isso é
isolamento de sessão, não de rede.

## Como funciona por dentro

- A janela principal carrega uma sidebar + uma "camada de headers"
  (`src/renderer`). Por cima disso, o processo principal (`src/main.js`)
  empilha um `BrowserView` por conta, cada um com sua **partition
  própria** (`persist:<id>`) — é esse mecanismo do Chromium que garante
  cookies, `localStorage` e cache isolados por conta.
- Cada painel reserva uma faixa no topo (34px) onde o `BrowserView` nunca
  desenha nada — é ali que a sidebar desenha o header flutuante (nome,
  status, mute, recarregar, expandir, fechar), sempre alinhado com a
  posição real do painel.
- **Responsividade dos jogos**: o app aplica um zoom automático por
  painel (`webContents.setZoomFactor`), calculado a partir de uma
  largura de referência (1366px, definida em `GAME_BASE_WIDTH` no
  `main.js`). Isso faz o jogo sempre "pensar" que está numa tela cheia,
  só exibida em escala menor — evitando que o layout responsivo do jogo
  reorganize os botões e o tutorial aponte pro lugar errado. Se algum
  jogo específico continuar desalinhado, ajuste `GAME_BASE_WIDTH` pra
  perto da largura de design daquele jogo.
- **Status por conta** (bolinha verde/amarela/vermelha = online/
  carregando/erro): detectado via eventos `did-finish-load` e
  `did-fail-load` do `BrowserView`. Em caso de erro, o painel mostra uma
  página customizada (dark, com botão "Recarregar") no lugar da tela de
  erro padrão do Chromium.
- **CPU/RAM por conta**: lidos de `app.getAppMetrics()`, casando o PID
  do processo de cada `BrowserView` com a métrica correspondente.
  Atualizado a cada 2 segundos.
- **Mute por conta**: `webContents.setAudioMuted`, persistido no
  `accounts.json`.
- **Expandir/recolher**: clicar no ⤢ do header (ou no item da sidebar)
  faz aquele painel ocupar toda a área da grade; os outros ficam
  escondidos (bounds zerados) até você clicar em ⤡ ou no botão ⬚ no
  topo da sidebar pra voltar pra grade.
- **Múltiplas contas ao mesmo tempo, múltiplas janelas**: clicar em "+
  Adicionar outra conta" (dentro do ícone 🔑) abre uma **janela nova**,
  independente, pra logar numa segunda conta — as duas ficam abertas
  simultaneamente, cada uma com sua própria grade de painéis. O backend
  aplica o limite de quantas contas cabem neste dispositivo (1 por
  padrão, mais com slot extra pago); se estourar, essa janela nova cai
  na tela de licença oferecendo comprar o slot. Se você tentar logar
  numa conta que já está aberta em outra janela desta máquina, o app só
  foca a janela existente em vez de abrir duplicado.
  - Só a **primeira janela** (a que abre quando você inicia o app) tem
    a sessão salva em disco e volta logada sozinha da próxima vez.
    Janelas extras abertas via "Adicionar outra conta" pedem login de
    novo toda vez que o app reinicia — a sessão delas vive só na
    memória enquanto estão abertas.
- A lista de contas (nome/URL/mute/favorito) fica salva em
  `%APPDATA%/idle-hive/accounts-<userId>.json` — **um arquivo por
  usuário logado** (não é compartilhado entre contas diferentes que
  usam o mesmo Windows). Trocar de conta (logout/login com outro
  e-mail) descarrega os painéis da conta anterior e carrega só os da
  nova. Os dados de sessão (cookies, login dos jogos) ficam nas pastas
  de partition do próprio Electron, gerenciadas automaticamente. Como
  isso é lido de novo toda vez que o app abre, os painéis que você
  tinha aberto voltam sozinhos.
- **Favoritar**: clique na ⭐ no header do painel (ou no menu de botão
  direito). Contas favoritas aparecem primeiro tanto na sidebar quanto
  na grade (`AccountsStore.list()` ordena favoritas primeiro).
- **Renomear**: clique no ✏️ no header, dê duplo-clique no nome (na
  sidebar ou no header), ou clique com o botão direito na conta →
  "Renomear". Enter confirma, Esc cancela.
- **Conta, licença e pagamento**: login/cadastro (Supabase Auth), teste
  grátis de 8h sem cartão, licença paga via Stripe Checkout (aberto no
  navegador padrão), e resgate de chave de ativação (geradas no painel
  admin do backend, pra parceiros/sorteios) — ver
  `idle-hive-backend/README.md` pra configurar isso. Sem esse backend
  configurado (`src/config.js` com os valores de exemplo), o app fica
  preso na tela de login.

## Licenciamento (conta / pagamento / dispositivos)

O app só libera a grade de painéis depois de login + licença válida
(ou trial). Isso é resolvido pelo backend separado
`idle-hive-backend` (Next.js + Supabase + Stripe) — veja o README
dele pra configurar Supabase, Stripe e preencher `src/config.js` aqui.
Sem isso configurado, o app mostra a tela de login mas não consegue
avançar (o backend não existe pra responder).

**Limite de 1 conta por dispositivo**: por padrão, cada computador só
ativa 1 conta IdleHive. Se uma segunda conta tentar entrar na mesma
máquina, a tela de licença troca automaticamente o botão "Comprar
licença" por "Comprar slot extra pra este dispositivo" — que compra
uma vaga a mais especificamente pra esse computador (não afeta outros
dispositivos).

**Programa de afiliados (ícone ◆ na sidebar)**: qualquer usuário logado
pode clicar em "Tornar-se afiliado" — o backend gera um código
(`HIVE-XXXX`) e um link de indicação únicos na hora, sem precisar de
nada manual. O modal mostra código, link (com botões de copiar) e as
estatísticas (ativações, comissão pendente/paga). No cadastro, o campo
opcional "Código de indicação" deixa quem se cadastrou por indicação
de alguém vinculado a esse afiliado — a comissão é creditada
automaticamente quando essa pessoa compra a licença.

## Rodar em desenvolvimento

Pré-requisito: Node.js instalado (LTS).

```bash
npm install
npm start
```

Clique no ✎ no topo da sidebar pra abrir o formulário, cadastre uma
conta (nome + URL) e o painel aparece na grade.

## Gerar o instalador Windows (.exe)

```bash
npm install
npm run dist
```

O instalador (`.exe`, via NSIS) é gerado na pasta `dist/`. Esse comando
precisa rodar em uma máquina Windows (ou com as ferramentas de build
cross-platform do electron-builder configuradas).

## Atualização automática (electron-updater + GitHub Releases)

O app instalado (não o `npm start`) checa sozinho por versão nova ao
abrir, e de novo a cada 4h enquanto ficar aberto. Quando termina de
baixar, aparece um aviso discreto na sidebar ("Atualização pronta —
Reiniciar agora") — clicando, reinstala e reabre na hora; se o usuário
ignorar, a atualização se aplica sozinha na próxima vez que ele fechar
o app normalmente (comportamento padrão do `electron-updater`).

### Configurar pela primeira vez

1. Crie um repositório no GitHub (pode ser privado) — ex:
   `seu-usuario/idle-hive`.
2. Em `package.json`, edite `build.publish`:
   ```json
   "publish": [{ "provider": "github", "owner": "seu-usuario", "repo": "idle-hive" }]
   ```
3. Gere um **Personal Access Token** no GitHub (Settings → Developer
   settings → Personal access tokens → Fine-grained ou classic, com
   permissão `repo`/`contents: write` nesse repositório).
4. Antes de publicar, exporte o token no terminal (não commita isso em
   lugar nenhum):
   ```powershell
   $env:GH_TOKEN = "seu-token-aqui"
   ```

### Publicar uma versão nova

1. Suba as mudanças de código.
2. Sobe o número em `"version"` no `package.json` (ex: `1.0.0` →
   `1.0.1`) — o `electron-updater` compara por esse número, semver.
3. Rode:
   ```powershell
   npm run dist:publish
   ```
   Isso builda o `.exe` **e** publica automaticamente uma GitHub
   Release com os arquivos que o `electron-updater` precisa
   (`latest.yml` + o instalador) — não precisa subir nada manualmente.
4. Pronto — qualquer instalação existente do IdleHive detecta essa
   versão na próxima checagem (abertura do app, ou dentro de 4h se já
   estava aberto).

### Coisas pra saber

- **Não funciona em `npm start`** (só no `.exe` empacotado de verdade)
  — em dev não tem uma versão "instalada" com que comparar, então o
  auto-updater nem tenta rodar.
- A **primeira versão** que você distribuir já precisa ter esse
  `electron-updater` configurado — uma instalação rodando uma versão
  *anterior* a essa configuração não vai saber se auto-atualizar (só a
  partir da versão em que isso foi adicionado).
- Repositório **privado funciona normalmente**, mas cada instalação do
  app usuário precisaria também de um jeito de autenticar no GitHub pra
  baixar — na prática, pra distribuição pública, deixe o repositório
  **público** (o código não expõe nada sensível — chaves ficam só no
  `config.js`, que não vai pro repositório se você adicionar ele no
  `.gitignore`).

## Categorias (workspaces)

A sidebar é uma lista de categorias fixas — cada categoria é uma "tela"
independente com suas próprias abas embaixo, em formato de acordeão.
Serve pra separar jogos/projetos diferentes sem misturar tudo numa
grade só.

- **Criar**: campo "+ Nova categoria" no rodapé da sidebar. Ela nasce
  vazia, já vira a ativa, e o formulário de nova aba abre em seguida.
- **Adicionar aba**: botão `+` no cabeçalho da categoria.
- **Renomear**: botão `✎` no cabeçalho, ou duplo clique no nome — abre um campo de edição inline (não usa `window.prompt()`, que o Electron não implementa e não mostra nada).
- **Remover**: botão `✕` (pede confirmação e avisa quantas abas serão
  removidas junto). A última categoria não pode ser removida — o app
  nunca fica sem nenhuma tela.
- **Recolher/expandir**: clicar no cabeçalho da categoria ativa recolhe
  a lista de abas dela. Clicar no cabeçalho de outra categoria traz ela
  pra grade.
- **Mover uma aba entre categorias**: botão direito na aba → "Mover
  para categoria".

**Todas as categorias ficam visíveis ao mesmo tempo na sidebar**, e as
abas das categorias que não estão na grade aparecem mais discretas
(esmaecidas) — continuam rodando, só não estão sendo exibidas. Clicar
numa dessas abas traz a categoria dela pra grade.

**As abas das outras categorias continuam rodando** enquanto você está
noutra tela — os `BrowserView` de todas as categorias ficam vivos, só
os da categoria ativa é que ficam anexados à janela (mesmo mecanismo
da otimização de "painéis fora de foco"). Ou seja, os jogos continuam
acumulando em segundo plano, só param de gastar GPU desenhando. O
CPU/RAM de cada aba continua visível mesmo em segundo plano.

Em disco isso vira `accounts-<userId>.json` com `categories`,
`accounts` (cada uma com seu `categoryId`) e `activeCategoryId`.
Arquivos gravados pela versão anterior (array puro de contas, sem
categorias) são **migrados automaticamente** na primeira leitura: todas
as abas existentes vão pra uma categoria "Principal", sem perder nada.

**Detalhe de implementação**: a sidebar se redesenha a cada 2s (ciclo
das métricas de CPU/RAM). Enquanto um campo de renomear está aberto, o
redesenho é suspenso — sem isso, o input seria destruído no meio da
digitação, perdendo o texto e o cursor. O formulário de nova aba fica
fora da área redesenhada pelo mesmo motivo.

## Mercado RMT

Tela acessível pelo botão "Mercado RMT" na sidebar (acima das
categorias). **Exclusivo para licença paga** — trial é bloqueado, e a
checagem acontece no servidor a cada ação, não só na interface.

Fluxo: escolher apelido na primeira entrada → ver anúncios → "Negociar"
abre um chat direto com quem anunciou → depois da troca (feita dentro do
jogo), os **dois lados confirmam** e a transação entra na reputação.

Selos por transações confirmadas: Bronze (0) · Prata (5) · Ouro (15) ·
Diamante (40) · **Platina (100+, topo)**.

Regras anti-scam, todas aplicadas no backend:
- Confirmação sempre individual — só fecha quando os dois confirmam
- Mesmo par: no máximo 1 transação contabilizada a cada 24h
- Teto de 5 transações contabilizadas por pessoa por dia
- Mínimo de 3 mensagens de cada lado antes de liberar o botão confirmar
- Contador visível de quantas transações aquele par já fez entre si

Reputação vive no **login do IdleHive (a pessoa)**, nunca no personagem
do jogo — jogador tem dezenas de chars, e trocar de char não pode zerar
a ficha.

Denúncias vão pra fila de moderação em `/admin/reports`, onde dá pra
suspender alguém do Mercado por X dias sem banir a conta inteira.

**Chat por polling, não Realtime**: o app busca mensagens novas a cada
4s enquanto o chat está aberto. Supabase Realtime exigiria políticas de
RLS e um segundo caminho de autenticação — complexidade que não se paga
pra uma negociação de item, onde 4s de latência é irrelevante.

## Otimizações de performance

- **Painéis fora de tela não pesam à toa**: quando você usa "Expandir"
  (foco num painel só), os outros são desanexados de verdade da janela
  (não só escondidos) — o jogo continua rodando e acumulando em segundo
  plano, só para de gastar GPU/CPU desenhando algo que não aparece na
  tela.
- **Leitura de CPU/RAM compartilhada**: com várias janelas abertas ao
  mesmo tempo, a leitura de métricas do sistema (`app.getAppMetrics()`)
  acontece uma vez só por ciclo (a cada 2s) e é reaproveitada por todas
  — antes cada janela lia de novo à toa.
- **Redimensionar a janela não recalcula em excesso**: arrastar a borda
  da janela só recalcula o layout da grade depois de parar de mexer
  (debounce de 120ms), em vez de a cada pixel.
- O maior custo de RAM/CPU continua sendo estrutural: cada conta aberta
  é um processo Chromium próprio (isolamento de sessão exige isso). O
  jeito mais efetivo de aliviar em máquinas mais fracas é manter menos
  contas simultâneas na grade, ou usar "Expandir" pra focar numa de
  cada vez.

## Modal "Conta e licença" não fica mais atrás dos painéis

Bug corrigido: BrowserViews (os painéis dos jogos) são renderizados
pelo Chromium **acima** de qualquer HTML da janela, sempre — nenhum
`z-index` de CSS resolve isso. O ícone 🔑 agora desanexa de verdade
todos os painéis (`app:setModalOpen`) enquanto o modal está aberto, e
reanexa ao fechar (✕, clique fora, Esc, ou "Adicionar outra conta").
Antes disso, com alguma conta já aberta na grade, o modal abria mas
ficava invisível/inacessível atrás do jogo.

## Painel travado em "Carregando"

Alguns sites (login/redirecionamento em cadeia, autenticação via
socket) nunca disparam o evento `did-finish-load` do Chromium de
verdade, e o status do painel ficava preso em "Carregando" pra sempre
mesmo com o jogo já funcionando por trás. Corrigido: o app agora também
escuta `did-stop-loading` (que o Chromium sempre dispara quando a
página para de carregar, com sucesso ou não) como uma segunda
confirmação — se ainda estava "loading" nesse momento e não virou
"erro" antes, considera online.

## "fetch failed" em PCs com antivírus/proxy corporativo

O Node.js (usado internamente pelo processo principal do Electron) faz
requisições de rede com sua **própria lista de certificados**,
separada da que o Windows/navegador usa. Em PCs com antivírus que
inspeciona HTTPS (comum em notebook de empresa, ou alguns antivírus
residenciais mais agressivos), o navegador confia no certificado
substituído por esse software — mas o Node não, e a conexão falha
silenciosamente com "fetch failed", mesmo com internet normal.

Corrigido: todas as chamadas de rede do app (Supabase Auth e o backend
de licenciamento) agora usam `net.fetch` do próprio Electron, que
roda sobre o mesmo motor do Chromium — e por isso confia na mesma
lista de certificados que um navegador normal confiaria.

## Licença expira sozinha, mesmo com o app aberto

Antes, a licença só era conferida em pontos específicos (login, compra,
resgate de chave) — se o app ficasse aberto além do prazo de um trial
ou de uma chave por tempo, o usuário continuava usando pra sempre, sem
nunca ser desconectado de verdade.

Corrigido: enquanto uma janela está na grade, o app reconfere a licença
a cada 5 minutos. Se ela realmente expirou, a janela volta pra tela de
licença na hora — sem esperar reiniciar o app. E se faltar 30 minutos
ou menos pra vencer (trial ou chave por prazo), aparece um aviso
discreto na sidebar ("Sua licença expira em 28 min") com um botão
"Renovar agora", que abre o mesmo modal de conta/licença do ícone 🔑.
Licença paga (`plan: 'standard'`) nunca expira, então nunca dispara
esse aviso.

## Barra de menu removida

O Electron mostra por padrão uma barra (File / Edit / View / Window /
Help) feita pra quem está desenvolvendo, sem utilidade nenhuma pro
usuário final. Removida com `Menu.setApplicationMenu(null)` — os menus
de botão direito (renomear, favoritar, mover de categoria, etc)
continuam funcionando normal, são menus separados (`Menu.popup()`), não
afetados por essa remoção.

## Sessão expirada vs. sem licença

O token de sessão do Supabase expira sozinho (por padrão, ~1h). O app
renova ele automaticamente com o `refresh_token` antes de cada consulta
de licença — isso acontece em segundo plano, sem pedir login de novo,
enquanto o `refresh_token` continuar válido (o que dura bem mais tempo
e cobre o uso normal de abrir/fechar o app).

Se mesmo assim a sessão estiver realmente inválida (ex: revogada, ou
depois de muito tempo sem abrir o app), a tela de licença mostra
"Sua sessão expirou. Entre de novo pra continuar." com um botão
**Entrar novamente** — diferente da tela de "sem licença/trial acabou",
que mostra as opções de comprar/resgatar chave. São dois problemas
diferentes e agora têm telas diferentes.

## Limitações conhecidas

- Não há separação de IP por painel — só isolamento de sessão (cookies,
  cache, login). Para proxy por conta, dá pra configurar
  `session.fromPartition('persist:<id>').setProxy(...)` — não faz parte
  deste MVP.
- Sem workspaces/categorias — todas as contas aparecem na mesma grade.
- Sem drag-and-drop de layout — o grid é automático
  (`colunas = ceil(sqrt(n))`); o ícone de "arrastar" no header é visual
  por enquanto, não reordena.
- O zoom automático ajuda bastante, mas não é garantia de 100% de
  fidelidade visual em qualquer jogo — cada jogo responde diferente a
  mudanças de viewport.
- Login com Google (que o idle-labs.com oferece) não está implementado
  aqui — só e-mail/senha. Dá pra adicionar depois com um fluxo de deep
  link customizado.

## Uso responsável

Este app organiza sessões de navegador — ele não automatiza logins, não
captura credenciais e não faz scraping. O uso de múltiplas contas em
qualquer site ou jogo deve respeitar os termos de serviço de cada um;
muitos serviços proíbem contas simultâneas da mesma pessoa, e isso é uma
decisão sua, não do app.
