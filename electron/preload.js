const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  admin: {
    createUser: (payload) => ipcRenderer.invoke('admin:createUser', payload),
    deleteUserPermanently: (payload) => ipcRenderer.invoke('admin:deleteUserPermanently', payload),
  },

  settings: {
    loadNotificationConfig: () => ipcRenderer.invoke('settings:loadNotificationConfig'),
    saveNotificationConfig: (payload) => ipcRenderer.invoke('settings:saveNotificationConfig', payload),
    saveLocalNotificationPrefs: (payload) => ipcRenderer.invoke('settings:saveLocalNotificationPrefs', payload),
    clearStoredGmailAppPassword: () => ipcRenderer.invoke('settings:clearStoredGmailAppPassword'),
    removeGmailSender: () => ipcRenderer.invoke('settings:removeGmailSender'),
  },

  gmail: {
    getStatus: () => ipcRenderer.invoke('gmail:getStatus'),
    connect: () => ipcRenderer.invoke('gmail:connect'),
    disconnect: () => ipcRenderer.invoke('gmail:disconnect'),
  },

  notifications: {
    previewExpiring: (payload) => ipcRenderer.invoke('notifications:previewExpiring', payload),
    getLog: (payload) => ipcRenderer.invoke('notifications:getLog', payload),
    sendTestEmail: (payload) => ipcRenderer.invoke('notifications:sendTestEmail', payload),
    runNow: () => ipcRenderer.invoke('notifications:runNow'),
  },
});