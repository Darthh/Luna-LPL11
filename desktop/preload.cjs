
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lunaDesktop', {
  navigate: page => ipcRenderer.invoke('luna:navigate', page),
  models: () => ipcRenderer.invoke('ollama:models'),
  chat: payload => ipcRenderer.invoke('ollama:chat', payload),
});
