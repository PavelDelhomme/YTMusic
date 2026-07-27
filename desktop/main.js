const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;
let serverProc = null;

function startServer() {
  if (isDev) return; // in dev, use npm run dev separately
  const serverEntry = path.join(__dirname, '..', 'server', 'src', 'index.ts');
  serverProc = spawn('npx', ['tsx', serverEntry], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '8787' },
    stdio: 'inherit',
    shell: true,
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#030303',
    title: 'YTMusic',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL(process.env.YTM_DEV_URL || 'http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadURL('http://localhost:8787');
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  startServer();
  setTimeout(createWindow, isDev ? 0 : 1200);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProc) {
    try {
      serverProc.kill();
    } catch {
      /* ignore */
    }
  }
  if (process.platform !== 'darwin') app.quit();
});
