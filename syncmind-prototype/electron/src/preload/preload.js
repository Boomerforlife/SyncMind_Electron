const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    sendTranscript: (data) => ipcRenderer.invoke('send-transcript', data)
});
