/**
 * Electron Preload Script
 * Exposes safe APIs to renderer process
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  env: process.env.NODE_ENV,
});
