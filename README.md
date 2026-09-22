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

## Versão mínima obrigatória — forçar atualização sem depender do GitHub

Descoberto que alguns PCs tinham a configuração de auto-update
gravada errada dentro do próprio `.exe` (de builds anteriores a
corrigir o placeholder do GitHub e a tornar o repositório público) —
pra esses, publicar releases novas no GitHub não adianta nada, porque
o app está perguntando no lugar errado, permanentemente, até alguém
reinstalar manualmente.

Adicionado um segundo mecanismo, independente do GitHub Releases: o
backend pode exigir uma **versão mínima** (`MIN_APP_VERSION` no
`.env.local`/Vercel). O app compara sua própria versão contra isso
toda vez que confere a licença (login E reconferência periódica) — se
estiver abaixo do exigido, mostra uma tela bloqueando o uso, com botão
de baixar a versão nova, mesmo que a licença em si esteja
perfeitamente válida.

Como isso viaja pela MESMA checagem de licença que já sabemos que
funciona pra qualquer usuário jogando (é como o app confirma acesso o
tempo todo), serve de último recurso mesmo quando o GitHub/auto-updater
de alguém está quebrado.

**Como usar:** define `MIN_APP_VERSION=1.0.X` na Vercel quando quiser
forçar todo mundo numa versão específica pra cima. Deixa em branco/sem
definir pra não forçar nada (comportamento padrão).

**Bug encontrado no caminho:** a classe `hidden` no bloco novo não
tinha uma regra CSS correspondente — cada componente da tela tem sua
própria regra específica (`.modal.hidden`, etc), não existe uma regra
genérica `.hidden { display: none }` no projeto. Sem a regra
específica, a tela de "licença normal" continuava aparecendo por baixo
da de atualização obrigatória ao mesmo tempo.

## Bug sério: loop infinito reconferindo licença pra quem tem prazo longo

Apareceu como um monte de `TimeoutOverflowWarning` no terminal — mas o
problema real ia muito além do log poluído. O Node.js recusa
`setTimeout` com atraso maior que ~24,8 dias (limite de 32 bits): em
vez de erro, ele TRUNCA silenciosamente pra 1ms. A checagem exata de
expiração (`scheduleLicenseWatch`) agendava esse timer pra QUALQUER
licença com data de vencimento, sem checar se essa data estava longe —
uma chave promocional de 30+ dias virava um timer de 1ms, que disparava
na hora, reagendava outro timer igualmente gigante, que também virava
1ms... um loop infinito reconferindo a licença (com chamada de rede
pro backend) várias vezes por segundo, pra sempre. Carga real e
desnecessária no servidor, não só log feio.

Corrigido: o timer exato só é agendado quando a expiração já está
dentro da mesma janela do aviso (30 minutos). Pra qualquer coisa mais
longe que isso, não agenda nada — a reconferência periódica (a cada
5min) já dá conta de perceber, com o tempo, quando a expiração
finalmente entrar nessa janela.

## Regressão: abrir o modal de conta fazia ele "sumir" sozinho

Efeito colateral da correção anterior (forçar checagem ao abrir o 🔑):
o modal abria e, alguns segundos depois, ficava coberto pelos painéis
dos jogos — parecia ter sumido, mas só tinha sido tapado por cima.

Causa: `setModalOpen(true)` desanexa os painéis de jogo pra abrir
espaço pro modal, mas isso nunca foi um estado guardado — era uma ação
de "um disparo só". Quando a checagem de licença que acabamos de
adicionar rodava em paralelo e encontrava a licença ainda válida, ela
chamava `layoutViews()` como sempre chama — e essa função reanexava os
painéis por cima de tudo de novo, sem saber que um modal estava aberto
bem naquele momento.

Corrigido com um estado persistente (`ctx.modalOpen`), checado logo no
início de `layoutViews()`: enquanto algum modal estiver aberto (conta,
afiliados ou mercado), nada é reanexado, não importa o que dispare a
função nesse meio tempo. Esse estado também é resetado automaticamente
quando os painéis são destruídos de vez (licença expirada de verdade),
pra nunca ficar "preso" em `true` e travar a grade depois que o usuário
voltar a ter uma licença válida.

## Bug real: a checagem de expiração nunca rodava no login/abertura do app

Descoberto testando com uma licença editada manualmente no banco pra
expirar em poucos minutos: **nada acontecia**, nem o aviso nem a
expiração de verdade — mesmo esperando.

Causa: a lógica de "avisar quando está perto de vencer + agendar a
checagem exata" só existia dentro de `recheckLicense()`, que só roda no
ciclo periódico de 5 minutos. O `bootstrap()` (que roda no login e na
abertura do app) nunca chamava essa lógica. Então:
- Editar o banco com o app **já aberto** — nada percebia, até o próximo
  ciclo de 5min (que podia nem ter chegado ainda no teste)
- Abrir o app **do zero** com uma licença já cadastrada com prazo curto
  — mesmo problema, esperava o mesmo ciclo

Corrigido: essa lógica virou uma função só (`scheduleLicenseWatch`),
chamada tanto pelo `bootstrap()` quanto pelo `recheckLicense()`. Agora
um login ou reabertura do app já mostra o aviso e agenda a checagem
exata na hora, sem esperar nenhum ciclo periódico.

**Bônus pra testar mais rápido (e ajuda o uso real também):** abrir o
modal "Conta e licença" (🔑) agora força uma checagem imediata da
licença, em vez de esperar o próximo ciclo — útil especialmente logo
depois de pagar ou resgatar uma chave.

## Dois bugs na expiração de licença — resolvidos juntos

Testando o fluxo de expiração de verdade, dois problemas apareceram:

**1. O contador ficava preso num número, não descia.** O aviso só era
atualizado quando o main processo mandava um evento novo — e isso só
acontecia a cada 5 minutos (o intervalo da reconferência periódica).
Corrigido: agora o próprio app conta os segundos sozinho, ao vivo
(`mm:ss` descendo a cada segundo), a partir do horário exato de
expiração — o evento do main só dá o pontapé inicial, o resto é local.

**2. O painel do jogo em foco continuava jogável depois de expirar —
só a sidebar sumia.** Causa: painéis de jogo (`BrowserView`) sempre
desenham por cima de qualquer HTML no Electron, não importa qual "tela"
o app mande mostrar — é a mesma limitação que resolvemos antes nos
modais de conta/afiliados/mercado. Só que na hora de expirar a licença,
ninguém mandava destruir esses painéis. Corrigido com
`destroyAllViews(ctx)`, chamado antes de mostrar a tela de licença —
agora a conta que estava em foco realmente para, não fica jogável por
cima da tela de pagamento.

**Bônus, resolvido junto:** a reconferência periódica só rodava a cada
5 minutos, então a expiração de verdade podia demorar até esse tanto
além da hora certa pra ser percebida. Agora, assim que o app sabe a
hora exata que uma licença vence, agenda uma checagem específica pra
esse momento (`setTimeout` com poucos segundos de folga) — a
reconferência de 5 em 5 minutos continua existindo como rede de
segurança, mas na prática a expiração passa a ser quase instantânea.

## Botão de comprar licença sumia justamente quando mais precisava aparecer

Bug real, achado testando o fluxo de expiração: o modal "Conta e
licença" (aberto pelo 🔑, ou pelo "Renovar agora" do aviso de
expiração) escondia o botão "Comprar licença" sempre que `plan` era
`'standard'` ou `'promo'` — sem olhar se `expiresAt` mostrava que
estava prestes a vencer. Resultado: uma licença padrão marcada pra
expirar (teste manual no banco) ou uma chave promocional perto do fim
nunca mostravam jeito de comprar/renovar — a pessoa ficava travada.

Corrigido: só esconde o botão quando a licença é de verdade
**permanente** (`plan === 'standard'` e `expiresAt` vazio). Qualquer
outro caso — trial, chave por prazo, licença marcada pra expirar, ou
nenhuma licença — mostra o botão, com o rótulo mudando pra "Renovar
licença" quando já existe alguma licença (mesmo vencendo) e "Comprar
licença" só quando não existe nenhuma ainda.

## Stripe desativado — só PIX (por enquanto, pra testes)

Os botões de cartão (Stripe) — "Comprar licença", "Comprar slot extra"
na tela de licença e no modal de conta — ficam escondidos
(`class="hidden"` fixo no HTML), sem que nenhum código JS mexa nessa
classe deles mais. **Não apaguei o código do Stripe** — os handlers,
o IPC, tudo continua funcionando por trás; é só a interface que não
mostra mais esses botões. Reativar depois é só remover o `hidden` do
HTML e devolver as linhas de `.classList.toggle(...)` no
`renderer.js` (estão comentadas explicando exatamente isso).

O botão de PIX virou o principal: cor sólida característica (gradiente
teal), ícone inspirado no símbolo do PIX, brilho, e uma legenda abaixo
("Aprovação na hora, sem esperar boleto compensar") reforçando a
vantagem.

## PIX/boleto via Mercado Pago — segunda forma de pagamento

Adicionado como opção **ao lado** do Stripe (cartão), não no lugar —
o botão "Pagar com PIX" aparece junto de "Comprar licença" em toda
tela que já tinha o botão de comprar (tela de licença cheia e o modal
"Conta e licença"), incluindo pra slot extra de dispositivo.

**Por que**: o Stripe não oferece PIX nativo no Brasil, e pro público
do IdleHive (jogador brasileiro de jogo brasileiro) PIX costuma ser a
forma de pagamento preferida — perder gente no checkout por só aceitar
cartão internacional é um problema de conversão real, silencioso.

**Como funciona por trás**: usa o Checkout Pro do Mercado Pago (SDK
oficial `mercadopago@3.6.1`, verificado direto no pacote instalado, não
por suposição). Diferente do Stripe (que referencia um "Price ID"
pré-cadastrado no painel deles), aqui o preço vai direto na requisição
— configurável via `MERCADOPAGO_LICENSE_PRICE_BRL` e
`MERCADOPAGO_DEVICE_SLOT_PRICE_BRL`.

**Segurança do webhook**: a notificação de pagamento é validada com o
`WebhookSignatureValidator` oficial do pacote (HMAC), não uma
reimplementação manual — testado ao vivo (uma notificação sem
assinatura válida é rejeitada com 401 de verdade, não só na teoria).

**Achado no caminho, corrigido nos dois provedores**: nem o webhook do
Stripe nem o novo do Mercado Pago tinham proteção contra processar o
mesmo pagamento duas vezes (ambos podem reenviar a mesma notificação
por retry) — pro slot extra de dispositivo isso significaria conceder
2 vagas por 1 pagamento só. Adicionada uma tabela `payment_events`
(chave única por provedor+referência) que os dois webhooks conferem
antes de conceder qualquer coisa — `lib/grantPurchase.js` agora
concentra essa lógica pros dois provedores, pra nunca divergir.

**Variáveis novas** (`.env.local`/Vercel): `MERCADOPAGO_ACCESS_TOKEN`,
`MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_LICENSE_PRICE_BRL`,
`MERCADOPAGO_DEVICE_SLOT_PRICE_BRL`.

**Schema**: nova tabela `payment_events`, e a coluna
`mercadopago_payment_id` na tabela `licenses` (via `alter table` pra
quem já tinha o banco criado antes disso).

## Modo Eco — throttle de CPU pra categorias em segundo plano, sem exigir Premium

Reabertura de uma decisão anterior: o Modo Economia (fecha o processo
de verdade) só funciona pra contas Premium do Huntera, porque depende
da mecânica de caça/treino offline do próprio jogo pra não perder
progresso. O Modo Eco é diferente — **reduz o ritmo de processamento**
(CPU) de categorias em segundo plano via `Emulation.setCPUThrottlingRate`
(protocolo de debug do Chromium, `webContents.debugger`), sem nunca
derrubar a conexão. Funciona pra **qualquer conta**, premium ou não.

Toggle novo na sidebar ("Modo Eco"), persistido por usuário (
`ecoModeEnabled` no `accounts-<userId>.json`), desligado por padrão até
ser testado a fundo. Quando ligado: toda categoria que não é a ativa
recebe throttle 4x; ao trocar de categoria, quem sai entra em eco, quem
entra volta à velocidade normal, na hora.

## Atualização automática — checagem mais rápida + instalação silenciosa

Dois bugs/melhorias reais, não só estética:

1. **Checagem a cada 20 minutos, não 4 horas.** Jogadores desse tipo de
   jogo idle deixam o app aberto por dias sem fechar — checar só a cada
   4h significava demorar até esse tanto pra alguém saber de uma versão
   nova. A checagem em si é leve (só lê um arquivo pequeno do GitHub
   Releases), então não tem custo real em checar mais seguido. Ajustável
   em `UPDATE_CHECK_INTERVAL_MS` no `main.js`.

2. **Instalação da atualização virava um instalador completo de novo**
   — bug real: `autoUpdater.quitAndInstall()` sem argumentos usa
   `isSilent: false` por padrão no electron-updater. Corrigido pra
   `quitAndInstall(true, true)` — silencioso (não mostra nenhuma tela) e
   reabre o app sozinho depois, sem o usuário precisar abrir manualmente.

3. **Barra de progresso de verdade** — antes o aviso só aparecia depois
   do download inteiro terminar, sem nenhum feedback durante. Agora a
   sidebar mostra "Baixando atualização... X%" em tempo real (ouvindo
   `download-progress` do electron-updater), e só depois de 100% troca
   pro botão "Reiniciar agora".

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

### Rodada de otimização de CPU/RAM (análise + correções)

Auditoria completa do consumo, com três achados reais corrigidos:

1. **Sidebar reconstruída do zero a cada 2s** — o maior gasto real. Toda
   vez que as métricas chegavam, `categoryListEl.innerHTML = ''` e a
   lista inteira (todas as categorias, todas as contas, de todas as
   janelas) era recriada — mesmo quando só o número de CPU/RAM mudou.
   Corrigido com um caminho de atualização barato: uma assinatura
   estrutural (`computeSidebarSignature`) decide se algo que exige
   reconstrução mudou de verdade (conta nova, renomeada, movida,
   favoritada, foco mudou) — se não mudou, só os números são
   atualizados (`updateAccountMetrics`), sem criar ou destruir nenhum
   elemento do DOM. Escala com o número total de contas do usuário, que
   é justamente onde o app mais precisava melhorar.

2. **Painéis de jogo sem `backgroundThrottling` nem `spellcheck: false`**
   — por padrão, cada processo de jogo carregava um dicionário de
   corretor ortográfico (memória gasta à toa, nenhum jogo tem caixa de
   texto) e não tinha throttling de segundo plano garantido. Ambos
   ligados agora nas `webPreferences` de cada conta. Confirmado que o
   Huntera recalcula progresso pelo relógio real ao voltar a ficar
   visível — então isso não atrasa nada pro jogador em categorias fora
   de tela, só reduz CPU enquanto ele não está olhando.

3. **Timer de métricas rodando com a janela minimizada** — agora pausa
   sozinho quando a janela é minimizada (`win.on('minimize'/'restore')`)
   e volta a rodar ao restaurar.

**Não mudado, por decisão consciente**: `renderHeaders()` (os títulos
desenhados sobre os painéis na grade) ainda reconstrói a cada tick —
mas essa lista é limitada às contas da categoria *ativa* (o que cabe na
tela), não escala com o total de contas do usuário como a sidebar
escalava, então o ganho de otimizar ali é bem menor. Fica registrado
como próximo candidato se um dia isso importar.


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
