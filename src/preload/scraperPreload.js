const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scraperApi', {
    sendCaption: (text) => ipcRenderer.send('scraper-caption-detected', text)
});
