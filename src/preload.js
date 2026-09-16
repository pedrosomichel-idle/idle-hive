// src/preload.js
//
// Roda em um contexto isolado (contextIsolation: true) e expoe apenas
// as funcoes explicitamente listadas abaixo para o renderer. O renderer
// nunca tem acesso direto ao Node/Electron — so a esta API controlada.

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('idleHive', {
  // Autenticação
  signIn: (email, password) => ipcRenderer.invoke('auth:signIn', { email, password }),
  signUp: (email, password, referralCode) => ipcRenderer.invoke('auth:signUp', { email, password, referralCode }),
  signOut: () => ipcRenderer.invoke('auth:signOut'),

  // Licença
  refreshLicense: () => ipcRenderer.invoke('license:refresh'),
  openAccountWindow: () => ipcRenderer.invoke('app:openAccountWindow'),
  setModalOpen: (isOpen) => ipcRenderer.invoke('app:setModalOpen', isOpen),
  restartToUpdate: () => ipcRenderer.invoke('app:restartToUpdate'),
  affiliateMe: () => ipcRenderer.invoke('affiliate:me'),
  affiliateJoin: () => ipcRenderer.invoke('affiliate:join'),
  buyLicense: () => ipcRenderer.invoke('license:checkout'),
  buyDeviceSlot: () => ipcRenderer.invoke('license:checkoutDeviceSlot'),
  redeemKey: (code) => ipcRenderer.invoke('license:redeemKey', code),

  // Contas / painéis
  addAccount: (name, url) => ipcRenderer.invoke('accounts:add', { name, url }),
  removeAccount: (id) => ipcRenderer.invoke('accounts:remove', id),
  reloadAccount: (id) => ipcRenderer.invoke('accounts:reload', id),
  toggleMute: (id) => ipcRenderer.invoke('accounts:toggleMute', id),
  toggleFavorite: (id) => ipcRenderer.invoke('accounts:toggleFavorite', id),
  toggleExpand: (id) => ipcRenderer.invoke('accounts:toggleExpand', id),
  renameAccount: (id, name) => ipcRenderer.invoke('accounts:rename', { id, name }),
  showContextMenu: (id) => ipcRenderer.send('accounts:contextMenu', id),
  clearAccountSession: (id) => ipcRenderer.invoke('accounts:clearSession', id),

  // Pushes do processo principal
  onStateUpdate: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('state:update', listener);
    return () => ipcRenderer.removeListener('state:update', listener);
  },
  onStartRename: (callback) => {
    const listener = (_event, id) => callback(id);
    ipcRenderer.on('accounts:startRename', listener);
    return () => ipcRenderer.removeListener('accounts:startRename', listener);
  },
  onUpdateReady: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app:updateReady', listener);
    return () => ipcRenderer.removeListener('app:updateReady', listener);
  },
  onSetView: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('ui:setView', listener);
    return () => ipcRenderer.removeListener('ui:setView', listener);
  },
});
