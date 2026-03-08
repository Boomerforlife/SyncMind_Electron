const path = require("path");
const dotenv = require("dotenv");
const { app, BrowserWindow, BrowserView, ipcMain, desktopCapturer } = require("electron");

const envPath = app.isPackaged
    ? path.join(process.resourcesPath, ".env")
    : path.join(__dirname, "../../.env");

dotenv.config({ path: envPath });

const fs = require("fs");
const { spawn } = require("child_process");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

let mainWindow;

// Meeting Logger Path
const logFilePath = path.join(process.cwd(), 'meeting_log.txt');

ipcMain.handle('get-whisper-mode', () => false);

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
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, '../preload/preload.js'),
        },
        frame: true,
        transparent: false,
        alwaysOnTop: false,
    });

    // Load Vite dev server if in development, else load local file
    const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
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
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

let audioBuffer = [];
let sampleRate = 16000;

// Audio Stream IPC
ipcMain.on('start-audio', (event) => {
    meetingStartTime = Date.now();
    audioBuffer = [];
    console.log("[AUDIO] recording started");
    mainWindow.webContents.send('audio-status', 'started');
});

ipcMain.on('audio-chunk', (event, payload) => {
    // payload is { data: Array<number>, sampleRate: number }
    if (!payload || !payload.data) return;

    sampleRate = payload.sampleRate || 16000;

    // Convert Array back to Float32 Buffer for the WAV pipeline
    const float32Array = new Float32Array(payload.data);
    const buffer = Buffer.from(float32Array.buffer);
    audioBuffer.push(buffer);
});

async function uploadToS3(filePath, fileName) {
    const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
    const bucketName = "syncmind-meeting-audio";

    try {
        const fileStream = fs.createReadStream(filePath);
        const uploadParams = {
            Bucket: bucketName,
            Key: fileName,
            Body: fileStream,
            ContentType: 'audio/wav'
        };

        console.log(`[S3 UPLOAD] started: Uploading ${fileName} to ${bucketName}...`);
        await s3Client.send(new PutObjectCommand(uploadParams));
        console.log("[S3 UPLOAD] completed");
        return true;
    } catch (err) {
        console.error("[S3 UPLOAD ERROR] Failed to upload audio:", err);
        return false;
    }
}

function writeWavHeader(buffer, sampleRate, numChannels, byteRate) {
    const header = Buffer.alloc(44);
    // RIFF identifier
    header.write('RIFF', 0);
    // file length minus RIFF identifier length and file description length
    header.writeUInt32LE(36 + buffer.length, 4);
    // RIFF type
    header.write('WAVE', 8);
    // format chunk identifier
    header.write('fmt ', 12);
    // format chunk length
    header.writeUInt32LE(16, 16);
    // sample format (raw)
    header.writeUInt16LE(1, 20);
    // channel count
    header.writeUInt16LE(numChannels, 22);
    // sample rate
    header.writeUInt32LE(sampleRate, 24);
    // byte rate (sample rate * block align)
    header.writeUInt32LE(byteRate, 28);
    // block align (channel count * bytes per sample)
    header.writeUInt16LE(numChannels * 2, 32);
    // bits per sample
    header.writeUInt16LE(16, 34);
    // data chunk identifier
    header.write('data', 36);
    // data chunk length
    header.writeUInt32LE(buffer.length, 40);

    return Buffer.concat([header, buffer]);
}

let isProcessingAudio = false;

ipcMain.on('stop-audio', async (event) => {
    if (isProcessingAudio) return;
    isProcessingAudio = true;

    console.log("[AUDIO] recording stopped");
    mainWindow.webContents.send('audio-status', 'stopped');

    if (audioBuffer.length === 0) {
        console.log("[AUDIO] No audio data to save.");
        return;
    }

    // The renderer sends Float32 buffers. We need to convert back to Int16 PCM.
    console.log(`[AUDIO] Processing ${audioBuffer.length} chunks...`);

    const combinedBuffer = Buffer.concat(audioBuffer);
    const float32Array = new Float32Array(combinedBuffer.buffer, combinedBuffer.byteOffset, combinedBuffer.length / 4);

    // Downsample to 16kHz if needed, but for simplicity let's stick to renderer's sample rate
    // and just convert to Int16
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const pcmBuffer = Buffer.from(new Uint8Array(pcm16.buffer.slice(0)));
    const numChannels = 1;
    const byteRate = sampleRate * numChannels * 2;

    const wavBuffer = writeWavHeader(pcmBuffer, sampleRate, numChannels, byteRate);

    const timestamp = Date.now();
    const fileName = `meeting-${timestamp}.wav`;
    const filePath = path.join(process.cwd(), fileName);

    fs.writeFileSync(filePath, wavBuffer);
    console.log(`[AUDIO] audio recording complete: Saved to ${filePath}`);

    audioBuffer = [];

    const uploaded = await uploadToS3(filePath, fileName);

    if (uploaded) {
        // Trigger Next.js API
        const apiEndpoint = process.env.NEXTJS_API_ENDPOINT || 'http://localhost:3001/api/process-meeting';
        console.log(`[API] Triggering backend API: ${apiEndpoint} for ${fileName}`);

        let attempts = 0;
        let success = false;

        while (attempts < 3 && !success) {
            try {
                // We use standard fetch available in Node.js 18+ (Electron 29 supports global fetch)
                const response = await global.fetch(apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${globalAuthToken}`
                    },
                    body: JSON.stringify({ audioFileName: fileName })
                });

                if (!response.ok) {
                    console.error(`[API ERROR] Backend responded with status: ${response.status}`);
                    break; // If it responded but with an error status (e.g. 500), no point retrying connection
                } else {
                    console.log("[API] backend triggered");
                    success = true;
                }
            } catch (err) {
                attempts++;
                console.error(`[API ERROR] Backend unavailable. Retrying in 2 seconds... (Attempt ${attempts}/3)`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (!success) {
            console.error("[API ERROR] Failed to trigger backend after retries.");
        }
    }

    isProcessingAudio = false;
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
