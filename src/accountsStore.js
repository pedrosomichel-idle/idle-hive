// src/accountsStore.js
//
// Persistencia simples da lista de contas (id + nome + URL) em um arquivo
// JSON dentro da pasta de dados do usuario do Electron.
//
// IMPORTANTE: as sessoes em si (cookies, cache, localStorage, login) NAO
// ficam aqui. Elas sao gerenciadas automaticamente pelo Chromium atraves
// das partitions "persist:<id>" que o main.js cria para cada BrowserView.
// Este arquivo guarda so os metadados (qual conta existe, com qual nome
// e qual URL abrir).

'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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
    this.accounts = this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        return [];
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (err) {
      console.error('[AccountsStore] Falha ao ler accounts.json:', err);
      return [];
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.accounts, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AccountsStore] Falha ao salvar accounts.json:', err);
    }
  }

  list() {
    return [...this.accounts].sort((a, b) => {
      if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1;
      return 0;
    });
  }

  add({ name, url }) {
    const id = `acct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const account = {
      id,
      name: name && name.trim() ? name.trim() : `Conta ${this.accounts.length + 1}`,
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
    const account = this.accounts.find((a) => a.id === id);
    if (!account) return null;
    account.muted = !!muted;
    this._save();
    return account;
  }

  setFavorite(id, favorite) {
    const account = this.accounts.find((a) => a.id === id);
    if (!account) return null;
    account.favorite = !!favorite;
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
    const account = this.accounts.find((a) => a.id === id);
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
