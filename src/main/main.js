require('dotenv').config();
const { app, BrowserWindow, BrowserView, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { spawn } = require('child_process');
const TranscriptManager = require('./transcriptManager');
const AwsTranscribeService = require('./awsTranscribe');

const SummaryEngine = require('./summaryEngine');

const USE_AWS_TRANSCRIBE = process.env.USE_AWS_TRANSCRIBE === 'true';
let transcriptionMode = USE_AWS_TRANSCRIBE ? "aws" : "whisper";

let mainWindow;
let scraperView;
let transcriptManager;
let awsTranscribeService;
let summaryEngine;

let localWhisperBuffer = [];
let localWhisperInterval = null;
let whisperProcess = null;

// Meeting Logger Path
const logFilePath = path.join(process.cwd(), 'meeting_log.txt');

ipcMain.handle('get-whisper-mode', () => transcriptionMode === "whisper");
ipcMain.on("toggle-transcription-mode", (event, useAWS) => {
    console.log("Transcription mode switched:", useAWS ? "AWS" : "Whisper");
    transcriptionMode = useAWS ? "aws" : "whisper";
});

let globalAuthToken = "";
let meetingStartTime = null;

ipcMain.on("set-auth-token", (e, token) => {
    globalAuthToken = token;
});

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
    summaryEngine = new SummaryEngine();

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

    // CRASH DIAGNOSTIC: Log renderer crash reason to main process terminal
    app.on('render-process-gone', (event, webContents, details) => {
        console.error('[MAIN CRASH DIAGNOSTIC] render-process-gone:', {
            reason: details.reason,
            exitCode: details.exitCode
        });
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (transcriptManager) transcriptManager.destroy();
    if (summaryEngine) summaryEngine.destroy();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Audio Stream IPC
ipcMain.on('start-audio', (event) => {
    meetingStartTime = Date.now();
    if (transcriptionMode === "whisper") {
        localWhisperBuffer = [];
        if (localWhisperInterval) clearInterval(localWhisperInterval);

        // STEP 7 GUARD: Spawn Python ONCE cleanly, handle errors
        if (!whisperProcess || whisperProcess.killed) {
            try {
                const pythonExe = path.join(process.cwd(), 'venv', 'Scripts', 'python.exe');
                console.log("[WHISPER GUARD] Spawning python process...");
                whisperProcess = spawn(pythonExe, ['whisper_worker.py']);

                whisperProcess.stdout.on('data', (data) => {
                    const strings = data.toString().split('\n');
                    for (const str of strings) {
                        if (!str.trim()) continue;
                        try {
                            const result = JSON.parse(str);
                            if (result.text && result.text.trim()) {
                                transcriptManager.addAwsText(result.text.trim());
                            }
                        } catch (err) {
                            console.error("[WHISPER GUARD] parsing error:", err, "Raw:", str);
                        }
                    }
                });

                whisperProcess.stderr.on('data', (data) => {
                    console.error("[WHISPER GUARD ERR]:", data.toString());
                });

                whisperProcess.on('error', (err) => {
                    console.error("[WHISPER GUARD FATAL] Failed to spawn:", err);
                });

                whisperProcess.on('close', (code) => {
                    console.warn(`[WHISPER GUARD] Process exited with code ${code}`);
                });
            } catch (err) {
                console.error("[WHISPER GUARD FATAL] Exception spawning python:", err);
            }
        } else {
            console.log("[WHISPER GUARD] Reusing existing python process.");
        }

        localWhisperInterval = setInterval(() => {
            if (localWhisperBuffer.length === 0) return;

            const chunks = [...localWhisperBuffer];
            localWhisperBuffer = [];

            // A) Combine Float32 frames
            const inputSampleRate = chunks[0].sampleRate || 48000;
            const totalBytes = chunks.reduce((acc, curr) => acc + curr.data.length, 0);
            const combinedBuffer = Buffer.concat(chunks.map(c => Buffer.from(c.data)), totalBytes);
            // Reconstruct Float32Array from combined bytes
            const combinedFloat32 = new Float32Array(combinedBuffer.buffer, combinedBuffer.byteOffset, combinedBuffer.length / 4);

            // B) Compute RMS
            let sumSquares = 0;
            for (let i = 0; i < combinedFloat32.length; i++) {
                sumSquares += combinedFloat32[i] * combinedFloat32[i];
            }
            const rms = Math.sqrt(sumSquares / combinedFloat32.length);
            if (rms < 0.003) {
                console.log("[DSP LOG] 6s frame skipped (silence). RMS: " + rms);
                return;
            }

            // C) Normalize ONCE
            let maxVal = 0;
            for (let i = 0; i < combinedFloat32.length; i++) {
                const absVal = Math.abs(combinedFloat32[i]);
                if (absVal > maxVal) maxVal = absVal;
            }
            const multiplier = maxVal > 0 ? 1.0 / maxVal : 1.0;
            const normalizedData = new Float32Array(combinedFloat32.length);
            for (let i = 0; i < combinedFloat32.length; i++) {
                normalizedData[i] = combinedFloat32[i] * multiplier;
            }

            // D) Downsample ONCE (Averaging)
            const ratio = inputSampleRate / 16000;
            const newLength = Math.round(normalizedData.length / ratio);
            const downsampled = new Float32Array(newLength);
            for (let i = 0; i < newLength; i++) {
                const startIndex = Math.floor(i * ratio);
                const endIndex = Math.floor((i + 1) * ratio);
                let sum = 0;
                let count = 0;
                for (let j = startIndex; j < endIndex && j < normalizedData.length; j++) {
                    sum += normalizedData[j];
                    count++;
                }
                downsampled[i] = count > 0 ? sum / count : 0;
            }

            // E) Convert to Int16 PCM safely
            const pcm16 = new Int16Array(downsampled.length);
            for (let i = 0; i < downsampled.length; i++) {
                const s = Math.max(-1, Math.min(1, downsampled[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Safe array dispatch
            const safePayload = Buffer.from(new Uint8Array(pcm16.buffer.slice(0)));
            console.log(`[MAIN DSP] Piped normalized chunk to Whisper. Original float points: ${combinedFloat32.length}, Sent bytes: ${safePayload.length}, Rate: ${inputSampleRate}`);

            if (whisperProcess && !whisperProcess.killed && whisperProcess.stdin) {
                try {
                    whisperProcess.stdin.write(safePayload.toString('base64') + '\n');
                } catch (err) {
                    console.error("[WHISPER GUARD] Failed writing to stdin:", err);
                }
            }
        }, 6000);

        mainWindow.webContents.send('audio-status', 'started');
    } else {
        awsTranscribeService.startStream((status) => {
            mainWindow.webContents.send('audio-status', status);
        });
    }
});

// Helper function to prepare Float32 audio for AWS Transcribe (16kHz Int16 PCM)
function processAudioChunk(rawFloat32Buffer, inputSampleRate) {
    const rawFloat32 = new Float32Array(rawFloat32Buffer.buffer, rawFloat32Buffer.byteOffset, rawFloat32Buffer.length / 4);

    // 0) Calculate RMS & Apply Silence Gate
    let sumSquares = 0;
    for (let i = 0; i < rawFloat32.length; i++) {
        sumSquares += rawFloat32[i] * rawFloat32[i];
    }
    const rms = Math.sqrt(sumSquares / rawFloat32.length);
    if (rms < 0.002) {
        console.log(`[AWS DSP] Chunk skipped (silence). RMS: ${rms.toFixed(5)}`);
        return null;
    }

    // 1) Normalize
    let maxVal = 0;
    for (let i = 0; i < rawFloat32.length; i++) {
        if (Math.abs(rawFloat32[i]) > maxVal) maxVal = Math.abs(rawFloat32[i]);
    }
    const multiplier = maxVal > 0 ? 1.0 / maxVal : 1.0;
    const normalizedData = new Float32Array(rawFloat32.length);
    for (let i = 0; i < rawFloat32.length; i++) {
        normalizedData[i] = rawFloat32[i] * multiplier;
    }

    // 2) Downsample to 16kHz
    const ratio = inputSampleRate / 16000;
    const newLength = Math.round(normalizedData.length / ratio);
    const downsampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
        const startIndex = Math.floor(i * ratio);
        const endIndex = Math.floor((i + 1) * ratio);
        let sum = 0, count = 0;
        for (let j = startIndex; j < endIndex && j < normalizedData.length; j++) {
            sum += normalizedData[j];
            count++;
        }
        downsampled[i] = count > 0 ? sum / count : 0;
    }

    // 3) Convert to Int16 PCM
    const pcm16 = new Int16Array(downsampled.length);
    for (let i = 0; i < downsampled.length; i++) {
        const s = Math.max(-1, Math.min(1, downsampled[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    return Buffer.from(new Uint8Array(pcm16.buffer.slice(0)));
}

ipcMain.on('audio-chunk', (event, payload) => {
    // payload is { data: Buffer, sampleRate: number }
    if (!payload || !payload.data) return;

    if (transcriptionMode === "whisper") {
        localWhisperBuffer.push(payload);
        if (localWhisperBuffer.length % 50 === 0) {
            console.log(`[MAIN GUARD] Accumulated ${localWhisperBuffer.length} Whisper audio chunks...`);
        }
    } else {
        if (awsTranscribeService.isActive) {
            const pcmBuffer = processAudioChunk(payload.data, payload.sampleRate);
            if (pcmBuffer) {
                awsTranscribeService.pushAudioChunk(pcmBuffer);
            }
        }
    }
});

ipcMain.on('stop-audio', (event) => {
    const durationSeconds = meetingStartTime ? Math.floor((Date.now() - meetingStartTime) / 1000) : 0;
    const meetingTitle = `Meeting - ${new Date().toLocaleDateString()}`;

    if (transcriptionMode === "whisper") {
        if (localWhisperInterval) clearInterval(localWhisperInterval);
        localWhisperBuffer = [];
        if (whisperProcess && !whisperProcess.killed) {
            whisperProcess.kill();
        }
        whisperProcess = null;
        mainWindow.webContents.send('audio-status', 'stopped');
    } else {
        awsTranscribeService.stopStream((status) => {
            mainWindow.webContents.send('audio-status', status);
        });
    }

    // Trigger Final Upload
    if (transcriptManager) {
        transcriptManager.uploadFinalTranscript(globalAuthToken, durationSeconds, meetingTitle);
    }
    meetingStartTime = null;
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

// ipcMain.on('ocr-caption-detected', (event, text) => {
//     console.log("MAIN PROCESS RECEIVED OCR:", text);
//     if (transcriptManager) {
//         transcriptManager.addScraperText(text);
//     }
// });

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
