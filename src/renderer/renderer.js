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
const buyDeviceSlotBtn = document.getElementById('buy-device-slot-btn');
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

buyDeviceSlotBtn.addEventListener('click', async () => {
  const result = await window.idleHive.buyDeviceSlot();
  if (!result.ok) {
    licenseMessage.textContent = result.error || 'Não foi possível iniciar o pagamento.';
  } else {
    licenseMessage.textContent = 'Finalize a compra na aba do navegador que abriu, depois clique em "verificar de novo".';
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

reloginBtn.addEventListener('click', () => {
  window.idleHive.signOut();
});

window.idleHive.onSetView(({ view, data }) => {
  showView(view);
  if (view === 'login') {
    showAuthTab('login');
  }
  if (view === 'license') {
    const isAuthError = !!(data && data.authError);
    const isDeviceLimit = !isAuthError && data && data.reason === 'device_limit';

    if (isAuthError) {
      // O problema aqui é a SESSÃO (token expirado/revogado), não a
      // licença — mostrar "comprar licença" seria enganoso, o que
      // resolve é só entrar de novo.
      reloginBtn.classList.remove('hidden');
      buyLicenseBtn.classList.add('hidden');
      buyDeviceSlotBtn.classList.add('hidden');
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
    buyLicenseBtn.classList.toggle('hidden', isDeviceLimit);
    buyDeviceSlotBtn.classList.toggle('hidden', !isDeviceLimit);

    licenseMessage.textContent =
      (data && data.error) ||
      (data && data.trialEndsAt && new Date(data.trialEndsAt) < new Date()
        ? 'Seu período grátis de 8h acabou. Compre a licença pra continuar usando.'
        : 'Você ainda não tem uma licença ativa.');
  }
  if (view === 'app') {
    latestLicenseStatus = data;
    renderAccountModal();
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

let latestLicenseStatus = null;

function formatPlanStatus(status) {
  if (!status) return 'Verificando plano...';
  if (status.plan === 'standard') return 'Licença ativa (permanente). ✓';
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
  const isPaid = latestLicenseStatus && (latestLicenseStatus.plan === 'standard' || latestLicenseStatus.plan === 'promo');
  accountBuyLicenseBtn.classList.toggle('hidden', !!isPaid);
}

accountBtn.addEventListener('click', () => {
  renderAccountModal();
  accountModal.classList.remove('hidden');
  window.idleHive.setModalOpen(true);
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

function statusLabel(status) {
  return STATUS_LABEL[status] || status;
}

function render(state, force) {
  latestState = state;
  backToGridBtn.disabled = !state.focusedId;

  // As métricas chegam a cada 2s e redesenham a sidebar inteira. Se
  // houver um campo de renomear aberto (conta OU categoria), redesenhar
  // destruiria o input no meio da digitação (perdendo o texto e o
  // cursor) — então o redesenho espera a edição terminar.
  if ((renamingId !== null || renamingCategoryId !== null) && !force) {
    return;
  }

  // Se a conta em edição está visível como painel na grade, é lá que o
  // campo de edição aparece (evita dois <input> disputando foco ao
  // mesmo tempo — um roubava o foco do outro e fechava a edição sozinho).
  const renamingHasHeader = renamingId !== null && state.headers.some((h) => h.id === renamingId);
  renderSidebar(state, renamingHasHeader);
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

// Monta o item de uma aba (usado dentro de cada categoria).
function buildAccountItem(account, state, renamingHasHeader) {
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
  rowBottom.innerHTML = `<span>CPU ${account.cpu}%</span><span>RAM ${account.ramMB} MB</span>`;

  item.appendChild(rowTop);
  item.appendChild(rowBottom);

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

// Sidebar em formato de lista/acordeão: cada categoria é uma seção fixa
// com suas abas embaixo, que podem ser recolhidas clicando no cabeçalho.
function renderSidebar(state, renamingHasHeader) {
  categoryListEl.innerHTML = '';

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
          ul.appendChild(buildAccountItem(account, state, renamingHasHeader));
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

document.getElementById('update-restart-btn').addEventListener('click', () => {
  window.idleHive.restartToUpdate();
});

window.idleHive.onUpdateReady(() => {
  document.getElementById('update-banner').classList.remove('hidden');
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
