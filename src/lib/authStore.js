// src/lib/authStore.js
//
// Guarda a sessão do Supabase (access_token/refresh_token) localmente,
// criptografada com o safeStorage do Electron (usa o DPAPI do Windows
// por baixo). Assim o token não fica em texto puro no disco.

'use strict';

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

function sessionFilePath() {
  return path.join(app.getPath('userData'), 'session.enc');
}

function saveSession(session) {
  const filePath = sessionFilePath();
  const json = JSON.stringify(session);

  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback raro (SO sem suporte a criptografia local): salva sem
    // criptografar em vez de quebrar o login.
    fs.writeFileSync(filePath, json, 'utf-8');
    return;
  }

  const encrypted = safeStorage.encryptString(json);
  fs.writeFileSync(filePath, encrypted);
}

function loadSession() {
  const filePath = sessionFilePath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath);

    if (!safeStorage.isEncryptionAvailable()) {
      return JSON.parse(raw.toString('utf-8'));
    }
    const decrypted = safeStorage.decryptString(raw);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error('[authStore] Falha ao ler sessão salva:', err);
    return null;
  }
}

function clearSession() {
  const filePath = sessionFilePath();
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error('[authStore] Falha ao limpar sessão:', err);
  }
}

module.exports = { saveSession, loadSession, clearSession };
