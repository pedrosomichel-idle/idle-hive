// src/renderer/renderer.js
//
// Roda so na UI (login/cadastro/licença/app). Toda a comunicacao com o
// processo principal passa pela API controlada exposta em preload.js
// (window.idleHive) — este arquivo nao tem acesso a Node nem Electron
// diretamente.

'use strict';

// ---------------------------------------------------------------------
// Troca de tela (login / cadastro / licença / app)
// ---------------------------------------------------------------------

const views = {
  login: document.getElementById('view-auth'),
  license: document.getElementById('view-license'),
  app: document.getElementById('view-app'),
};

function showView(name) {
  Object.values(views).forEach((el) => el.classList.add('hidden'));
  if (views[name]) views[name].classList.remove('hidden');
}

// ---------------------------------------------------------------------
// Login / Cadastro (abas dentro da mesma tela)
// ---------------------------------------------------------------------

const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const signupForm = document.getElementById('signup-form');
const signupError = document.getElementById('signup-error');

const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginPanel = document.getElementById('login-panel');
const signupPanel = document.getElementById('signup-panel');

function showAuthTab(tab) {
  const isLogin = tab === 'login';
  tabLogin.classList.toggle('active', isLogin);
  tabSignup.classList.toggle('active', !isLogin);
  loginPanel.classList.toggle('hidden', !isLogin);
  signupPanel.classList.toggle('hidden', isLogin);
}

tabLogin.addEventListener('click', () => showAuthTab('login'));
tabSignup.addEventListener('click', () => showAuthTab('signup'));

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  const result = await window.idleHive.signIn(email, password);
  if (!result.ok) {
    loginError.textContent = result.error || 'Não foi possível entrar.';
  }
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  signupError.textContent = '';
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const referral = document.getElementById('signup-referral').value.trim();

  const result = await window.idleHive.signUp(email, password, referral);
  if (!result.ok) {
    signupError.textContent = result.error || 'Não foi possível criar a conta.';
    return;
  }
  if (result.needsConfirmation) {
    showAuthTab('login');
    loginError.textContent = 'Conta criada! Confirme seu e-mail e depois entre.';
  }
});

// ---------------------------------------------------------------------
// Licença
// ---------------------------------------------------------------------

const licenseMessage = document.getElementById('license-message');
const buyLicenseBtn = document.getElementById('buy-license-btn');
const buyLicensePixBtn = document.getElementById('buy-license-pix-btn');
const buyDeviceSlotBtn = document.getElementById('buy-device-slot-btn');
const buyDeviceSlotPixBtn = document.getElementById('buy-device-slot-pix-btn');
const reloginBtn = document.getElementById('relogin-btn');
const redeemKeyBox = document.getElementById('redeem-key-box');
const refreshLicenseBtn = document.getElementById('refresh-license-btn');

buyLicenseBtn.addEventListener('click', async () => {
  const result = await window.idleHive.buyLicense();
  if (!result.ok) {
    licenseMessage.textContent = result.error || 'Não foi possível iniciar o pagamento.';
  } else {
    licenseMessage.textContent = 'Finalize a compra na aba do navegador que abriu, depois clique em "verificar de novo".';
  }
});

buyLicensePixBtn.addEventListener('click', async () => {
  const result = await window.idleHive.buyLicensePix();
  if (!result.ok) {
    licenseMessage.textContent = result.error || 'Não foi possível iniciar o pagamento.';
  } else {
    licenseMessage.textContent = 'Finalize o PIX na aba do navegador que abriu, depois clique em "verificar de novo".';
  }
});

buyDeviceSlotBtn.addEventListener('click', async () => {
  const result = await window.idleHive.buyDeviceSlot();
  if (!result.ok) {
    licenseMessage.textContent = result.error || 'Não foi possível iniciar o pagamento.';
  } else {
    licenseMessage.textContent = 'Finalize a compra na aba do navegador que abriu, depois clique em "verificar de novo".';
  }
});

buyDeviceSlotPixBtn.addEventListener('click', async () => {
  const result = await window.idleHive.buyDeviceSlotPix();
  if (!result.ok) {
    licenseMessage.textContent = result.error || 'Não foi possível iniciar o pagamento.';
  } else {
    licenseMessage.textContent = 'Finalize o PIX na aba do navegador que abriu, depois clique em "verificar de novo".';
  }
});

document.getElementById('refresh-license-btn').addEventListener('click', () => {
  window.idleHive.refreshLicense();
});

document.getElementById('redeem-key-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('redeem-key-input');
  const errorEl = document.getElementById('redeem-key-error');
  errorEl.textContent = '';

  const code = input.value.trim();
  if (!code) return;

  const result = await window.idleHive.redeemKey(code);
  if (!result.ok) {
    errorEl.textContent = result.error || 'Não foi possível resgatar essa chave.';
    return;
  }
  input.value = '';
});

document.getElementById('logout-from-license-btn').addEventListener('click', () => {
  window.idleHive.signOut();
});

document.getElementById('logout-from-force-update-btn').addEventListener('click', () => {
  window.idleHive.signOut();
});

document.getElementById('force-update-download-btn').addEventListener('click', () => {
  window.idleHive.openDownloadPage();
});

reloginBtn.addEventListener('click', () => {
  window.idleHive.signOut();
});

window.idleHive.onSetView(({ view, data }) => {
  showView(view);
  if (view === 'login') {
    showAuthTab('login');
  }
  if (view === 'license') {
    const forceUpdateBox = document.getElementById('force-update-box');
    const licenseNormalContent = document.getElementById('license-normal-content');

    if (data && data.forceUpdate) {
      // Tem prioridade sobre qualquer outra coisa — mesmo com licença
      // válida, essa versão específica do app não pode continuar.
      licenseNormalContent.classList.add('hidden');
      forceUpdateBox.classList.remove('hidden');
      document.getElementById('force-update-version').textContent =
        `Versão instalada: ${data.currentVersion} · versão mínima exigida: ${data.minAppVersion}`;
      return;
    }
    forceUpdateBox.classList.add('hidden');
    licenseNormalContent.classList.remove('hidden');

    const isAuthError = !!(data && data.authError);
    const isDeviceLimit = !isAuthError && data && data.reason === 'device_limit';

    if (isAuthError) {
      // O problema aqui é a SESSÃO (token expirado/revogado), não a
      // licença — mostrar "comprar licença" seria enganoso, o que
      // resolve é só entrar de novo.
      reloginBtn.classList.remove('hidden');
      buyLicenseBtn.classList.add('hidden');
      buyLicensePixBtn.classList.add('hidden');
      buyDeviceSlotBtn.classList.add('hidden');
      buyDeviceSlotPixBtn.classList.add('hidden');
      redeemKeyBox.classList.add('hidden');
      refreshLicenseBtn.classList.add('hidden');
      licenseMessage.textContent = 'Sua sessão expirou. Entre de novo pra continuar.';
      return;
    }

    reloginBtn.classList.add('hidden');
    redeemKeyBox.classList.remove('hidden');
    refreshLicenseBtn.classList.remove('hidden');

    // Quando o problema é limite de dispositivos, a conta já tem
    // licença válida — comprar OUTRA licença não resolve, o que falta
    // é um slot extra pra este dispositivo específico.
    // (Stripe desativado por enquanto — só PIX. buyLicenseBtn/
    // buyDeviceSlotBtn ficam sempre escondidos, controlado só pelo
    // "hidden" fixo no HTML — não mexemos na classe deles aqui de
    // propósito, pra não reaparecerem sem querer.)
    buyLicensePixBtn.classList.toggle('hidden', isDeviceLimit);
    buyDeviceSlotPixBtn.classList.toggle('hidden', !isDeviceLimit);

    licenseMessage.textContent =
      (data && data.error) ||
      (data && data.trialEndsAt && new Date(data.trialEndsAt) < new Date()
        ? 'Seu período grátis de 8h acabou. Compre a licença pra continuar usando.'
        : 'Você ainda não tem uma licença ativa.');
  }
  if (view === 'app') {
    latestLicenseStatus = data;
    renderAccountModal();
    // Uma renovação (compra, chave resgatada) sempre passa por um
    // bootstrap novo antes de chegar aqui — se o aviso de expiração
    // ainda estava na tela, esconde e para a contagem regressiva: a
    // reconferência periódica mostra de novo se a licença nova também
    // estiver perto de vencer.
    expiryDeadline = null;
    document.getElementById('expiry-banner').classList.add('hidden');
  }
});

// ---------------------------------------------------------------------
// Modal "Conta e licença" — acessível a qualquer momento (trial ativo,
// licença paga, etc), não só quando o acesso está bloqueado.
// ---------------------------------------------------------------------

const accountBtn = document.getElementById('account-btn');
const accountModal = document.getElementById('account-modal');
const accountModalClose = document.getElementById('account-modal-close');
const accountPlanStatus = document.getElementById('account-plan-status');
const accountBuyLicenseBtn = document.getElementById('account-buy-license-btn');
const accountBuyLicensePixBtn = document.getElementById('account-buy-license-pix-btn');

let latestLicenseStatus = null;

function formatPlanStatus(status) {
  if (!status) return 'Verificando plano...';
  if (status.plan === 'standard' && !status.expiresAt) return 'Licença vitalícia ativa. ✓';
  if (status.plan === 'standard' && status.expiresAt) {
    return `Licença ativa até ${new Date(status.expiresAt).toLocaleString('pt-BR')}.`;
  }
  if (status.plan === 'promo' && status.expiresAt) {
    return `Licença por chave ativa até ${new Date(status.expiresAt).toLocaleDateString('pt-BR')}.`;
  }
  if (status.plan === 'trial' && status.trialEndsAt) {
    const msLeft = new Date(status.trialEndsAt).getTime() - Date.now();
    if (msLeft <= 0) return 'Seu período grátis de 8h acabou.';
    const hoursLeft = Math.max(1, Math.round(msLeft / (60 * 60 * 1000)));
    return `Teste grátis — restam ~${hoursLeft}h.`;
  }
  return 'Sem licença ativa.';
}

function renderAccountModal() {
  accountPlanStatus.textContent = formatPlanStatus(latestLicenseStatus);
  // Só esconde o botão de comprar quando a licença é de verdade
  // PERMANENTE (plano padrão, sem data de expiração nenhuma). Qualquer
  // outro caso — trial, chave por prazo perto de vencer, licença padrão
  // marcada pra expirar (ex: teste manual no banco), ou nenhuma licença
  // — precisa continuar podendo comprar/renovar. Antes, a checagem
  // olhava só o TIPO do plano ('standard'/'promo') e escondia o botão
  // pra qualquer um dos dois, mesmo quando `expiresAt` mostrava que
  // estava prestes a vencer — travando quem precisava renovar.
  const isPermanent =
    latestLicenseStatus && latestLicenseStatus.plan === 'standard' && !latestLicenseStatus.expiresAt;
  // Stripe desativado por enquanto — accountBuyLicenseBtn fica sempre
  // escondido (hidden fixo no HTML), só o botão de PIX é controlado
  // aqui.
  accountBuyLicensePixBtn.classList.toggle('hidden', !!isPermanent);

  // Rótulo do botão acompanha a situação: "Renovar" quando já existe
  // alguma licença (mesmo prestes a vencer) — "Comprar" só quando não
  // existe nenhuma ainda.
  const hasAnyLicense = latestLicenseStatus && (latestLicenseStatus.plan === 'standard' || latestLicenseStatus.plan === 'promo');
  // Atualiza só o texto (o <span> dentro do botão) — o botão tem um
  // ícone (<svg>) antes do texto, então usar .textContent no botão
  // inteiro apagaria o ícone junto.
  const accountPixLabel = accountBuyLicensePixBtn.querySelector('span');
  if (accountPixLabel) {
    accountPixLabel.textContent = hasAnyLicense ? 'Renovar com PIX — R$ 9,90' : 'Pagar com PIX — R$ 9,90';
  }
}

accountBtn.addEventListener('click', () => {
  renderAccountModal();
  accountModal.classList.remove('hidden');
  window.idleHive.setModalOpen(true);
  // Força uma checagem de licença na hora, em vez de confiar só no
  // ciclo periódico (5min) — importante logo depois de pagar/resgatar
  // uma chave em outro lugar, pra já refletir aqui sem esperar.
  window.idleHive.refreshLicense();
});

accountModalClose.addEventListener('click', () => {
  accountModal.classList.add('hidden');
  window.idleHive.setModalOpen(false);
});

accountModal.addEventListener('click', (event) => {
  if (event.target === accountModal) {
    accountModal.classList.add('hidden');
    window.idleHive.setModalOpen(false);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const accModal = document.getElementById('account-modal');
    const affModal = document.getElementById('affiliate-modal');
    if (accModal && !accModal.classList.contains('hidden')) {
      accModal.classList.add('hidden');
      window.idleHive.setModalOpen(false);
    }
    if (affModal && !affModal.classList.contains('hidden')) {
      affModal.classList.add('hidden');
      window.idleHive.setModalOpen(false);
    }
  }
});

accountBuyLicenseBtn.addEventListener('click', async () => {
  const result = await window.idleHive.buyLicense();
  accountPlanStatus.textContent = result.ok
    ? 'Finalize a compra na aba do navegador que abriu, depois feche e reabra este menu.'
    : result.error || 'Não foi possível iniciar o pagamento.';
});

accountBuyLicensePixBtn.addEventListener('click', async () => {
  const result = await window.idleHive.buyLicensePix();
  accountPlanStatus.textContent = result.ok
    ? 'Finalize o PIX na aba do navegador que abriu, depois feche e reabra este menu.'
    : result.error || 'Não foi possível iniciar o pagamento.';
});

document.getElementById('account-redeem-key-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('account-redeem-key-input');
  const errorEl = document.getElementById('account-redeem-key-error');
  errorEl.textContent = '';

  const code = input.value.trim();
  if (!code) return;

  const result = await window.idleHive.redeemKey(code);
  if (!result.ok) {
    errorEl.textContent = result.error || 'Não foi possível resgatar essa chave.';
    return;
  }
  input.value = '';
  accountPlanStatus.textContent = 'Chave resgatada! Sua licença foi atualizada.';
});

document.getElementById('add-account-window-btn').addEventListener('click', () => {
  window.idleHive.openAccountWindow();
  accountModal.classList.add('hidden');
  window.idleHive.setModalOpen(false);
});

// ---------------------------------------------------------------------
// App principal (grade de painéis)
// ---------------------------------------------------------------------

const backToGridBtn = document.getElementById('back-to-grid');
const logoutBtn = document.getElementById('logout-btn');
const form = document.getElementById('add-form');
const nameInput = document.getElementById('account-name');
const urlInput = document.getElementById('account-url');
const addFormCategoryLabel = document.getElementById('add-form-category');
const addFormCancel = document.getElementById('add-form-cancel');
const categoryListEl = document.getElementById('category-list');
const newCategoryForm = document.getElementById('new-category-form');
const newCategoryInput = document.getElementById('new-category-name');
const headersLayer = document.getElementById('headers-layer');

const STATUS_LABEL = {
  online: 'Online',
  erro: 'Erro',
  loading: 'Carregando',
};

let latestState = { accounts: [], headers: [], focusedId: null, categories: [], activeCategoryId: null };
// id da conta em edição inline de nome no momento (null = nenhuma).
let renamingId = null;
// id da categoria em edição inline de nome no momento (null = nenhuma).
let renamingCategoryId = null;
// Categorias recolhidas na sidebar — só estado visual, não persiste.
const collapsedCategories = new Set();

// Cache de referências DOM por conta (dot/status/cpu/ram) — permite
// atualizar só os números a cada 2s sem reconstruir a lista inteira.
// Métricas mudam toda hora; estrutura (quais contas/categorias existem,
// favorito, foco) muda raramente — só reconstrói de verdade quando a
// estrutura muda de verdade.
let accountRowRefs = new Map();
let lastSidebarSignature = null;

function statusLabel(status) {
  return STATUS_LABEL[status] || status;
}

function render(state, force) {
  latestState = state;
  backToGridBtn.disabled = !state.focusedId;

  // As métricas chegam a cada 2s. Se houver um campo de renomear aberto
  // (conta OU categoria), redesenhar destruiria o input no meio da
  // digitação (perdendo o texto e o cursor) — então o redesenho espera
  // a edição terminar.
  if ((renamingId !== null || renamingCategoryId !== null) && !force) {
    return;
  }

  // Reconstrói a sidebar inteira só quando algo estrutural mudou (conta
  // nova, renomeada, movida, favoritada, foco mudou...). Na maioria dos
  // ticks de 2s, só o CPU/RAM/status mudam — nesses casos, atualiza só
  // o texto dos itens que já existem, sem recriar nenhum elemento.
  const signature = computeSidebarSignature(state);
  if (force || signature !== lastSidebarSignature) {
    lastSidebarSignature = signature;
    // Se a conta em edição está visível como painel na grade, é lá que
    // o campo de edição aparece (evita dois <input> disputando foco ao
    // mesmo tempo — um roubava o foco do outro e fechava a edição
    // sozinho).
    const renamingHasHeader = renamingId !== null && state.headers.some((h) => h.id === renamingId);
    renderSidebar(state, renamingHasHeader);
  } else {
    updateAccountMetrics(state);
  }

  renderHeaders(state);
}



function startRename(id) {
  renamingId = id;
  // force:true é obrigatório aqui — sem isso, o próprio guard "não
  // redesenha durante edição" (que acabamos de setar renamingId pra
  // acionar) bloquearia este redesenho, e o campo de edição nunca
  // apareceria.
  render(latestState, true);
}

function cancelRename() {
  renamingId = null;
  render(latestState, true);
}

async function commitRename(id, input) {
  const newName = input.value.trim();
  renamingId = null;
  if (newName) {
    await window.idleHive.renameAccount(id, newName);
  }
  // Redesenha já — o render normal das métricas pode demorar até 2s, e
  // até lá o campo de edição ficaria na tela sem motivo.
  render(latestState, true);
}

function startCategoryRename(id) {
  renamingCategoryId = id;
  render(latestState, true);
}

function cancelCategoryRename() {
  renamingCategoryId = null;
  render(latestState, true);
}

async function commitCategoryRename(id, input) {
  const newName = input.value.trim();
  renamingCategoryId = null;
  if (newName) {
    await window.idleHive.renameCategory(id, newName);
  }
  render(latestState, true);
}

function buildRenameInput(id, currentName, onDone, onCancel) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'rename-input';
  input.value = currentName;

  const finish = () => {
    input.removeEventListener('blur', finish);
    onDone(input);
  };

  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      input.blur();
    } else if (event.key === 'Escape') {
      input.removeEventListener('blur', finish);
      onCancel();
    }
  });
  input.addEventListener('click', (event) => event.stopPropagation());
  input.addEventListener('blur', finish);

  queueMicrotask(() => {
    input.focus();
    input.select();
  });

  return input;
}

// Monta o item de uma aba (usado dentro de cada categoria). Registra as
// referências dos elementos que mudam a cada 2s (dot/status/cpu/ram) no
// Map passado, pra permitir atualização barata sem reconstruir o item.
function buildAccountItem(account, state, renamingHasHeader, refsOut) {
  const isActiveCategory = account.categoryId === state.activeCategoryId;

  const item = document.createElement('li');
  item.className =
    'account-item' +
    (state.focusedId === account.id ? ' focused' : '') +
    (isActiveCategory ? '' : ' background');

  const rowTop = document.createElement('div');
  rowTop.className = 'row-top';

  const nameGroup = document.createElement('div');
  nameGroup.className = 'name-group';

  const dot = document.createElement('span');
  dot.className = `status-dot ${account.status}`;
  nameGroup.appendChild(dot);

  if (account.favorite) {
    const star = document.createElement('span');
    star.className = 'favorite-star';
    star.textContent = '★';
    nameGroup.appendChild(star);
  }

  if (renamingId === account.id && !renamingHasHeader) {
    const input = buildRenameInput(account.id, account.name, (el) => commitRename(account.id, el), cancelRename);
    nameGroup.appendChild(input);
  } else {
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = account.name;
    name.title = account.url;
    name.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      startRename(account.id);
    });
    nameGroup.appendChild(name);
  }

  const statusText = document.createElement('span');
  statusText.className = 'status-label';
  statusText.textContent = statusLabel(account.status);

  rowTop.appendChild(nameGroup);
  rowTop.appendChild(statusText);

  const rowBottom = document.createElement('div');
  rowBottom.className = 'row-bottom';
  const cpuSpan = document.createElement('span');
  cpuSpan.textContent = `CPU ${account.cpu}%`;
  const ramSpan = document.createElement('span');
  ramSpan.textContent = `RAM ${account.ramMB} MB`;
  rowBottom.appendChild(cpuSpan);
  rowBottom.appendChild(ramSpan);

  item.appendChild(rowTop);
  item.appendChild(rowBottom);

  if (refsOut) {
    refsOut.set(account.id, { dot, statusText, cpuSpan, ramSpan });
  }

  item.addEventListener('click', () => {
    if (renamingId === account.id) return;
    // Aba de uma categoria que não está na grade: o clique traz essa
    // categoria pra tela em vez de expandir um painel que não aparece.
    if (!isActiveCategory) {
      window.idleHive.switchCategory(account.categoryId);
      return;
    }
    window.idleHive.toggleExpand(account.id);
  });

  item.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.idleHive.showContextMenu(account.id);
  });

  return item;
}

// Monta uma "assinatura" curta do que estruturalmente importa na sidebar
// (não inclui CPU/RAM/status, que mudam toda hora e não precisam de
// reconstrução — só de atualização de texto). Muda só quando categoria
// ou conta é criada/removida/renomeada/movida, favoritada, ou o foco
// muda — tudo que realmente exige recriar elementos.
function computeSidebarSignature(state) {
  const categories = (state.categories || [])
    .map((c) => `${c.id}:${c.name}:${collapsedCategories.has(c.id) ? 1 : 0}`)
    .join(',');
  const accounts = (state.accounts || [])
    .map((a) => `${a.id}:${a.name}:${a.categoryId}:${a.favorite ? 1 : 0}`)
    .join(',');
  return `${state.activeCategoryId}|${categories}|${accounts}|${state.focusedId}|${renamingId}|${renamingCategoryId}`;
}

// Caminho barato: só atualiza os números/status dos itens que já existem
// no DOM, sem criar nem destruir nenhum elemento. É isto que roda a cada
// 2s na maioria das vezes — o caminho caro (renderSidebar completo) só
// roda quando a estrutura muda de verdade.
function updateAccountMetrics(state) {
  (state.accounts || []).forEach((account) => {
    const refs = accountRowRefs.get(account.id);
    if (!refs) return;
    refs.dot.className = `status-dot ${account.status}`;
    refs.statusText.textContent = statusLabel(account.status);
    refs.cpuSpan.textContent = `CPU ${account.cpu}%`;
    refs.ramSpan.textContent = `RAM ${account.ramMB} MB`;
  });
}

// Sidebar em formato de lista/acordeão: cada categoria é uma seção fixa
// com suas abas embaixo, que podem ser recolhidas clicando no cabeçalho.
function renderSidebar(state, renamingHasHeader) {
  categoryListEl.innerHTML = '';
  accountRowRefs = new Map();

  const categories = state.categories || [];
  const accounts = state.accounts || [];

  categories.forEach((category) => {
    const isActive = category.id === state.activeCategoryId;
    const isCollapsed = collapsedCategories.has(category.id);

    const section = document.createElement('div');
    section.className =
      'category-section' + (isActive ? ' active' : '') + (isCollapsed ? ' collapsed' : '');

    // --- cabeçalho ---
    const header = document.createElement('div');
    header.className = 'category-header';

    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.textContent = '▾';

    const catName = document.createElement('span');
    catName.className = 'cat-name';

    if (renamingCategoryId === category.id) {
      const input = buildRenameInput(category.id, category.name, (el) => commitCategoryRename(category.id, el), cancelCategoryRename);
      catName.appendChild(input);
    } else {
      catName.textContent = category.name;
      catName.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        startCategoryRename(category.id);
      });
    }

    const catAccounts = accounts.filter((a) => a.categoryId === category.id);

    const count = document.createElement('span');
    count.className = 'cat-count';
    count.textContent = String(catAccounts.length);

    const actions = document.createElement('div');
    actions.className = 'category-actions';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.title = 'Adicionar aba nesta categoria';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      // A aba nova sempre entra na categoria ativa, então traz essa
      // categoria pra frente antes de abrir o formulário.
      if (!isActive) await window.idleHive.switchCategory(category.id);
      collapsedCategories.delete(category.id);
      openAddForm(category.name);
    });

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.title = 'Renomear categoria';
    renameBtn.textContent = '✎';
    renameBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      startCategoryRename(category.id);
    });

    actions.appendChild(addBtn);
    actions.appendChild(renameBtn);

    // A última categoria não pode ser removida — o app ficaria sem tela.
    if (categories.length > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'danger';
      removeBtn.title = 'Remover categoria';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        window.idleHive.removeCategory(category.id);
      });
      actions.appendChild(removeBtn);
    }

    header.appendChild(caret);
    header.appendChild(catName);
    header.appendChild(count);
    header.appendChild(actions);

    header.addEventListener('click', () => {
      if (!isActive) {
        // Categoria em segundo plano: primeiro clique traz ela pra grade
        // (e garante que fique aberta pra ver as abas).
        collapsedCategories.delete(category.id);
        window.idleHive.switchCategory(category.id);
        return;
      }
      // Já é a categoria da grade: alterna recolher/expandir a lista.
      if (isCollapsed) collapsedCategories.delete(category.id);
      else collapsedCategories.add(category.id);
      render(latestState, true);
    });

    section.appendChild(header);

    // --- abas da categoria ---
    if (catAccounts.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'category-empty';
      empty.textContent = 'Nenhuma aba aqui ainda.';
      section.appendChild(empty);
    } else {
      const ul = document.createElement('ul');
      ul.className = 'category-accounts';
      catAccounts
        .slice()
        .sort((a, b) => {
          if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1;
          return 0;
        })
        .forEach((account) => {
          ul.appendChild(buildAccountItem(account, state, renamingHasHeader, accountRowRefs));
        });
      section.appendChild(ul);
    }

    categoryListEl.appendChild(section);
  });
}

function renderHeaders(state) {
  headersLayer.innerHTML = '';

  state.headers.forEach((header) => {
    const el = document.createElement('div');
    el.className = `panel-header status-${header.status}`;
    el.style.left = `${header.rect.x}px`;
    el.style.top = `${header.rect.y}px`;
    el.style.width = `${header.rect.width}px`;
    el.style.height = `${header.rect.height}px`;
    el.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      window.idleHive.showContextMenu(header.id);
    });

    const drag = document.createElement('span');
    drag.className = 'drag-handle';
    drag.textContent = '⠿';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'title-group';

    const dot = document.createElement('span');
    dot.className = `status-dot ${header.status}`;
    titleGroup.appendChild(dot);

    if (renamingId === header.id) {
      const input = buildRenameInput(header.id, header.name, (el2) => commitRename(header.id, el2), cancelRename);
      titleGroup.appendChild(input);
    } else {
      const titleText = document.createElement('span');
      titleText.className = 'title-text';
      const namePart = header.favorite ? `★ ${escapeHtml(header.name)}` : escapeHtml(header.name);
      titleText.innerHTML = `<span class="name">${namePart}</span><span class="url">${escapeHtml(hostOnly(header.url))}</span>`;
      titleText.addEventListener('dblclick', (event) => {
        event.stopPropagation();
        startRename(header.id);
      });
      titleGroup.appendChild(titleText);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.title = 'Renomear';
    renameBtn.textContent = '✏️';
    renameBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      startRename(header.id);
    });

    const favoriteBtn = document.createElement('button');
    favoriteBtn.type = 'button';
    favoriteBtn.title = header.favorite ? 'Remover dos favoritos' : 'Favoritar';
    favoriteBtn.textContent = header.favorite ? '★' : '☆';
    favoriteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      window.idleHive.toggleFavorite(header.id);
    });

    const muteBtn = document.createElement('button');
    muteBtn.type = 'button';
    muteBtn.title = header.muted ? 'Reativar áudio' : 'Silenciar';
    muteBtn.textContent = header.muted ? '🔇' : '🔊';
    muteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      window.idleHive.toggleMute(header.id);
    });

    const reloadBtn = document.createElement('button');
    reloadBtn.type = 'button';
    reloadBtn.title = 'Recarregar';
    reloadBtn.textContent = '⟳';
    reloadBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      window.idleHive.reloadAccount(header.id);
    });

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    const isFocused = latestState.focusedId === header.id;
    expandBtn.title = isFocused ? 'Voltar para grade' : 'Expandir';
    expandBtn.textContent = isFocused ? '⤡' : '⤢';
    expandBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      window.idleHive.toggleExpand(header.id);
    });

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'danger';
    closeBtn.title = 'Fechar';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      const confirmed = window.confirm(
        `Remover o painel "${header.name}"? Os dados de login continuam salvos, você pode recriar a conta com a mesma URL depois.`
      );
      if (!confirmed) return;
      await window.idleHive.removeAccount(header.id);
    });

    actions.appendChild(renameBtn);
    actions.appendChild(favoriteBtn);
    actions.appendChild(muteBtn);
    actions.appendChild(reloadBtn);
    actions.appendChild(expandBtn);
    actions.appendChild(closeBtn);

    el.appendChild(drag);
    el.appendChild(titleGroup);
    el.appendChild(actions);

    headersLayer.appendChild(el);
  });
}

function hostOnly(url) {
  try {
    return new URL(url).host;
  } catch (err) {
    return url;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Abre o formulário de nova aba, mostrando em qual categoria ela vai
// entrar (o "+" de cada categoria já deixou ela ativa antes de chamar).
function openAddForm(categoryName) {
  addFormCategoryLabel.textContent = categoryName;
  form.classList.remove('hidden');
  nameInput.focus();
}

function closeAddForm() {
  form.classList.add('hidden');
  nameInput.value = '';
  urlInput.value = '';
}

addFormCancel.addEventListener('click', closeAddForm);

backToGridBtn.addEventListener('click', () => {
  if (latestState.focusedId) {
    window.idleHive.toggleExpand(latestState.focusedId);
  }
});

logoutBtn.addEventListener('click', () => {
  window.idleHive.signOut();
});

const updateBanner = document.getElementById('update-banner');
const updateText = document.getElementById('update-text');
const updateProgressTrack = document.getElementById('update-progress-track');
const updateProgressFill = document.getElementById('update-progress-fill');
const updateRestartBtn = document.getElementById('update-restart-btn');

updateRestartBtn.addEventListener('click', () => {
  // Feedback imediato — instalar+reabrir leva um instante, e sem isso
  // o clique parece não ter feito nada até a janela sumir de repente.
  updateRestartBtn.disabled = true;
  updateRestartBtn.textContent = 'Reiniciando…';
  updateText.textContent = 'Aplicando a atualização...';
  window.idleHive.restartToUpdate();
});

// Estado 1: baixando em segundo plano — barra de progresso de verdade,
// alimentada pelos eventos que o electron-updater dispara a cada pedaço
// baixado.
window.idleHive.onUpdateDownloading(() => {
  updateText.textContent = 'Baixando atualização...';
  updateProgressTrack.classList.remove('hidden');
  updateProgressFill.style.width = '0%';
  updateRestartBtn.classList.add('hidden');
  updateBanner.classList.remove('hidden');
});

window.idleHive.onUpdateProgress(({ percent }) => {
  updateText.textContent = `Baixando atualização... ${percent}%`;
  updateProgressFill.style.width = `${percent}%`;
  updateBanner.classList.remove('hidden');
});

// Log de diagnóstico do auto-updater — só aparece aqui no Console do
// DevTools (Ctrl+Shift+I), nunca na interface. Útil pra saber o que
// está acontecendo de verdade num .exe instalado, que não tem terminal.
window.idleHive.onUpdateDebug((message) => {
  console.log(`[auto-updater] ${message}`);
});

// Estado 2: pronta — some a barra, aparece o botão de reiniciar.
window.idleHive.onUpdateReady(() => {
  updateText.textContent = 'Atualização pronta';
  updateProgressTrack.classList.add('hidden');
  updateRestartBtn.classList.remove('hidden');
  updateRestartBtn.disabled = false;
  updateRestartBtn.textContent = 'Reiniciar agora';
  updateBanner.classList.remove('hidden');
});

// Aviso de licença perto de vencer (trial ou chave promo). O main
// processo reconfere periodicamente e manda o tempo restante quando
// faltar 30min ou menos — mas em vez de só mostrar aquele número fixo
// até chegar o próximo aviso, o app conta os segundos sozinho, ao vivo,
// a partir do horário exato de expiração. Clicar em "Renovar agora"
// abre o mesmo modal de conta/licença que o ícone 🔑 já abre.
let expiryDeadline = null; // timestamp absoluto (ms) de quando vence, ou null

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function tickExpiryCountdown() {
  if (expiryDeadline === null) return;
  const msLeft = expiryDeadline - Date.now();
  const expiryTextEl = document.getElementById('expiry-text');
  if (msLeft <= 0) {
    // Chegou a zero aqui — a checagem do main já está agendada pro
    // momento exato (com poucos segundos de folga) e vai tirar o
    // usuário da grade sozinha. Só evita mostrar um contador negativo
    // enquanto isso não chega.
    expiryTextEl.textContent = 'Expirando...';
    expiryDeadline = null;
    return;
  }
  expiryTextEl.textContent = `Sua licença expira em ${formatCountdown(msLeft)}`;
}

// Roda o tempo todo (custo desprezível — só um textContent por
// segundo), mas só faz alguma coisa quando expiryDeadline está setado.
setInterval(tickExpiryCountdown, 1000);

window.idleHive.onLicenseExpiringSoon(({ msLeft }) => {
  expiryDeadline = Date.now() + msLeft;
  tickExpiryCountdown();
  document.getElementById('expiry-banner').classList.remove('hidden');
});

document.getElementById('expiry-renew-btn').addEventListener('click', () => {
  accountBtn.click();
});

// ---------------------------------------------------------------------
// Modal "Programa de afiliados"
// ---------------------------------------------------------------------

const affiliateBtn = document.getElementById('affiliate-btn');
const affiliateModal = document.getElementById('affiliate-modal');
const affiliateModalClose = document.getElementById('affiliate-modal-close');
const affiliateJoinView = document.getElementById('affiliate-join-view');
const affiliateActiveView = document.getElementById('affiliate-active-view');
const affiliateJoinBtn = document.getElementById('affiliate-join-btn');
const affiliateJoinError = document.getElementById('affiliate-join-error');

function formatCents(cents) {
  return ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function showAffiliateActive(data) {
  affiliateJoinView.classList.add('hidden');
  affiliateActiveView.classList.remove('hidden');
  document.getElementById('aff-activations').textContent = data.activations || 0;
  document.getElementById('aff-pending').textContent = formatCents(data.pendingCents);
  document.getElementById('aff-paid').textContent = formatCents(data.paidCents);
  document.getElementById('aff-code').value = data.code || '';
  document.getElementById('aff-link').value = data.link || '';
}

function showAffiliateJoin() {
  affiliateActiveView.classList.add('hidden');
  affiliateJoinView.classList.remove('hidden');
}

async function openAffiliateModal() {
  affiliateJoinError.textContent = '';
  affiliateModal.classList.remove('hidden');
  window.idleHive.setModalOpen(true);

  const result = await window.idleHive.affiliateMe();
  if (result.ok && result.data && result.data.isAffiliate) {
    showAffiliateActive(result.data);
  } else {
    showAffiliateJoin();
  }
}

affiliateBtn.addEventListener('click', openAffiliateModal);

affiliateModalClose.addEventListener('click', () => {
  affiliateModal.classList.add('hidden');
  window.idleHive.setModalOpen(false);
});

affiliateModal.addEventListener('click', (event) => {
  if (event.target === affiliateModal) {
    affiliateModal.classList.add('hidden');
    window.idleHive.setModalOpen(false);
  }
});

affiliateJoinBtn.addEventListener('click', async () => {
  affiliateJoinError.textContent = '';
  affiliateJoinBtn.disabled = true;
  affiliateJoinBtn.textContent = 'Gerando...';

  const result = await window.idleHive.affiliateJoin();
  affiliateJoinBtn.disabled = false;
  affiliateJoinBtn.textContent = 'Tornar-se afiliado';

  if (!result.ok) {
    affiliateJoinError.textContent = result.error || 'Não foi possível gerar seu código.';
    return;
  }
  // Recarrega o estado completo (com stats zeradas) direto da fonte.
  const me = await window.idleHive.affiliateMe();
  if (me.ok && me.data && me.data.isAffiliate) {
    showAffiliateActive(me.data);
  } else {
    showAffiliateActive({ code: result.data.code, link: result.data.link, activations: 0, pendingCents: 0, paidCents: 0 });
  }
});

// Botões "Copiar" (código e link do afiliado)
document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.copy);
    if (!target) return;
    navigator.clipboard.writeText(target.value).then(() => {
      const original = btn.textContent;
      btn.textContent = 'Copiado ✓';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 1500);
    }).catch(() => {});
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  const url = urlInput.value.trim();
  if (!url) return;

  await window.idleHive.addAccount(name, url);
  closeAddForm();
});

// --- Criar categoria nova ---
newCategoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = newCategoryInput.value.trim();
  if (!name) return;
  await window.idleHive.addCategory(name);
  newCategoryInput.value = '';
  // A categoria nova nasce vazia e já ativa — abre o formulário direto
  // pra ela, que é o passo seguinte natural do fluxo.
  openAddForm(name);
});

window.idleHive.onStateUpdate(render);
window.idleHive.onStartRename(startRename);

// ---------------------------------------------------------------------
// Mercado RMT
// ---------------------------------------------------------------------
//
// A tela do Mercado é um overlay em tela cheia. Como os BrowserViews dos
// jogos são desenhados por cima de qualquer HTML, ela também precisa
// desanexá-los (setModalOpen) enquanto está aberta — mesma mecânica dos
// modais de conta/afiliados.

// ---------------------------------------------------------------------
// Modo Eco
// ---------------------------------------------------------------------
//
// Reduz o ritmo de processamento (CPU) das categorias em segundo plano
// sem derrubar a conexão — diferente do Modo Economia (que fecha o
// navegador de vez, só pra Premium), isso funciona pra qualquer conta.

const ecoModeToggle = document.getElementById('eco-mode-toggle');
const ecoStateLabel = document.getElementById('eco-state');

function renderEcoModeState(enabled) {
  ecoModeToggle.classList.toggle('active', !!enabled);
  ecoStateLabel.textContent = enabled ? 'Ligado' : 'Desligado';
}

// Estado inicial, assim que o app abre.
window.idleHive.getEcoMode().then((enabled) => renderEcoModeState(enabled));

ecoModeToggle.addEventListener('click', async () => {
  const currentlyOn = ecoModeToggle.classList.contains('active');
  const applied = await window.idleHive.toggleEcoMode(!currentlyOn);
  renderEcoModeState(applied);
});

const marketBtn = document.getElementById('market-btn');
const marketOverlay = document.getElementById('market-overlay');
const marketClose = document.getElementById('market-close');
const marketLocked = document.getElementById('market-locked');
const marketLockedText = document.getElementById('market-locked-text');
const marketNicknameView = document.getElementById('market-nickname');
const marketMain = document.getElementById('market-main');
const marketChat = document.getElementById('market-chat');
const marketMyNickname = document.getElementById('market-my-nickname');
const marketMyTier = document.getElementById('market-my-tier');

const nicknameForm = document.getElementById('nickname-form');
const nicknameInput = document.getElementById('nickname-input');
const nicknameError = document.getElementById('nickname-error');

const listingsList = document.getElementById('listings-list');
const conversationsList = document.getElementById('conversations-list');
const listingSearch = document.getElementById('listing-search');
const listingForm = document.getElementById('listing-form');
const listingError = document.getElementById('listing-error');

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatNickname = document.getElementById('chat-nickname');
const chatTier = document.getElementById('chat-tier');
const chatPairNote = document.getElementById('chat-pair-note');
const chatTransaction = document.getElementById('chat-transaction');

let marketFilterKind = '';
let marketSearchTerm = '';
let listingKind = 'venda';
let openConversationId = null;
let chatPollTimer = null;
let lastMessageCount = 0;

function tierBadge(el, reputation) {
  if (!reputation) {
    el.textContent = '';
    el.className = 'tier-badge';
    return;
  }
  el.textContent = `${reputation.tier.label} · ${reputation.total}`;
  el.className = `tier-badge ${reputation.tier.key}`;
}

function showMarketState(state) {
  marketLocked.classList.toggle('hidden', state !== 'locked');
  marketNicknameView.classList.toggle('hidden', state !== 'nickname');
  marketMain.classList.toggle('hidden', state !== 'main');
  marketChat.classList.toggle('hidden', state !== 'chat');
}

async function openMarket() {
  marketOverlay.classList.remove('hidden');
  window.idleHive.setModalOpen(true);

  const result = await window.idleHive.marketProfile();

  if (!result.ok) {
    marketLockedText.textContent = result.error || 'Não foi possível abrir o Mercado.';
    marketMyNickname.textContent = '';
    tierBadge(marketMyTier, null);
    showMarketState('locked');
    return;
  }

  const data = result.data;
  if (data.needsNickname) {
    marketMyNickname.textContent = '';
    tierBadge(marketMyTier, null);
    showMarketState('nickname');
    nicknameInput.focus();
    return;
  }

  marketMyNickname.textContent = data.nickname;
  tierBadge(marketMyTier, data.reputation);
  showMarketState('main');
  switchMarketTab('listings');
}

function closeMarket() {
  stopChatPolling();
  openConversationId = null;
  marketOverlay.classList.add('hidden');
  window.idleHive.setModalOpen(false);
}

marketBtn.addEventListener('click', openMarket);
marketClose.addEventListener('click', closeMarket);

nicknameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  nicknameError.textContent = '';
  const nickname = nicknameInput.value.trim();
  if (!nickname) return;

  const result = await window.idleHive.marketSetNickname(nickname);
  if (!result.ok) {
    nicknameError.textContent = result.error || 'Não foi possível salvar o apelido.';
    return;
  }
  nicknameInput.value = '';
  await openMarket();
});

// --- abas ---

function switchMarketTab(tab) {
  document.querySelectorAll('.market-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.getElementById('tab-listings').classList.toggle('hidden', tab !== 'listings');
  document.getElementById('tab-chats').classList.toggle('hidden', tab !== 'chats');
  document.getElementById('tab-new').classList.toggle('hidden', tab !== 'new');

  if (tab === 'listings') loadListings();
  if (tab === 'chats') loadConversations();
}

document.querySelectorAll('.market-tab').forEach((btn) => {
  btn.addEventListener('click', () => switchMarketTab(btn.dataset.tab));
});

// --- anúncios ---

async function loadListings() {
  listingsList.innerHTML = '<p class="market-empty">Carregando…</p>';
  const result = await window.idleHive.marketListings({ kind: marketFilterKind, q: marketSearchTerm });

  if (!result.ok) {
    listingsList.innerHTML = `<p class="market-empty">${escapeHtml(result.error || 'Falha ao carregar anúncios.')}</p>`;
    return;
  }

  const listings = result.data.listings || [];
  if (listings.length === 0) {
    listingsList.innerHTML = '<p class="market-empty">Nenhum anúncio por aqui ainda.<br />Seja o primeiro a anunciar.</p>';
    return;
  }

  listingsList.innerHTML = '';
  listings.forEach((l) => {
    const card = document.createElement('div');
    card.className = 'listing-card';

    const main = document.createElement('div');
    main.className = 'listing-main';
    main.innerHTML = `
      <span class="listing-kind ${l.kind}">${l.kind === 'venda' ? 'Vendendo' : 'Comprando'}</span>
      <p class="listing-title">${escapeHtml(l.title)}</p>
      ${l.price_text ? `<p class="listing-price">${escapeHtml(l.price_text)}</p>` : ''}
      <div class="listing-meta">
        <span class="tier-badge ${l.reputation.tier.key}">${l.reputation.tier.label} · ${l.reputation.total}</span>
        ${l.character_name ? `<span>char: ${escapeHtml(l.character_name)}</span>` : ''}
      </div>
    `;

    const side = document.createElement('div');
    side.className = 'listing-side';

    if (l.isMine) {
      const meTag = document.createElement('span');
      meTag.className = 'tier-badge';
      meTag.textContent = 'Seu anúncio';
      side.appendChild(meTag);

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = 'Encerrar';
      closeBtn.addEventListener('click', async () => {
        await window.idleHive.marketUpdateListing(l.id, 'concluido');
        loadListings();
      });
      side.appendChild(closeBtn);
    } else {
      // O nick é o convite pra negociar — clicar nele já abre a conversa
      // privada direto, sem precisar de um botão "Negociar" separado.
      const nickBtn = document.createElement('button');
      nickBtn.type = 'button';
      nickBtn.className = 'listing-nick-btn';
      nickBtn.textContent = l.nickname;
      nickBtn.addEventListener('click', async () => {
        const res = await window.idleHive.marketOpenConversation(l.id);
        if (!res.ok) {
          listingsList.insertAdjacentHTML('afterbegin', `<p class="market-empty">${escapeHtml(res.error)}</p>`);
          return;
        }
        openChat(res.data.conversationId);
      });
      side.appendChild(nickBtn);
    }

    card.appendChild(main);
    card.appendChild(side);
    listingsList.appendChild(card);
  });
}

document.querySelectorAll('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    marketFilterKind = chip.dataset.kind;
    loadListings();
  });
});

let searchDebounce = null;
listingSearch.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    marketSearchTerm = listingSearch.value.trim();
    loadListings();
  }, 350);
});

// --- criar anúncio ---

document.querySelectorAll('.kind-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.kind-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    listingKind = btn.dataset.kind;
  });
});

listingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  listingError.textContent = '';

  const payload = {
    kind: listingKind,
    title: document.getElementById('listing-title').value.trim(),
    priceText: document.getElementById('listing-price').value.trim(),
    characterName: document.getElementById('listing-character').value.trim(),
    description: document.getElementById('listing-description').value.trim(),
  };

  const result = await window.idleHive.marketCreateListing(payload);
  if (!result.ok) {
    listingError.textContent = result.error || 'Não foi possível publicar.';
    return;
  }

  listingForm.reset();
  switchMarketTab('listings');
});

// --- conversas ---

async function loadConversations() {
  conversationsList.innerHTML = '<p class="market-empty">Carregando…</p>';
  const result = await window.idleHive.marketConversations();

  if (!result.ok) {
    conversationsList.innerHTML = `<p class="market-empty">${escapeHtml(result.error || 'Falha ao carregar.')}</p>`;
    return;
  }

  const conversations = result.data.conversations || [];
  if (conversations.length === 0) {
    conversationsList.innerHTML = '<p class="market-empty">Você ainda não tem conversas.<br />Abra um anúncio e clique em "Negociar".</p>';
    return;
  }

  conversationsList.innerHTML = '';
  conversations.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'conversation-card';
    card.innerHTML = `
      <div class="listing-main">
        <p class="listing-title">${escapeHtml(c.other.nickname)}</p>
        <div class="listing-meta">
          <span class="tier-badge ${c.other.reputation.tier.key}">${c.other.reputation.tier.label} · ${c.other.reputation.total}</span>
          ${c.listingTitle ? `<span>${escapeHtml(c.listingTitle)}</span>` : ''}
        </div>
      </div>
    `;
    const side = document.createElement('div');
    side.className = 'listing-side';
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = 'Abrir';
    openBtn.addEventListener('click', () => openChat(c.id));
    side.appendChild(openBtn);
    card.appendChild(side);
    conversationsList.appendChild(card);
  });
}

// --- chat ---

function stopChatPolling() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

async function openChat(conversationId) {
  openConversationId = conversationId;
  lastMessageCount = 0;
  chatMessages.innerHTML = '';
  showMarketState('chat');
  await refreshChat();
  stopChatPolling();
  // Sem Realtime: busca mensagens novas a cada 4s enquanto o chat está
  // aberto. Latência irrelevante pra negociar item, e evita montar
  // políticas de RLS + um segundo caminho de autenticação.
  chatPollTimer = setInterval(refreshChat, 4000);
}

document.getElementById('chat-back').addEventListener('click', () => {
  stopChatPolling();
  openConversationId = null;
  showMarketState('main');
  switchMarketTab('chats');
});

async function refreshChat() {
  if (!openConversationId) return;
  const result = await window.idleHive.marketMessages(openConversationId);
  if (!result.ok) return;

  const data = result.data;
  chatNickname.textContent = data.other.nickname;
  tierBadge(chatTier, data.other.reputation);

  chatPairNote.textContent =
    data.pairCountedTransactions > 0
      ? `Vocês já registraram ${data.pairCountedTransactions} transação(ões) entre si.`
      : 'Primeira negociação entre vocês.';

  const messages = data.messages || [];
  // Só redesenha quando chegou mensagem nova — evita piscar a cada 4s.
  if (messages.length !== lastMessageCount) {
    lastMessageCount = messages.length;
    chatMessages.innerHTML = '';
    messages.forEach((m) => {
      const el = document.createElement('div');
      el.className = `msg ${m.mine ? 'mine' : 'theirs'}`;
      const time = new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      el.innerHTML = `${escapeHtml(m.body)}<span class="msg-time">${time}</span>`;
      chatMessages.appendChild(el);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  renderTransactionBar(data.transaction);
}

function renderTransactionBar(tx) {
  chatTransaction.className = 'chat-transaction';
  chatTransaction.innerHTML = '';

  if (tx.completed) {
    chatTransaction.classList.add('done');
    chatTransaction.textContent = tx.counted
      ? '✓ Transação confirmada pelos dois lados e somada à reputação.'
      : `✓ Transação confirmada. ${tx.notCountedReason || ''}`;
    return;
  }

  const info = document.createElement('span');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Confirmar transação';

  if (!tx.canConfirm) {
    info.textContent = `Converse um pouco antes de confirmar (mínimo ${tx.exchange.required} mensagens de cada lado).`;
    btn.disabled = true;
  } else if (tx.iConfirmed) {
    info.textContent = 'Você confirmou. Aguardando o outro lado.';
    btn.disabled = true;
    btn.textContent = 'Aguardando';
  } else if (tx.theyConfirmed) {
    info.textContent = 'O outro lado já confirmou. Confirme também para fechar.';
  } else {
    info.textContent = 'Fecharam negócio? Os dois precisam confirmar.';
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const result = await window.idleHive.marketConfirmTransaction(openConversationId);
    if (!result.ok) {
      info.textContent = result.error || 'Não foi possível confirmar.';
      btn.disabled = false;
      return;
    }
    await refreshChat();
    // Reputação pode ter mudado — atualiza o selo do topo.
    const profile = await window.idleHive.marketProfile();
    if (profile.ok && profile.data.reputation) tierBadge(marketMyTier, profile.data.reputation);
  });

  chatTransaction.appendChild(info);
  chatTransaction.appendChild(btn);
}

chatForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const body = chatInput.value.trim();
  if (!body || !openConversationId) return;

  chatInput.value = '';
  const result = await window.idleHive.marketSendMessage(openConversationId, body);
  if (!result.ok) {
    chatInput.value = body; // devolve o texto pro usuário não perder
    return;
  }
  await refreshChat();
});

// Denúncia com campo inline — window.prompt() não é implementado pelo
// Electron (não mostra nada), então nunca usamos ele aqui.
const reportBox = document.getElementById('report-box');
const reportInput = document.getElementById('report-input');
const reportFeedback = document.getElementById('report-feedback');

document.getElementById('chat-report').addEventListener('click', () => {
  reportBox.classList.toggle('hidden');
  reportFeedback.textContent = '';
  if (!reportBox.classList.contains('hidden')) reportInput.focus();
});

document.getElementById('report-cancel').addEventListener('click', () => {
  reportBox.classList.add('hidden');
  reportInput.value = '';
});

document.getElementById('report-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!openConversationId) return;
  const reason = reportInput.value.trim();
  if (reason.length < 10) {
    reportFeedback.textContent = 'Descreva com pelo menos 10 caracteres.';
    return;
  }

  const result = await window.idleHive.marketReport(openConversationId, reason);
  if (!result.ok) {
    reportFeedback.textContent = result.error || 'Não foi possível enviar a denúncia.';
    return;
  }
  reportInput.value = '';
  reportBox.classList.add('hidden');
  chatPairNote.textContent = 'Denúncia enviada. Nossa equipe vai analisar.';
});
