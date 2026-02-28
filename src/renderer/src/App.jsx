import React, { useState, useEffect, useRef } from 'react';
import Tesseract from 'tesseract.js';

// With nodeIntegration: true and contextIsolation: false, we can require electron directly in the renderer
const electron = window.require ? window.require('electron') : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;
const desktopCapturer = electron ? electron.desktopCapturer : null;

function App() {
    const [sources, setSources] = useState([]);
    const [selectedSource, setSelectedSource] = useState('');
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState('');
    const [isFloating, setIsFloating] = useState(false);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const streamRef = useRef(null);
    const ocrIntervalRef = useRef(null);

    // Audio Refs
    const audioContextRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const processorRef = useRef(null);

    useEffect(() => {
        fetchSources();

        if (ipcRenderer) {
            ipcRenderer.on('transcript-updated', (event, text) => {
                setLiveTranscript(text);
            });
        }

        return () => {
            stopMonitoring();
            if (ipcRenderer) {
                ipcRenderer.removeAllListeners('transcript-updated');
            }
        };
    }, []);

    const fetchSources = async () => {
        if (ipcRenderer) {
            try {
                const desktopSources = await ipcRenderer.invoke('get-desktop-sources');
                setSources(desktopSources);
                if (desktopSources.length > 0) setSelectedSource(desktopSources[0].id);
            } catch (err) {
                console.error("Failed to fetch sources via IPC:", err);
            }
        } else {
            console.error("ipcRenderer is not available. Ensure nodeIntegration is true.");
        }
    };

    const toggleFloatingMode = async () => {
        if (ipcRenderer) {
            const mode = await ipcRenderer.invoke('toggle-floating-mode');
            setIsFloating(mode);
        }
    };

    const startMonitoring = async () => {
        if (!selectedSource) return;

        try {
            // In older Electron versions, screen capture constraints differ slightly, 
            // but this is standard for modern Electron WebRTC
            // Note: On Windows, capturing audio alongside video via getDisplayMedia or desktopCapturer
            // often fails with "IDXGIDuplicateOutput does not use RGBA" or "-2147024809" if the source 
            // isn't capturable or if the system doesn't support loopback on that specific window.
            // For this MVP, we will try to capture just the video if audio fails, or try audio:false first 
            // based on the user's specific error log.
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false, // Disabling audio capture temporarily to ensure video/OCR does not crash the app
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: selectedSource,
                        minWidth: 1280,
                        maxWidth: 1920,
                        minHeight: 720,
                        maxHeight: 1080
                    }
                }
            });

            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }

            setIsMonitoring(true);

            // Start The Ear (Audio Context -> AWS)
            startAudioPipeline(stream);

            // Start The Eyes (Canvas -> Tesseract)
            startOcrPipeline();

            if (ipcRenderer) {
                ipcRenderer.send('start-audio');
            }

        } catch (err) {
            console.error("Failed to capture stream", err);
            alert("Could not capture the selected window. Please check permissions.");
        }
    };

    const stopMonitoring = () => {
        setIsMonitoring(false);
        if (ocrIntervalRef.current) clearInterval(ocrIntervalRef.current);

        // Stop AV Streams
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        // Stop Audio Processing
        if (processorRef.current) processorRef.current.disconnect();
        if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
        if (audioContextRef.current) audioContextRef.current.close();

        if (ipcRenderer) {
            ipcRenderer.send('stop-audio');
        }
    };

    const startAudioPipeline = (stream) => {
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            console.warn("No audio track found in stream. Please endure 'Share Audio' is enabled system-side.");
            return;
        }

        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(stream);
        sourceNodeRef.current = source;

        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                let s = Math.max(-1, Math.min(1, inputData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            if (ipcRenderer && isMonitoring) {
                ipcRenderer.send('audio-chunk', pcm16.buffer);
            }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
    };

    const startOcrPipeline = () => {
        ocrIntervalRef.current = setInterval(processVideoFrame, 2000);
    };

    const processVideoFrame = async () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.videoWidth === 0) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Bottom 20% coordinates
        const sx = 0;
        const sy = video.videoHeight * 0.8;
        const sw = video.videoWidth;
        const sh = video.videoHeight * 0.2;

        canvas.width = sw;
        canvas.height = sh;

        ctx.filter = 'grayscale(100%) contrast(200%)';
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

        const dataURL = canvas.toDataURL('image/png');

        try {
            const result = await Tesseract.recognize(dataURL, 'eng', { logger: () => { } });
            let currentText = result.data.text.replace(/\n/g, ' ').trim();

            // Basic noise reduction
            if (currentText.length > 5 && ipcRenderer) {
                ipcRenderer.send('ocr-caption-detected', currentText);
            }
        } catch (err) {
            console.error('OCR Error:', err);
        }
    };

    return (
        <div className={`p-4 h-screen flex flex-col gap-4 ${isFloating ? 'bg-black/90 backdrop-blur border border-white/20' : 'bg-background'}`}>

            {/* Header controls */}
            <div className="flex justify-between items-center drag-region">
                <h1 className="font-bold text-lg text-text px-2">Silent Teammate <span className="text-primary text-xs uppercase ml-2">Recorder Mode</span></h1>
                <button className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded no-drag-region" onClick={toggleFloatingMode}>Toggle Popout</button>
            </div>

            <div className="flex gap-2">
                <select
                    className="flex-1 bg-surface border border-white/10 rounded px-2 py-1 text-sm text-text"
                    value={selectedSource}
                    onChange={e => setSelectedSource(e.target.value)}
                    disabled={isMonitoring}
                >
                    {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>

                {!isMonitoring ? (
                    <button onClick={startMonitoring} className="bg-primary hover:bg-primary/90 text-white px-4 py-1 rounded text-sm font-medium">Start Capture</button>
                ) : (
                    <button onClick={stopMonitoring} className="bg-red-500 hover:bg-red-600 text-white px-4 py-1 rounded text-sm font-medium">Stop</button>
                )}
            </div>

            <div className="flex flex-col md:flex-row gap-4 flex-1 min-h-0">
                {/* Video Preview */}
                <div className="flex-1 bg-black border border-white/10 rounded overflow-hidden relative group">
                    <video ref={videoRef} autoPlay muted className="w-full h-full object-contain pointer-events-none" />
                    <div className="absolute bottom-0 w-full h-[20%] border-t-2 border-dashed border-primary bg-primary/10 flex items-center justify-center opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <span className="bg-black/80 text-white text-[10px] px-2 py-1 rounded">OCR Zone</span>
                    </div>
                </div>
                <canvas ref={canvasRef} className="hidden" />

                {/* Transcript Panel */}
                <div className="flex-1 bg-surface border border-white/10 rounded flex flex-col p-3 overflow-hidden">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">Live Merged Transcript</h2>
                    <div className="flex-1 overflow-y-auto text-sm text-text/90 italic p-2 bg-black/20 rounded break-words whitespace-pre-wrap">
                        {liveTranscript || "Awaiting audio and captions..."}
                    </div>
                </div>
            </div>

        </div>
    );
}

export default App;
