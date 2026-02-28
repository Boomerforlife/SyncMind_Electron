require('dotenv').config();
const { app, BrowserWindow, BrowserView, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const TranscriptManager = require('./transcriptManager');
const AwsTranscribeService = require('./awsTranscribe');

let mainWindow;
let scraperView;
let transcriptManager;
let awsTranscribeService;

// Meeting Logger Path
const logFilePath = path.join(process.cwd(), 'meeting_log.txt');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        frame: true,
        transparent: false,
        alwaysOnTop: false,
    });

    transcriptManager = new TranscriptManager();
    awsTranscribeService = new AwsTranscribeService(transcriptManager);

    // Note: We are keeping the old BrowserView code intact just in case, but
    // the new Architecture relies on the <webview> in the Renderer.
    // Creating the hidden Scraper BrowserView (Legacy/Hybrid)
    scraperView = new BrowserView({
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload/scraperPreload.js')
        }
    });

    mainWindow.setBrowserView(scraperView);
    // Hide it out of bounds
    scraperView.setBounds({ x: 0, y: 0, width: 0, height: 0 });

    // Load a placeholder meeting URL
    scraperView.webContents.loadURL('https://teams.microsoft.com');

    // Inject our observer once loaded
    scraperView.webContents.on('did-finish-load', () => {
        scraperView.webContents.executeJavaScript(`
            (function() {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            // Example selector for Teams/Zoom
                            if (node.nodeType === 1 && (node.matches('.ts-message-text') || node.classList.contains('caption-content'))) {
                                const text = node.innerText || node.textContent;
                                if (text && window.scraperApi) {
                                    window.scraperApi.sendCaption(text);
                                }
                            }
                        });
                    });
                });
                observer.observe(document.body, { childList: true, subtree: true });
                console.log('Hybrid Sensor: Caption Observer Injected');
            })();
        `);
    });

    // Load Vite dev server if in development, else load local file
    const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (transcriptManager) transcriptManager.destroy();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Audio Stream IPC
ipcMain.on('start-audio', (event) => {
    awsTranscribeService.startStream((status) => {
        mainWindow.webContents.send('audio-status', status);
    });
});

ipcMain.on('audio-chunk', (event, chunk) => {
    // chunk is passed from renderer as ArrayBuffer -> Buffer
    if (awsTranscribeService.isActive) {
        awsTranscribeService.pushAudioChunk(chunk);
    }
});

ipcMain.on('stop-audio', (event) => {
    awsTranscribeService.stopStream((status) => {
        mainWindow.webContents.send('audio-status', status);
    });
});

// Scraper IPC from hidden view
ipcMain.on('scraper-caption-detected', (event, text) => {
    if (transcriptManager) {
        transcriptManager.addScraperText(text);
        mainWindow.webContents.send('caption-status', 'detected');

        // Reset to idle after 3 seconds of no captions
        if (global.captionTimeout) clearTimeout(global.captionTimeout);
        global.captionTimeout = setTimeout(() => {
            mainWindow.webContents.send('caption-status', 'idle');
        }, 3000);
    }
});

ipcMain.on('ocr-caption-detected', (event, text) => {
    if (transcriptManager) {
        transcriptManager.addScraperText(text);
    }
});

let isFloating = false;

ipcMain.handle('toggle-floating-mode', () => {
    if (!mainWindow) return false;

    isFloating = !isFloating;

    if (isFloating) {
        // For transparent, it usually requires a restart or the window to be created with transparent: true
        // However, on Windows/macOS we can do this dynamically or just simulate it
        mainWindow.setAlwaysOnTop(true, 'floating');

        // We can't dynamically change 'frame' and 'transparent' easily in Electron without recreating the window,
        // so let's check what happens. Wait, we can't change 'frame' dynamically on Windows.
        // Let me recreate the window or just stick to 'alwaysOnTop' and bounds change for this demo?
        // Actually, setting bounds and always on top is the core, and frameless can be default if needed.
        // Wait! Let's just create a new window OR we can make it frameless initially and draw our own title bar.
        // For now, let's just make it always on top and smaller.
        mainWindow.setBounds({ width: 400, height: 600 });
    } else {
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setBounds({ width: 900, height: 700 });
    }

    return isFloating;
});

ipcMain.handle('send-transcript', async (event, data) => {
    try {
        // Placeholder AWS API Gateway endpoint
        const endpoint = 'https://placeholder.execute-api.us-east-1.amazonaws.com/dev/process';

        // In a real scenario, this Axios request happens here:
        // const response = await axios.post(endpoint, { transcript: data });
        // return response.data;

        // Simulating response matching the Data Contract:
        console.log('Received transcript in Main process, simulating AWS call...', data);

        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    id: "msg_12345",
                    summary: "This was a discussion about the upcoming launch of the Silent Teammate MVP. The team aligned on completing the Electron scaffold by Friday.",
                    tasks: [
                        { title: "Complete Electron Setup", owner: "John", deadline: "Friday", status: "In Progress" },
                        { title: "Finalize AWS endpoint", owner: "Sarah", deadline: "Next Tuesday", status: "Pending" }
                    ],
                    risks: [
                        { description: "API Gateway rate limits might be hit", severity: "High", relatedTask: "Finalize AWS endpoint" }
                    ]
                });
            }, 1500);
        });
    } catch (error) {
        console.error('Error sending transcript to API Gateway:', error);
        throw error;
    }
});

// Meeting Log file IPC
ipcMain.on('save-log', (event, text) => {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${text}\n`;
        fs.appendFileSync(logFilePath, logEntry);
    } catch (err) {
        console.error('Failed to write to meeting log:', err);
    }
});

// Screen Capture Sources
ipcMain.handle('get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
    return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
    }));
});
