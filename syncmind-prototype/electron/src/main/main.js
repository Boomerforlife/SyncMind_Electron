const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');

app.whenReady().then(() => {
    const mainWindow = new BrowserWindow({
        width: 600,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
    }

    // Main API bridge logic: sending transcripts from React -> Electron -> Next.js backend
    ipcMain.handle('send-transcript', async (event, data) => {
        try {
            console.log("Sending transcript from Electron to Next.js POST /api/meetings...");
            const NEXTJS_ENDPOINT = 'http://localhost:3001/api/meetings';

            const response = await axios.post(NEXTJS_ENDPOINT, {
                transcript: data.transcript
            });

            return { success: true, data: response.data };
        } catch (error) {
            console.error("Failed to post transcript:", error.message);
            return { success: false, error: error.message };
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
