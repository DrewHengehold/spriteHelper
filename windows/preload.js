// The only bridge from the Henrik page to the app: grabbing/dragging and the right-click menu.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hockey', {
  grab: () => ipcRenderer.send('grab'),
  release: () => ipcRenderer.send('release'),
  menu: () => ipcRenderer.send('menu'),
})
