// src/accountsStore.js
//
// Persistencia da lista de categorias e contas (id + nome + URL) em um
// arquivo JSON dentro da pasta de dados do usuario do Electron.
//
// IMPORTANTE: as sessoes em si (cookies, cache, localStorage, login) NAO
// ficam aqui. Elas sao gerenciadas automaticamente pelo Chromium atraves
// das partitions "persist:<id>" que o main.js cria para cada BrowserView.
// Este arquivo guarda so os metadados (qual conta existe, em qual
// categoria, com qual nome e qual URL abrir).
//
// Formato em disco:
//   {
//     "version": 2,
//     "categories": [{ id, name, createdAt }],
//     "accounts":   [{ id, categoryId, name, url, muted, favorite, createdAt }],
//     "activeCategoryId": "<id>"
//   }
//
// Arquivos gravados pela versao antiga (um array puro de contas, sem
// categorias) sao migrados automaticamente na primeira leitura: todas as
// contas existentes vao pra uma categoria "Principal", sem perder nada.

'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

class AccountsStore {
  // userId: id do usuário logado no Supabase Auth. Cada usuário tem seu
  // próprio arquivo (accounts-<userId>.json) — sem isso, contas de
  // usuários diferentes que usam o mesmo Windows apareceriam misturadas.
  constructor(userId) {
    if (!userId) {
      throw new Error('AccountsStore requer um userId pra isolar os dados por conta.');
    }
    this.userId = userId;
    this.filePath = path.join(app.getPath('userData'), `accounts-${userId}.json`);

    const data = this._load();
    this.categories = data.categories;
    this.accounts = data.accounts;
    this.activeCategoryId = data.activeCategoryId;
    // Modo Eco: reduz o ritmo de processamento de categorias em segundo
    // plano (throttling de CPU real, via protocolo de debug do
    // Chromium) sem derrubar a conexão — funciona pra qualquer conta,
    // não só Premium. Desligado por padrão até ser testado a fundo.
    this.ecoModeEnabled = !!data.ecoModeEnabled;
  }

  _emptyState() {
    const category = { id: newId('cat'), name: 'Principal', createdAt: new Date().toISOString() };
    return { categories: [category], accounts: [], activeCategoryId: category.id, ecoModeEnabled: false };
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return this._emptyState();
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      // Formato antigo: array puro de contas, sem categorias. Migra tudo
      // pra uma categoria "Principal" sem perder nenhuma conta.
      if (Array.isArray(parsed)) {
        const category = { id: newId('cat'), name: 'Principal', createdAt: new Date().toISOString() };
        const accounts = parsed.map((a) => ({ ...a, categoryId: category.id }));
        return { categories: [category], accounts, activeCategoryId: category.id, ecoModeEnabled: false };
      }

      if (!parsed || !Array.isArray(parsed.categories) || parsed.categories.length === 0) {
        return this._emptyState();
      }

      const categories = parsed.categories;
      const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
      const validIds = new Set(categories.map((c) => c.id));

      // Conta órfã (categoria apagada fora do app, arquivo editado à mão)
      // volta pra primeira categoria em vez de sumir da interface.
      accounts.forEach((a) => {
        if (!a.categoryId || !validIds.has(a.categoryId)) {
          a.categoryId = categories[0].id;
        }
      });

      const activeCategoryId = validIds.has(parsed.activeCategoryId)
        ? parsed.activeCategoryId
        : categories[0].id;

      return { categories, accounts, activeCategoryId, ecoModeEnabled: !!parsed.ecoModeEnabled };
    } catch (err) {
      console.error('[AccountsStore] Falha ao ler o arquivo de contas:', err);
      return this._emptyState();
    }
  }

  _save() {
    try {
      const payload = {
        version: 2,
        categories: this.categories,
        accounts: this.accounts,
        activeCategoryId: this.activeCategoryId,
        ecoModeEnabled: this.ecoModeEnabled,
      };
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AccountsStore] Falha ao salvar o arquivo de contas:', err);
    }
  }

  getEcoModeEnabled() {
    return this.ecoModeEnabled;
  }

  setEcoModeEnabled(enabled) {
    this.ecoModeEnabled = !!enabled;
    this._save();
    return this.ecoModeEnabled;
  }

  // ---------------------------------------------------------------------
  // Categorias
  // ---------------------------------------------------------------------

  listCategories() {
    return [...this.categories];
  }

  getActiveCategoryId() {
    return this.activeCategoryId;
  }

  setActiveCategory(id) {
    if (!this.categories.some((c) => c.id === id)) return null;
    this.activeCategoryId = id;
    this._save();
    return id;
  }

  addCategory(name) {
    const category = {
      id: newId('cat'),
      name: name && name.trim() ? name.trim() : `Categoria ${this.categories.length + 1}`,
      createdAt: new Date().toISOString(),
    };
    this.categories.push(category);
    // Criar uma categoria já leva o usuário pra ela — é o fluxo que ele
    // espera ("cria categoria → cria a tela → adiciona as abas").
    this.activeCategoryId = category.id;
    this._save();
    return category;
  }

  renameCategory(id, name) {
    const category = this.categories.find((c) => c.id === id);
    if (!category) return null;
    category.name = name && name.trim() ? name.trim() : category.name;
    this._save();
    return category;
  }

  // Remove a categoria E todas as contas dentro dela. Nunca deixa o app
  // sem nenhuma categoria (a última não pode ser removida).
  removeCategory(id) {
    if (this.categories.length <= 1) return false;
    if (!this.categories.some((c) => c.id === id)) return false;

    this.categories = this.categories.filter((c) => c.id !== id);
    this.accounts = this.accounts.filter((a) => a.categoryId !== id);

    if (this.activeCategoryId === id) {
      this.activeCategoryId = this.categories[0].id;
    }
    this._save();
    return true;
  }

  // Ids das contas de uma categoria — usado pelo main.js pra saber quais
  // BrowserViews destruir quando a categoria inteira é removida.
  accountIdsInCategory(id) {
    return this.accounts.filter((a) => a.categoryId === id).map((a) => a.id);
  }

  // ---------------------------------------------------------------------
  // Contas
  // ---------------------------------------------------------------------

  // Só as contas da categoria ativa — é isso que a grade desenha.
  list() {
    return this.accounts
      .filter((a) => a.categoryId === this.activeCategoryId)
      .sort((a, b) => {
        if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1;
        return 0;
      });
  }

  // Todas as contas, de todas as categorias — usado pelo main.js pra
  // manter vivos os BrowserViews das categorias em segundo plano.
  listAll() {
    return [...this.accounts];
  }

  find(id) {
    return this.accounts.find((a) => a.id === id) || null;
  }

  add({ name, url }) {
    const countInCategory = this.accounts.filter((a) => a.categoryId === this.activeCategoryId).length;
    const account = {
      id: newId('acct'),
      categoryId: this.activeCategoryId,
      name: name && name.trim() ? name.trim() : `Conta ${countInCategory + 1}`,
      url: this._normalizeUrl(url),
      muted: false,
      favorite: false,
      createdAt: new Date().toISOString(),
    };
    this.accounts.push(account);
    this._save();
    return account;
  }

  setMuted(id, muted) {
    const account = this.find(id);
    if (!account) return null;
    account.muted = !!muted;
    this._save();
    return account;
  }

  setFavorite(id, favorite) {
    const account = this.find(id);
    if (!account) return null;
    account.favorite = !!favorite;
    this._save();
    return account;
  }

  // Move uma conta pra outra categoria (arrastar/organizar depois).
  moveToCategory(id, categoryId) {
    const account = this.find(id);
    if (!account) return null;
    if (!this.categories.some((c) => c.id === categoryId)) return null;
    account.categoryId = categoryId;
    this._save();
    return account;
  }

  remove(id) {
    const before = this.accounts.length;
    this.accounts = this.accounts.filter((a) => a.id !== id);
    this._save();
    return this.accounts.length !== before;
  }

  rename(id, name) {
    const account = this.find(id);
    if (!account) return null;
    account.name = name && name.trim() ? name.trim() : account.name;
    this._save();
    return account;
  }

  _normalizeUrl(url) {
    if (!url) return 'https://example.com';
    const trimmed = url.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }
}

module.exports = AccountsStore;
