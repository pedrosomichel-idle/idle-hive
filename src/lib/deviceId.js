// src/lib/deviceId.js
//
// Gera um identificador único na primeira vez que o app roda nesta
// máquina e salva em disco — é esse ID que o backend usa pra saber
// quantos "dispositivos" já ativaram a licença. Não é um fingerprint de
// hardware (não sobrevive a reinstalar o Windows do zero), mas é
// suficiente pra impedir que a mesma licença rode em várias máquinas ao
// mesmo tempo sem controle nenhum.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

function getDeviceId() {
  const filePath = path.join(app.getPath('userData'), 'device-id.txt');

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8').trim();
    if (existing) return existing;
  }

  const id = crypto.randomUUID();
  fs.writeFileSync(filePath, id, 'utf-8');
  return id;
}

module.exports = { getDeviceId };
