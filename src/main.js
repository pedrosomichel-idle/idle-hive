// src/main.js
//
// Processo principal do IdleHive.
//
// Cada janela do app tem seu próprio "contexto" (ctx): conta logada,
// lista de painéis, sessões, foco atual, etc. Isso permite abrir mais
// de uma janela ao mesmo tempo, cada uma numa conta diferente — usado
// pelo botão "Adicionar outra conta" (limitado pelo número de slots de
// dispositivo que o backend libera pra esta máquina).
//
// A primeira janela (isPrimary) é a única cuja sessão fica salva em
// disco (authStore) e é restaurada automaticamente quando o app abre —
// janelas extras abertas via "Adicionar outra conta" pedem login de
// novo a cada vez que o app reinicia (a sessão delas vive só na
// memória enquanto o app está aberto).
//
// Fluxo por janela:
//   1) Sem sessão -> mostra tela de login/cadastro.
//   2) Com sessão, mas sem licença válida (trial expirado, sem
//      pagamento) -> tela de licença (comprar / verificar de novo).
//   3) Com licença válida -> ativa este dispositivo junto ao backend
//      (respeitando o limite de contas por dispositivo) e libera a
//      grade de painéis daquela conta.
//
// A grade de painéis em si: um BrowserView por conta, cada um com sua
// própria partition de sessão (persist:<id>), grid automático, header
// flutuante por painel e zoom automático pra manter o layout dos jogos
// consistente em qualquer tamanho de painel.

'use strict';

const { app, BrowserWindow, BrowserView, ipcMain, session, shell, Menu, dialog, net } = require('electron');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');
const { autoUpdater } = require('electron-updater');
const WebSocket = require('ws');

const AccountsStore = require('./accountsStore');
const authStore = require('./lib/authStore');
const { getDeviceId } = require('./lib/deviceId');
const config = require('./config');

const SIDEBAR_WIDTH = 260;
const PANEL_MARGIN = 3;
const PANEL_HEADER_HEIGHT = 34;
const GAME_BASE_WIDTH = 1366; // resolução de referência assumida pros jogos
const MIN_ZOOM = 0.3;
const METRICS_INTERVAL_MS = 2000;

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // O Electron roda o processo principal com uma versão de Node embutida
  // mais antiga (independente do Node instalado no sistema), que não tem
  // WebSocket nativo. O supabase-js tenta inicializar um cliente realtime
  // mesmo sem usarmos realtime de verdade — passamos o pacote "ws" como
  // implementação pra evitar o erro "native WebSocket not found".
  realtime: { transport: WebSocket },
  // O fetch nativo do Node usa sua PRÓPRIA lista de certificados,
  // separada da que o Windows/navegador usa. Em PCs com antivírus ou
  // proxy corporativo que inspeciona HTTPS (comum em rede de empresa),
  // isso causa "fetch failed" mesmo com internet normal — o navegador
  // confia no certificado do antivírus, o Node não. net.fetch usa o
  // motor de rede do próprio Electron (Chromium), que confia na mesma
  // lista de certificados do sistema, igual um navegador de verdade.
  global: { fetch: net.fetch },
});

// windowId -> ctx (uma entrada por janela aberta)
const sessions = new Map();
let metricsTimer = null;
let updateReadyFlag = false; // true depois que uma atualização já foi baixada

// ---------------------------------------------------------------------
// Sessão efetiva por janela (a primária persiste em disco; as extras
// só vivem em memória enquanto essa janela estiver aberta)
// ---------------------------------------------------------------------

function getEffectiveSession(ctx) {
  return ctx.isPrimary ? authStore.loadSession() : ctx.session;
}

function setEffectiveSession(ctx, sessionData) {
  if (ctx.isPrimary) {
    authStore.saveSession(sessionData);
  } else {
    ctx.session = sessionData;
  }
}

function clearEffectiveSession(ctx) {
  if (ctx.isPrimary) {
    authStore.clearSession();
  } else {
    ctx.session = null;
  }
}

// O access_token do Supabase expira sozinho (por padrão, ~1h). Sem isso,
// reabrir o app depois desse tempo cairia sempre na tela de "sessão
// inválida" mesmo com o login ainda válido de verdade — aqui a gente
// renova com o refresh_token ANTES de expirar, silenciosamente.
// Evita que qualquer chamada de rede trave a tela pra sempre — se
// demorar mais que isso, trata como falha (e mostra erro) em vez de
// ficar esperando indefinidamente (o que antes aparecia como "tela
// preta que nunca sai do lugar").
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error(`Tempo esgotado (${label})`)), ms)
    ),
  ]);
}

async function getFreshSession(ctx) {
  const storedSession = getEffectiveSession(ctx);
  if (!storedSession) return null;

  const expiresAtMs = storedSession.expires_at ? storedSession.expires_at * 1000 : 0;
  const isExpiringSoon = !expiresAtMs || expiresAtMs < Date.now() + 60 * 1000;

  if (isExpiringSoon && storedSession.refresh_token) {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.refreshSession({ refresh_token: storedSession.refresh_token }),
        10000,
        'renovar sessão'
      );
      if (!error && data && data.session) {
        setEffectiveSession(ctx, data.session);
        return data.session;
      }
    } catch (err) {
      // Rede fora do ar, Supabase inacessível, etc — segue com a
      // sessão antiga; a chamada de status abaixo vai rejeitar e a
      // tela mostra o erro certo, em vez de travar aqui pra sempre.
    }
    // Falhou renovar (refresh_token também expirado/revogado) — segue
    // com a sessão antiga mesmo; a chamada de status vai rejeitar
    // corretamente e a tela vai pedir login de novo.
  }

  return storedSession;
}

function getCtx(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? sessions.get(win.id) : null;
}

// Procura outra janela já aberta e logada nessa mesma conta (pra não
// deixar a mesma conta logada em duas janelas ao mesmo tempo).
function findActiveSessionForUser(userId, excludeWindowId) {
  for (const ctx of sessions.values()) {
    if (ctx.window.id === excludeWindowId) continue;
    if (ctx.window.isDestroyed()) continue;
    if (ctx.userId === userId) return ctx;
  }
  return null;
}

// ---------------------------------------------------------------------
// Janelas
// ---------------------------------------------------------------------

function createSessionWindow(isPrimary) {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'IdleHive',
    backgroundColor: '#14161a',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const ctx = {
    id: win.id,
    window: win,
    isPrimary,
    session: null, // sessão em memória — só usada se !isPrimary
    userId: null,
    accountsStore: null,
    views: new Map(), // id da conta -> BrowserView
    attached: new Set(), // ids atualmente anexados à janela (visíveis)
    runtime: new Map(), // id da conta -> { status, errorDescription }
    panelRects: new Map(), // id da conta -> retângulo de header
    focusedId: null,
    currentUiView: 'login',
    resizeDebounce: null,
  };
  sessions.set(win.id, ctx);

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Debounce: redimensionar a janela dispara muitos eventos 'resize' em
  // sequência (arrastando a borda) — sem isso, layoutViews() (que
  // recalcula bounds + zoom de cada painel) rodaria a cada pixel.
  win.on('resize', () => {
    if (ctx.resizeDebounce) clearTimeout(ctx.resizeDebounce);
    ctx.resizeDebounce = setTimeout(() => {
      if (ctx.currentUiView === 'app') layoutViews(ctx);
    }, 120);
  });

  win.on('closed', () => {
    if (ctx.resizeDebounce) clearTimeout(ctx.resizeDebounce);
    ctx.views.clear();
    ctx.attached.clear();
    ctx.runtime.clear();
    ctx.panelRects.clear();
    sessions.delete(win.id);
  });

  win.webContents.once('did-finish-load', () => {
    bootstrap(ctx);
    // Se a atualização já tinha sido baixada antes desta janela abrir
    // (ex: você abriu uma segunda conta depois do download terminar),
    // avisa ela também.
    if (updateReadyFlag) {
      win.webContents.send('app:updateReady');
    }
  });

  return ctx;
}

// ---------------------------------------------------------------------
// Atualização automática (electron-updater + GitHub Releases)
// ---------------------------------------------------------------------
//
// Só roda em build empacotado (o .exe instalado) — em desenvolvimento
// (`npm start`) o autoUpdater não tem uma versão publicada pra comparar
// e ficaria só gerando ruído/erro no log.
function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;

  autoUpdater.on('update-downloaded', () => {
    updateReadyFlag = true;
    for (const ctx of sessions.values()) {
      if (!ctx.window.isDestroyed()) {
        ctx.window.webContents.send('app:updateReady');
      }
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater] erro ao checar/baixar atualização:', err.message);
  });

  const check = () => autoUpdater.checkForUpdates().catch((err) => {
    console.error('[autoUpdater] falha ao checar atualização:', err.message);
  });

  check();
  // O app costuma ficar aberto por horas (jogos idle) — reconfere de
  // tempos em tempos, não só na abertura.
  setInterval(check, 4 * 60 * 60 * 1000);
}

function setUiView(ctx, view, data) {
  ctx.currentUiView = view;
  if (ctx.window && !ctx.window.isDestroyed()) {
    ctx.window.webContents.send('ui:setView', { view, data: data || null });
  }
}

// ---------------------------------------------------------------------
// Autenticação e licença
// ---------------------------------------------------------------------

async function fetchLicenseStatus(accessToken, deviceId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await net.fetch(`${config.BACKEND_URL}/api/license/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ deviceId }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      // 401 aqui é problema de SESSÃO (token expirado/revogado), não de
      // licença — a tela de licença trata isso diferente (não faz
      // sentido oferecer "comprar licença" quando o problema é só
      // precisar logar de novo).
      return { valid: false, error: json.error || 'Falha ao consultar licença', authError: res.status === 401 };
    }
    return json;
  } catch (err) {
    const message = err.name === 'AbortError' ? 'O servidor de licenças demorou demais pra responder.' : err.message;
    return { valid: false, error: `Não foi possível falar com o servidor de licenças: ${message}` };
  }
}

async function activateDevice(accessToken, deviceId, deviceName) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await net.fetch(`${config.BACKEND_URL}/api/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ deviceId, deviceName }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, data: json };
  } catch (err) {
    const message = err.name === 'AbortError' ? 'O servidor de licenças demorou demais pra responder.' : err.message;
    return { ok: false, data: { error: message } };
  }
}

// Garante que o accountsStore carregado nesta janela é o do usuário
// logado nela. Se for outro usuário (ex: logout e login com conta
// diferente na mesma janela), descarta os painéis abertos antes de
// trocar — cada conta só pode ver os próprios painéis.
function ensureAccountsStoreForUser(ctx, userId) {
  if (ctx.accountsStore && ctx.userId === userId) return;

  for (const id of Array.from(ctx.views.keys())) {
    destroyViewForAccount(ctx, id);
  }
  ctx.focusedId = null;

  ctx.accountsStore = new AccountsStore(userId);
  ctx.userId = userId;
}

// Decide qual tela mostrar nesta janela (login / licença / app) e, se
// tudo certo, libera a grade de painéis. Chamada ao abrir a janela e
// depois de qualquer ação que possa mudar esse estado (login, compra,
// logout).
async function bootstrap(ctx) {
  if (!ctx || !ctx.window || ctx.window.isDestroyed()) return;

  const storedSession = await getFreshSession(ctx);
  if (!storedSession || !storedSession.access_token || !storedSession.user || !storedSession.user.id) {
    ctx.accountsStore = null;
    ctx.userId = null;
    setUiView(ctx, 'login');
    return;
  }

  const deviceId = getDeviceId();
  const status = await fetchLicenseStatus(storedSession.access_token, deviceId);

  if (!status || !status.valid) {
    setUiView(ctx, 'license', status);
    return;
  }

  const activation = await activateDevice(storedSession.access_token, deviceId, os.hostname());
  if (!activation.ok) {
    setUiView(ctx, 'license', {
      ...status,
      error: activation.data && activation.data.error,
      reason: activation.data && activation.data.reason,
    });
    return;
  }

  ensureAccountsStoreForUser(ctx, storedSession.user.id);

  setUiView(ctx, 'app', status);
  syncViewsWithAccounts(ctx);
}

function registerAuthIpcHandlers() {
  ipcMain.handle('auth:signIn', async (event, { email, password }) => {
    const ctx = getCtx(event);
    if (!ctx) return { ok: false, error: 'Janela inválida.' };

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };

    // Essa conta já está logada em outra janela aberta nesta máquina?
    // Em vez de abrir duplicado, só foca a janela existente.
    const already = findActiveSessionForUser(data.user.id, ctx.window.id);
    if (already) {
      if (already.window.isMinimized()) already.window.restore();
      already.window.focus();
      return { ok: false, error: 'Essa conta já está aberta em outra janela — foquei ela pra você.' };
    }

    setEffectiveSession(ctx, data.session);
    await bootstrap(ctx);
    return { ok: true };
  });

  ipcMain.handle('auth:signUp', async (event, { email, password, referralCode }) => {
    const ctx = getCtx(event);
    if (!ctx) return { ok: false, error: 'Janela inválida.' };

    const options = {};
    // Código de indicação (opcional) fica salvo no user_metadata —
    // o webhook do Stripe lê isso na hora da compra pra creditar a
    // comissão do afiliado que indicou.
    if (referralCode && referralCode.trim()) {
      options.data = { referral_code: referralCode.trim().toUpperCase() };
    }

    const { data, error } = await supabase.auth.signUp({ email, password, options });
    if (error) return { ok: false, error: error.message };

    if (data.session) {
      setEffectiveSession(ctx, data.session);
      await bootstrap(ctx);
      return { ok: true, needsConfirmation: false };
    }
    return { ok: true, needsConfirmation: true };
  });

  ipcMain.handle('auth:signOut', async (event) => {
    const ctx = getCtx(event);
    if (!ctx) return true;

    clearEffectiveSession(ctx);
    ctx.focusedId = null;
    for (const id of Array.from(ctx.views.keys())) {
      destroyViewForAccount(ctx, id);
    }
    ctx.accountsStore = null;
    ctx.userId = null;
    setUiView(ctx, 'login');
    return true;
  });

  ipcMain.handle('license:refresh', async (event) => {
    const ctx = getCtx(event);
    if (ctx) await bootstrap(ctx);
    return true;
  });

  ipcMain.handle('license:checkout', async (event) => {
    const ctx = getCtx(event);
    const storedSession = ctx ? await getFreshSession(ctx) : null;
    if (!storedSession) return { ok: false, error: 'Não autenticado' };

    try {
      const res = await net.fetch(`${config.BACKEND_URL}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${storedSession.access_token}`,
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || 'Falha ao iniciar checkout' };
      shell.openExternal(json.checkoutUrl);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('license:checkoutDeviceSlot', async (event) => {
    const ctx = getCtx(event);
    const storedSession = ctx ? await getFreshSession(ctx) : null;
    if (!storedSession) return { ok: false, error: 'Não autenticado' };

    try {
      const res = await net.fetch(`${config.BACKEND_URL}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${storedSession.access_token}`,
        },
        body: JSON.stringify({ type: 'device_slot', deviceId: getDeviceId() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || 'Falha ao iniciar checkout' };
      shell.openExternal(json.checkoutUrl);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('license:redeemKey', async (event, code) => {
    const ctx = getCtx(event);
    const storedSession = ctx ? await getFreshSession(ctx) : null;
    if (!storedSession) return { ok: false, error: 'Não autenticado' };

    try {
      const res = await net.fetch(`${config.BACKEND_URL}/api/license/redeem-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${storedSession.access_token}`,
        },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || 'Chave inválida' };
      await bootstrap(ctx);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Abre uma janela nova, independente, pra logar em outra conta. O
  // limite de quantas contas cabem neste dispositivo é aplicado pelo
  // backend no momento da ativação (activateDevice) — se estourar, essa
  // nova janela cai na tela de licença com a opção de comprar slot
  // extra, igual já acontece hoje.
  ipcMain.handle('app:openAccountWindow', () => {
    createSessionWindow(false);
    return true;
  });

  ipcMain.handle('app:restartToUpdate', () => {
    autoUpdater.quitAndInstall();
    return true;
  });

  ipcMain.handle('affiliate:me', async (event) => {
    const ctx = getCtx(event);
    const storedSession = ctx ? await getFreshSession(ctx) : null;
    if (!storedSession) return { ok: false, error: 'Não autenticado' };

    try {
      const res = await net.fetch(`${config.BACKEND_URL}/api/affiliate/me`, {
        headers: { Authorization: `Bearer ${storedSession.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || 'Falha ao consultar afiliado' };
      return { ok: true, data: json };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('affiliate:join', async (event) => {
    const ctx = getCtx(event);
    const storedSession = ctx ? await getFreshSession(ctx) : null;
    if (!storedSession) return { ok: false, error: 'Não autenticado' };

    try {
      const res = await net.fetch(`${config.BACKEND_URL}/api/affiliate/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${storedSession.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: json.error || 'Falha ao tornar-se afiliado' };
      return { ok: true, data: json };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

// ---------------------------------------------------------------------
// Contas / BrowserViews (grade de painéis) — tudo abaixo recebe o ctx
// da janela dona daquele estado.
// ---------------------------------------------------------------------

function getRuntime(ctx, id) {
  if (!ctx.runtime.has(id)) {
    ctx.runtime.set(id, { status: 'loading', errorDescription: null });
  }
  return ctx.runtime.get(id);
}

function setStatus(ctx, id, status, errorDescription) {
  const rt = getRuntime(ctx, id);
  rt.status = status;
  rt.errorDescription = errorDescription || null;
}

function buildErrorPage(description, url) {
  const safeUrl = String(url).replace(/'/g, '%27');
  const safeDesc = String(description || 'ERR_CONNECTION_FAILED').replace(/</g, '&lt;');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;background:#14161a;color:#e6e6e6;
      font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
      display:flex;align-items:center;justify-content:center;}
    .box{text-align:center;max-width:320px;padding:0 20px;}
    .icon{font-size:32px;color:#ed4245;margin-bottom:12px;}
    h2{font-size:15px;margin:0 0 6px 0;}
    p{font-size:12px;color:#9aa0a8;margin:0 0 16px 0;word-break:break-all;}
    button{background:transparent;border:1px solid #ed4245;color:#ed4245;
      border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;}
    button:hover{background:#ed4245;color:#fff;}
  </style></head><body>
    <div class="box">
      <div class="icon">&#9888;</div>
      <h2>Falha ao carregar a página</h2>
      <p>${safeDesc}</p>
      <button onclick="location.href='${safeUrl}'">Recarregar</button>
    </div>
  </body></html>`;
}

function createViewForAccount(ctx, account) {
  const view = new BrowserView({
    webPreferences: {
      partition: `persist:${account.id}`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  view.webContents.setAudioMuted(!!account.muted);
  setStatus(ctx, account.id, 'loading');

  view.webContents.on('did-start-loading', () => {
    setStatus(ctx, account.id, 'loading');
    broadcastState(ctx);
  });

  view.webContents.on('did-finish-load', () => {
    setStatus(ctx, account.id, 'online');
    broadcastState(ctx);
  });

  // Alguns sites (login/redirecionamento em cadeia, autenticação via
  // socket, etc) nunca disparam 'did-finish-load' de verdade, e o
  // painel ficava preso em "Carregando" pra sempre. 'did-stop-loading'
  // é o evento garantido pelo Chromium — sempre dispara quando a
  // página para de carregar, com sucesso ou não — então usamos ele como
  // uma segunda confirmação: se ainda estava "loading" quando parou de
  // carregar, e não virou 'erro' nesse meio tempo, consideramos online.
  view.webContents.on('did-stop-loading', () => {
    const rt = getRuntime(ctx, account.id);
    if (rt.status === 'loading') {
      setStatus(ctx, account.id, 'online');
      broadcastState(ctx);
    }
  });

  view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return;

    setStatus(ctx, account.id, 'erro', errorDescription);
    const errorPage = buildErrorPage(errorDescription, account.url);
    view.webContents
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorPage)}`)
      .then(() => {
        setStatus(ctx, account.id, 'erro', errorDescription);
        broadcastState(ctx);
      })
      .catch(() => {});
  });

  view.webContents.loadURL(account.url).catch((err) => {
    setStatus(ctx, account.id, 'erro', err.message);
    broadcastState(ctx);
  });

  ctx.window.addBrowserView(view);
  ctx.views.set(account.id, view);
  ctx.attached.add(account.id);
  return view;
}

function destroyViewForAccount(ctx, id) {
  const view = ctx.views.get(id);
  if (!view || !ctx.window) return;
  if (ctx.attached.has(id)) {
    ctx.window.removeBrowserView(view);
    ctx.attached.delete(id);
  }
  if (!view.webContents.isDestroyed()) {
    view.webContents.destroy();
  }
  ctx.views.delete(id);
  ctx.runtime.delete(id);
  ctx.panelRects.delete(id);
}

// Garante que só os painéis realmente visíveis agora fiquem anexados à
// janela — os outros ficam com o jogo rodando (não são destruídos), só
// não gastam GPU/CPU com composição/pintura enquanto ficam de fora.
function syncAttachment(ctx, desiredIds) {
  for (const id of Array.from(ctx.attached)) {
    if (!desiredIds.has(id)) {
      const view = ctx.views.get(id);
      if (view) ctx.window.removeBrowserView(view);
      ctx.attached.delete(id);
    }
  }
  for (const id of desiredIds) {
    if (!ctx.attached.has(id)) {
      const view = ctx.views.get(id);
      if (view) {
        ctx.window.addBrowserView(view);
        ctx.attached.add(id);
      }
    }
  }
}

function layoutViews(ctx) {
  if (!ctx || !ctx.window || !ctx.accountsStore) return;
  const accounts = ctx.accountsStore.list();
  ctx.panelRects = new Map();

  const { width, height } = ctx.window.getContentBounds();
  const availableWidth = Math.max(width - SIDEBAR_WIDTH, 0);
  const availableHeight = Math.max(height, 0);

  if (accounts.length === 0) {
    syncAttachment(ctx, new Set());
    broadcastState(ctx);
    return;
  }

  if (ctx.focusedId && ctx.views.has(ctx.focusedId)) {
    syncAttachment(ctx, new Set([ctx.focusedId]));

    const view = ctx.views.get(ctx.focusedId);
    const headerRect = { x: SIDEBAR_WIDTH, y: 0, width: availableWidth, height: PANEL_HEADER_HEIGHT };
    const contentRect = {
      x: SIDEBAR_WIDTH,
      y: PANEL_HEADER_HEIGHT,
      width: availableWidth,
      height: Math.max(availableHeight - PANEL_HEADER_HEIGHT, 0),
    };
    applyViewGeometry(ctx, ctx.focusedId, view, headerRect, contentRect);

    broadcastState(ctx);
    return;
  }

  syncAttachment(ctx, new Set(accounts.map((a) => a.id)));

  const count = accounts.length;
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const cellWidth = Math.floor(availableWidth / columns);
  const cellHeight = Math.floor(availableHeight / rows);

  accounts.forEach((account, index) => {
    const view = ctx.views.get(account.id);
    if (!view) return;

    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellX = SIDEBAR_WIDTH + col * cellWidth;
    const cellY = row * cellHeight;

    const headerRect = {
      x: cellX + PANEL_MARGIN,
      y: cellY + PANEL_MARGIN,
      width: Math.max(cellWidth - PANEL_MARGIN * 2, 0),
      height: PANEL_HEADER_HEIGHT,
    };
    const contentRect = {
      x: cellX + PANEL_MARGIN,
      y: cellY + PANEL_MARGIN + PANEL_HEADER_HEIGHT,
      width: Math.max(cellWidth - PANEL_MARGIN * 2, 0),
      height: Math.max(cellHeight - PANEL_MARGIN * 2 - PANEL_HEADER_HEIGHT, 0),
    };
    applyViewGeometry(ctx, account.id, view, headerRect, contentRect);
  });

  broadcastState(ctx);
}

function applyViewGeometry(ctx, id, view, headerRect, contentRect) {
  ctx.panelRects.set(id, headerRect);
  view.setBounds(contentRect);
  view.setAutoResize({ width: false, height: false });

  try {
    const zoom = Math.min(1, Math.max(MIN_ZOOM, contentRect.width / GAME_BASE_WIDTH));
    view.webContents.setZoomFactor(zoom);
  } catch (err) {
    // Não crítico — próxima chamada de layout tenta de novo.
  }
}

// Cada conta cadastrada permanece salva em accounts-<userId>.json até o
// usuário removê-la — por isso, ao reabrir o app, todas as "abas" que
// estavam abertas voltam automaticamente na grade, sem precisar de nada
// extra.
// Mantém um BrowserView vivo pra CADA conta cadastrada, de todas as
// categorias — não só da categoria ativa. É isso que faz os jogos das
// outras categorias continuarem rodando (e acumulando) em segundo
// plano. Quem decide o que aparece na tela é o layoutViews, que anexa
// só os painéis da categoria ativa.
function syncViewsWithAccounts(ctx) {
  if (!ctx || !ctx.accountsStore) return;
  const allAccounts = ctx.accountsStore.listAll();
  const currentIds = new Set(allAccounts.map((a) => a.id));

  for (const id of Array.from(ctx.views.keys())) {
    if (!currentIds.has(id)) {
      if (ctx.focusedId === id) ctx.focusedId = null;
      destroyViewForAccount(ctx, id);
    }
  }

  allAccounts.forEach((account) => {
    if (!ctx.views.has(account.id)) {
      createViewForAccount(ctx, account);
    }
  });

  layoutViews(ctx);
}

function broadcastState(ctx, precomputedMetrics) {
  if (!ctx || !ctx.window || ctx.window.isDestroyed() || ctx.currentUiView !== 'app') return;

  // TODAS as contas, de todas as categorias — a sidebar agora lista as
  // categorias inteiras (com as abas de cada uma), não só a ativa. Os
  // headers desenhados sobre a grade continuam sendo só os da categoria
  // ativa, porque só esses têm retângulo em panelRects.
  const accounts = ctx.accountsStore.listAll();
  // getAppMetrics() lê TODOS os processos do Electron (não só desta
  // janela) — quando o timer de métricas já leu isso pra todas as
  // janelas neste tick, ele passa o resultado pronto aqui em vez da
  // gente chamar de novo à toa.
  const metrics = precomputedMetrics || app.getAppMetrics();

  const accountsPayload = accounts.map((account) => {
    const view = ctx.views.get(account.id);
    const rt = ctx.runtime.get(account.id) || { status: 'loading', errorDescription: null };

    let cpu = 0;
    let ramMB = 0;
    if (view && !view.webContents.isDestroyed()) {
      const pid = view.webContents.getOSProcessId();
      const metric = metrics.find((m) => m.pid === pid);
      if (metric) {
        cpu = metric.cpu ? Math.round(metric.cpu.percentCPUUsage * 10) / 10 : 0;
        ramMB = metric.memory ? Math.round(metric.memory.workingSetSize / 1024) : 0;
      }
    }

    return {
      id: account.id,
      categoryId: account.categoryId,
      name: account.name,
      url: account.url,
      muted: !!account.muted,
      favorite: !!account.favorite,
      status: rt.status,
      errorDescription: rt.errorDescription,
      cpu,
      ramMB,
    };
  });

  const headers = [];
  for (const account of accountsPayload) {
    const rect = ctx.panelRects.get(account.id);
    if (rect) headers.push({ ...account, rect });
  }

  ctx.window.webContents.send('state:update', {
    accounts: accountsPayload,
    focusedId: ctx.focusedId,
    headers,
    categories: ctx.accountsStore.listCategories(),
    activeCategoryId: ctx.accountsStore.getActiveCategoryId(),
  });
}

function registerAccountsIpcHandlers() {
  // ---------------------------------------------------------------------
  // Categorias (workspaces)
  // ---------------------------------------------------------------------

  ipcMain.handle('categories:add', (event, name) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return null;
    const category = ctx.accountsStore.addCategory(name);
    // A categoria nova nasce vazia e já vira a ativa — os painéis das
    // outras continuam vivos, só saem da tela.
    ctx.focusedId = null;
    layoutViews(ctx);
    return category;
  });

  ipcMain.handle('categories:switch', (event, id) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return null;
    const switched = ctx.accountsStore.setActiveCategory(id);
    if (!switched) return null;
    ctx.focusedId = null;
    layoutViews(ctx);
    return switched;
  });

  ipcMain.handle('categories:rename', (event, { id, name }) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return null;
    const category = ctx.accountsStore.renameCategory(id, name);
    broadcastState(ctx);
    return category;
  });

  ipcMain.handle('categories:remove', (event, id) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return false;

    const category = ctx.accountsStore.listCategories().find((c) => c.id === id);
    if (!category) return false;

    const accountCount = ctx.accountsStore.accountIdsInCategory(id).length;
    const response = dialog.showMessageBoxSync(ctx.window, {
      type: 'warning',
      buttons: ['Cancelar', 'Remover'],
      defaultId: 0,
      cancelId: 0,
      message: `Remover a categoria "${category.name}"?`,
      detail:
        accountCount > 0
          ? `As ${accountCount} aba(s) dentro dela também serão removidas. Os dados de login continuam salvos.`
          : 'Essa categoria está vazia.',
    });
    if (response !== 1) return false;

    const removed = ctx.accountsStore.removeCategory(id);
    if (removed) {
      // syncViewsWithAccounts destrói os BrowserViews órfãos (as contas
      // que estavam nessa categoria) e redesenha a grade da categoria
      // que passou a ser a ativa.
      ctx.focusedId = null;
      syncViewsWithAccounts(ctx);
    }
    return removed;
  });

  ipcMain.handle('accounts:moveToCategory', (event, { id, categoryId }) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return null;
    const account = ctx.accountsStore.moveToCategory(id, categoryId);
    if (account) layoutViews(ctx);
    return account;
  });

  // ---------------------------------------------------------------------
  // Contas
  // ---------------------------------------------------------------------

  ipcMain.handle('accounts:add', (event, { name, url }) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return null;
    const account = ctx.accountsStore.add({ name, url });
    syncViewsWithAccounts(ctx);
    return account;
  });

  ipcMain.handle('accounts:remove', (event, id) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return false;
    const removed = ctx.accountsStore.remove(id);
    syncViewsWithAccounts(ctx);
    return removed;
  });

  ipcMain.handle('accounts:reload', (event, id) => {
    const ctx = getCtx(event);
    if (!ctx) return false;
    const view = ctx.views.get(id);
    if (view && !view.webContents.isDestroyed()) {
      const account = ctx.accountsStore.list().find((a) => a.id === id);
      setStatus(ctx, id, 'loading');
      broadcastState(ctx);
      view.webContents.loadURL(account.url).catch((err) => {
        setStatus(ctx, id, 'erro', err.message);
        broadcastState(ctx);
      });
      return true;
    }
    return false;
  });

  ipcMain.handle('accounts:toggleMute', (event, id) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return false;
    const account = ctx.accountsStore.list().find((a) => a.id === id);
    if (!account) return false;
    const newMuted = !account.muted;
    ctx.accountsStore.setMuted(id, newMuted);
    const view = ctx.views.get(id);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.setAudioMuted(newMuted);
    }
    broadcastState(ctx);
    return newMuted;
  });

  ipcMain.handle('accounts:toggleFavorite', (event, id) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return false;
    const account = ctx.accountsStore.list().find((a) => a.id === id);
    if (!account) return false;
    const newFavorite = !account.favorite;
    ctx.accountsStore.setFavorite(id, newFavorite);
    broadcastState(ctx);
    return newFavorite;
  });

  ipcMain.handle('accounts:rename', (event, { id, name }) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return null;
    const account = ctx.accountsStore.rename(id, name);
    broadcastState(ctx);
    return account;
  });

  // Menu nativo de botão direito (sidebar ou header do painel): permite
  // renomear, favoritar/desfavoritar e remover a conta, com confirmação
  // nativa (dialog.showMessageBoxSync) pra remoção.
  ipcMain.on('accounts:contextMenu', (event, id) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return;
    const account = ctx.accountsStore.list().find((a) => a.id === id);
    if (!account || !ctx.window) return;

    const menu = Menu.buildFromTemplate([
      {
        label: 'Renomear',
        click: () => {
          if (!ctx.window || ctx.window.isDestroyed()) return;
          ctx.window.webContents.send('accounts:startRename', id);
        },
      },
      {
        label: account.favorite ? 'Remover dos favoritos' : 'Favoritar',
        click: () => {
          ctx.accountsStore.setFavorite(id, !account.favorite);
          broadcastState(ctx);
        },
      },
      {
        label: 'Mover para categoria',
        // Só faz sentido mostrar as OUTRAS categorias — mover pra onde
        // a aba já está não faria nada.
        submenu: ctx.accountsStore
          .listCategories()
          .filter((c) => c.id !== account.categoryId)
          .map((c) => ({
            label: c.name,
            click: () => {
              ctx.accountsStore.moveToCategory(id, c.id);
              if (ctx.focusedId === id) ctx.focusedId = null;
              layoutViews(ctx);
            },
          })),
        enabled: ctx.accountsStore.listCategories().length > 1,
      },
      { type: 'separator' },
      {
        label: 'Remover',
        click: () => {
          const response = dialog.showMessageBoxSync(ctx.window, {
            type: 'warning',
            buttons: ['Cancelar', 'Remover'],
            defaultId: 0,
            cancelId: 0,
            message: `Remover o painel "${account.name}"?`,
            detail: 'Os dados de login continuam salvos, você pode recriar a conta com a mesma URL depois.',
          });
          if (response === 1) {
            ctx.accountsStore.remove(id);
            if (ctx.focusedId === id) ctx.focusedId = null;
            syncViewsWithAccounts(ctx);
          }
        },
      },
    ]);
    menu.popup({ window: ctx.window });
  });

  ipcMain.handle('accounts:toggleExpand', (event, id) => {
    const ctx = getCtx(event);
    if (!ctx) return null;
    ctx.focusedId = ctx.focusedId === id ? null : id;
    layoutViews(ctx);
    return ctx.focusedId;
  });

  // BrowserViews (os painéis dos jogos) são renderizados pelo Chromium
  // acima do HTML da própria janela, sempre — nenhum z-index de CSS
  // consegue colocar um modal por cima deles. A solução é desanexar
  // todos os painéis de verdade enquanto um modal estiver aberto, e
  // reanexar (via layoutViews, que já sabe recalcular tudo) ao fechar.
  ipcMain.handle('app:setModalOpen', (event, isOpen) => {
    const ctx = getCtx(event);
    if (!ctx) return false;

    if (isOpen) {
      syncAttachment(ctx, new Set());
    } else if (ctx.currentUiView === 'app') {
      layoutViews(ctx);
    }
    return true;
  });

  ipcMain.handle('accounts:clearSession', async (event, id) => {
    const ctx = getCtx(event);
    if (!ctx || !ctx.accountsStore) return false;
    const account = ctx.accountsStore.list().find((a) => a.id === id);
    if (!account) return false;

    const ses = session.fromPartition(`persist:${account.id}`);
    await ses.clearStorageData();

    const view = ctx.views.get(id);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.reload();
    }
    return true;
  });
}

// ---------------------------------------------------------------------
// Ciclo de vida do app
// ---------------------------------------------------------------------

// Ainda travamos a instância do PROCESSO (não dá pra rodar dois .exe do
// IdleHive ao mesmo tempo — cada processo reabriria os mesmos arquivos
// de sessão/dispositivo de forma insegura). Múltiplas contas viram
// múltiplas JANELAS dentro deste mesmo processo (veja
// "app:openAccountWindow" acima), não processos separados.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const primary = Array.from(sessions.values()).find((c) => c.isPrimary && !c.window.isDestroyed());
    const anyWindow = primary || Array.from(sessions.values())[0];
    if (anyWindow) {
      if (anyWindow.window.isMinimized()) anyWindow.window.restore();
      anyWindow.window.focus();
    }
  });

  app.whenReady().then(() => {
    registerAuthIpcHandlers();
    registerAccountsIpcHandlers();
    createSessionWindow(true);
    setupAutoUpdater();

    metricsTimer = setInterval(() => {
      const activeCtxs = Array.from(sessions.values()).filter(
        (ctx) => ctx.currentUiView === 'app' && !ctx.window.isDestroyed()
      );
      if (activeCtxs.length === 0) return;

      const metrics = app.getAppMetrics(); // uma leitura só, reusada por todas as janelas
      for (const ctx of activeCtxs) {
        broadcastState(ctx, metrics);
      }
    }, METRICS_INTERVAL_MS);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createSessionWindow(true);
      }
    });
  });

  app.on('before-quit', () => {
    if (metricsTimer) clearInterval(metricsTimer);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
