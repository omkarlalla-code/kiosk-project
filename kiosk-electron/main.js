const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;
let currentState = 'idle'; // idle, payment, active
let sessionTimer = null;
let sessionEndTime = null;

// Configuration
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3000';

function createWindow() {
  mainWindow = new BrowserWindow({
    fullscreen: true,
    frame: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false
    }
  });

  // Load idle state initially
  loadState('idle');

  // Disable menu bar
  mainWindow.setMenu(null);

  // Dev tools (disable in production)
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Prevent window close (kiosk mode)
  mainWindow.on('close', (e) => {
    if (process.env.ALLOW_CLOSE !== 'true') {
      e.preventDefault();
    }
  });
}

function loadState(state) {
  currentState = state;
  const htmlFile = path.join(__dirname, 'renderer', `${state}.html`);
  mainWindow.loadFile(htmlFile);
  console.log(`[STATE] Loaded: ${state}`);
}

// State transitions
ipcMain.on('goto-payment', () => {
  console.log('[TRANSITION] idle → payment');
  loadState('payment');
});

ipcMain.on('goto-active', (event, duration) => {
  console.log(`[TRANSITION] payment → active (${duration}s)`);

  // Set session timer
  sessionEndTime = Date.now() + (duration * 1000);
  loadState('active');

  // Start countdown
  sessionTimer = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((sessionEndTime - Date.now()) / 1000));
    mainWindow.webContents.send('session-time-update', remaining);

    if (remaining === 0) {
      endSession();
    }
  }, 1000);
});

ipcMain.on('goto-idle', () => {
  console.log('[TRANSITION] → idle');
  endSession();
});

ipcMain.on('end-chat-signal', () => {
  console.log('[LLM SIGNAL] Chat ended by AI');
  endSession();
});

function endSession() {
  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
  }
  sessionEndTime = null;
  loadState('idle');
}

// Get config for renderer
ipcMain.handle('get-config', () => {
  return {
    orchestratorUrl: ORCHESTRATOR_URL,
    kioskId: 'kiosk-001'
  };
});

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Keyboard shortcuts for kiosk control (admin only)
const { globalShortcut } = require('electron');

app.on('ready', () => {
  // Ctrl+Shift+Q to quit (emergency exit)
  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    console.log('[ADMIN] Emergency exit triggered');
    process.env.ALLOW_CLOSE = 'true';
    app.quit();
  });

  // Ctrl+Shift+R to reload
  globalShortcut.register('CommandOrControl+Shift+R', () => {
    console.log('[ADMIN] Reload triggered');
    mainWindow.reload();
  });

  // Ctrl+Shift+I to toggle dev tools
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    mainWindow.webContents.toggleDevTools();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
