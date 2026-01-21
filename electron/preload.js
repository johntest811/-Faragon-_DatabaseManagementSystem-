const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  admin: {
    createUser: (payload) => ipcRenderer.invoke('admin:createUser', payload),
    deleteUserPermanently: (payload) => ipcRenderer.invoke('admin:deleteUserPermanently', payload),
  },
});