import React, { useState, useEffect, useRef } from 'react';
// import Tesseract from 'tesseract.js';

// With nodeIntegration: true and contextIsolation: false, we can require electron directly in the renderer
const electron = window.require ? window.require('electron') : null;
const ipcRenderer = electron ? electron.ipcRenderer : null;
const desktopCapturer = electron ? electron.desktopCapturer : null;

// Crash Diagnostic Addition
window.onerror = function (message, source, lineno, colno, error) {
    console.error("FATAL CRASH [window.onerror]:", { message, source, lineno, colno, error });
    return false;
};

window.addEventListener('unhandledrejection', function (event) {
    console.error("FATAL CRASH [unhandledrejection]:", event.reason);
});

function App() {
    const [sources, setSources] = useState([]);
    const [selectedSource, setSelectedSource] = useState('');
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState('');
    const [isFloating, setIsFloating] = useState(false);
    const [whisperMode, setWhisperMode] = useState(false);

    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const transcriptEndRef = useRef(null);

    // Audio Refs
    const audioContextRef = useRef(null);
    const sourceNodeRef = useRef(null);
    const processorRef = useRef(null);

    useEffect(() => {
        fetchSources();

        if (ipcRenderer) {
            ipcRenderer.invoke('get-whisper-mode').then(mode => setWhisperMode(mode));
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

    useEffect(() => {
        if (transcriptEndRef.current) {
            transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [liveTranscript]);

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

    // CRASH ISOLATION: Set to 1, then increment after each passing test
    // 1 = button only, 2 = mic capture, 3 = desktop capture, 4 = AudioContext, 5 = ScriptProcessor (log only), 6 = full IPC pipeline
    const CRASH_ISOLATION_STEP = 6;

    const startMonitoring = async () => {
        console.log(`[ISO STEP ${CRASH_ISOLATION_STEP}] Start Capture clicked`);

        // STEP 1 — Button+State only. If app crashes here the issue is in React state.
        setIsMonitoring(true);
        setLiveTranscript("");
        if (CRASH_ISOLATION_STEP === 1) {
            console.log("[ISO STEP 1] PASS: state updated, no crash.");
            return;
        }

        // STEP 2 — Mic-only capture (no desktop). If mic crashes, it's a media API issue.
        if (CRASH_ISOLATION_STEP === 2) {
            try {
                const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                console.log("[ISO STEP 2] PASS: Mic stream acquired.", micStream.getAudioTracks());
                micStream.getTracks().forEach(t => t.stop());
            } catch (err) {
                console.error("[ISO STEP 2] FAIL: Mic capture failed:", err);
            }
            return;
        }

        // STEP 3 — Desktop audio capture.
        // CRITICAL: On Windows/Electron, audio-only desktop capture crashes Chromium.
        // Must request video:true along with audio to open the desktop capture pipeline,
        // then stop the video track immediately.
        if (!selectedSource) {
            console.error("[ISO STEP 3+] No source selected.");
            setIsMonitoring(false);
            return;
        }
        console.log(`[ISO STEP 3+] selectedSource: ${selectedSource}`);

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: selectedSource
                    }
                },
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: selectedSource
                    }
                }
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }

            console.log("[ISO STEP 3+] PASS: Desktop stream acquired.", stream.getTracks());
        } catch (err) {
            console.error("[ISO STEP 3+] FAIL: Desktop capture failed:", err);
            setIsMonitoring(false);
            return;
        }

        if (CRASH_ISOLATION_STEP === 3) {
            stream.getTracks().forEach(t => t.stop());
            console.log("[ISO STEP 3] PASS: stream stopped cleanly.");
            return;
        }

        streamRef.current = stream;

        // STEP 4 — AudioContext only. If this crashes, it's a hardware/driver fault.
        let audioContext;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log(`[ISO STEP 4+] PASS: AudioContext sampleRate: ${audioContext.sampleRate}`);
            audioContextRef.current = audioContext;
        } catch (err) {
            console.error("[ISO STEP 4+] FAIL: AudioContext creation failed:", err);
            stream.getTracks().forEach(t => t.stop());
            setIsMonitoring(false);
            return;
        }

        if (CRASH_ISOLATION_STEP === 4) {
            audioContext.close();
            stream.getTracks().forEach(t => t.stop());
            console.log("[ISO STEP 4] PASS: AudioContext closed cleanly.");
            return;
        }

        // STEP 5 — ScriptProcessor with log only (NO IPC). If this crashes, onaudioprocess is the issue.
        const source = audioContext.createMediaStreamSource(stream);
        sourceNodeRef.current = source;
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            if (CRASH_ISOLATION_STEP === 5) {
                // ONLY log — no conversion, no IPC
                console.log(`[ISO STEP 5] Frame size: ${inputData.length}, sampleRate: ${audioContext.sampleRate}`);
                return;
            }

            // STEP 6 — Full safe conversion + IPC send
            const ratio = audioContext.sampleRate / 16000;
            const newLength = Math.round(inputData.length / ratio);
            const downsampled = new Float32Array(newLength);
            let offset = 0;
            for (let i = 0; i < newLength; i++) {
                downsampled[i] = inputData[Math.floor(offset)] || 0;
                offset += ratio;
            }
            const pcm16 = new Int16Array(downsampled.length);
            for (let i = 0; i < downsampled.length; i++) {
                const s = Math.max(-1, Math.min(1, downsampled[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            if (ipcRenderer) {
                // Use Buffer.from() — Electron 28 IPC cannot deserialize Uint8Array/typed arrays (reason 263 crash)
                const buffer = Buffer.from(pcm16.buffer);
                ipcRenderer.send('audio-chunk', buffer);
            }
        };

        // Must connect to destination (even silent) or onaudioprocess never fires
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0;
        source.connect(processor);
        processor.connect(gainNode);
        gainNode.connect(audioContext.destination);

        if (ipcRenderer) {
            ipcRenderer.send('start-audio');
        }
    };

    const stopMonitoring = () => {
        setIsMonitoring(false);

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

    // OCR disabled
    // const startOcrPipeline = () => {};
    // const processVideoFrame = async () => {};

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
                </div>

                {/* Transcript Panel */}
                <div className="flex-1 bg-surface border border-white/10 rounded flex flex-col p-4 overflow-hidden shadow-lg">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Meeting Transcript</h2>
                        <span className={`text-[10px] px-2 py-1 rounded text-white font-medium ${whisperMode ? 'bg-green-600' : 'bg-blue-600'}`}>
                            {whisperMode ? 'Local Whisper Mode' : 'AWS Transcribe Mode'}
                        </span>
                    </div>
                    <div className="flex-1 overflow-y-auto text-base text-text/90 p-4 bg-black/30 rounded flex flex-col gap-2 relative">
                        {liveTranscript ? (
                            <div className="whitespace-pre-wrap leading-relaxed">{liveTranscript}</div>
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-muted italic">
                                {isMonitoring ? "Listening..." : "Click Start Capture to begin"}
                            </div>
                        )}
                        <div ref={transcriptEndRef} />
                    </div>
                </div>
            </div>

        </div>
    );
}

export default App;
