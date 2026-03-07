import { useState } from 'react';
import { Mic, Send, Bot, Check, Loader2 } from 'lucide-react';

function App() {
  const [transcript, setTranscript] = useState("Team discussed the deployment timeline. We need to deploy the staging server by Friday. The budget constraints remain high. Decided to use AWS Transcribe for the new feature.");
  const [isSending, setIsSending] = useState(false);
  const [status, setStatus] = useState(null);

  const handleSend = async () => {
    if (!transcript.trim()) return;
    setIsSending(true);
    setStatus('sending');

    try {
      // Send IPC message to main.js, which maps to http://localhost:3001/api/meetings
      if (window.electron && window.electron.sendTranscript) {
        const response = await window.electron.sendTranscript({ transcript });
        if (response.success) {
          setStatus('success');
        } else {
          console.error("Upload failed", response.error);
          setStatus('error');
        }
      } else {
        console.warn("Electron IPC not detected. Using dummy delay for browser dev.");
        await new Promise(r => setTimeout(r, 1500));
        setStatus('success');
      }
    } catch (e) {
      console.error(e);
      setStatus('error');
    } finally {
      setIsSending(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 flex flex-col text-slate-200">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl shadow-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center border-2 border-slate-800">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">SyncMind Agent</h1>
          <p className="text-xs text-blue-400 font-medium">Recording Prototype</p>
        </div>
      </div>

      <div className="flex-grow bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-slate-800/50 p-3 border-b border-slate-700/50 flex justify-between items-center">
          <div className="flex gap-2 items-center">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">Live Transcript</span>
          </div>
        </div>

        <textarea
          className="flex-grow bg-transparent p-5 text-slate-300 resize-none focus:outline-none focus:ring-0 leading-relaxed"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Meeting transcript will appear here..."
        />
      </div>

      <div className="mt-6">
        <button
          onClick={handleSend}
          disabled={isSending}
          className="w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition-all text-white font-semibold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-900/40 disabled:opacity-50"
        >
          {isSending ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Uploading to API...</>
          ) : status === 'success' ? (
            <><Check className="w-5 h-5 text-green-300" /> Sent Successfully</>
          ) : status === 'error' ? (
            <>Upload Failed. Check Node console.</>
          ) : (
            <><Send className="w-5 h-5" /> Send to Dashboard</>
          )}
        </button>
      </div>
    </div>
  );
}

export default App;
