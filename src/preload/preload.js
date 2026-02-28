const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    sendTranscript: (data) => ipcRenderer.invoke('send-transcript', data),
    toggleFloatingMode: () => ipcRenderer.invoke('toggle-floating-mode'),

    // Audio streaming
    startAudio: () => ipcRenderer.send('start-audio'),
    stopAudio: () => ipcRenderer.send('stop-audio'),
    sendAudioChunk: (chunk) => ipcRenderer.send('audio-chunk', chunk),

    // Events from main
    onAudioStatus: (callback) => {
        ipcRenderer.removeAllListeners('audio-status');
        ipcRenderer.on('audio-status', (event, status) => callback(status));
    },
    onCaptionStatus: (callback) => {
        ipcRenderer.removeAllListeners('caption-status');
        ipcRenderer.on('caption-status', (event, status) => callback(status));
    },

    // Logger
    saveLog: (text) => ipcRenderer.send('save-log', text),

    // Screen Capture
    getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources')
});
