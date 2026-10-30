const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  summarize: (url) => ipcRenderer.invoke('pet:summarize', url),
  openExternal: (url) => ipcRenderer.invoke('pet:open-external', url),
  close: () => ipcRenderer.send('pet:close'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('pet:set-ignore-mouse', ignore)
});
