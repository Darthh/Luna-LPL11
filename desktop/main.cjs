
const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ollama = require('./ollama.cjs');
const SITE = 'https://fearandgreedgraph.com';
const offline = path.join(__dirname, 'offline', 'index.html');
const offlineURL = pathToFileURL(offline).href;
let win;
let chatting = false;
function authorize(event) {
  const frame = event.senderFrame;
  if (!win || event.sender !== win.webContents || frame !== win.webContents.mainFrame ||
      !(frame.url === offlineURL || new URL(frame.url).origin === SITE)) {
    throw new Error('Untrusted desktop request.');
  }
}
function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 940, title: 'Luna Terminal',
    backgroundColor: '#101218',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== offlineURL && new URL(url).origin !== SITE) event.preventDefault();
  });
  win.webContents.on('did-fail-load', (_event, code, _description, url, mainFrame) => {
    if (mainFrame && code !== -3 && url !== offlineURL) win.loadFile(offline);
  });
  win.loadFile(offline);
}
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  ipcMain.handle('luna:navigate', (event, page) => {
    authorize(event);
    const pages = { overview: '/', dashboard: '/dashboard', maps: '/maps', screener: '/screener', earnings: '/earnings-calendar', hedgefunds: '/hedge-funds' };
    if (page === 'ollama') return require('electron').shell.openExternal('https://ollama.com/download');
    if (!Object.hasOwn(pages, page)) throw new Error('Unknown terminal page.');
    return win.loadURL(SITE + pages[page]).catch(() => win.loadFile(offline));
  });
  ipcMain.handle('ollama:models', event => { authorize(event); return ollama.models(); });
  ipcMain.handle('ollama:chat', async (event, payload) => {
    authorize(event);
    if (chatting) throw new Error('A local answer is already being generated.');
    chatting = true;
    try { return await ollama.chat(payload); } finally { chatting = false; }
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { label: 'Luna Terminal', submenu: [
      { label: 'Home · Local workspace', click: () => win.loadFile(offline) },
      { label: 'Live dashboard', click: () => win.loadURL(SITE + '/dashboard').catch(() => win.loadFile(offline)) },
      { type: 'separator' }, { role: 'quit' }
    ] }, { role: 'editMenu' }, { role: 'viewMenu' }
  ]));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
