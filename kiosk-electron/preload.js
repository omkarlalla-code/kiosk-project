const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('kiosk', {
  // State transitions
  gotoPayment: () => ipcRenderer.send('goto-payment'),
  gotoActive: (duration) => ipcRenderer.send('goto-active', duration),
  gotoIdle: () => ipcRenderer.send('goto-idle'),

  // End chat signal from LLM
  endChatSignal: () => ipcRenderer.send('end-chat-signal'),

  // Get configuration
  getConfig: () => ipcRenderer.invoke('get-config'),

  // Session timer updates
  onSessionTimeUpdate: (callback) => {
    ipcRenderer.on('session-time-update', (event, remaining) => callback(remaining));
  }
});
