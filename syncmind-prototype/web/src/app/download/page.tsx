import Link from "next/link";
import { ArrowLeft, MonitorDown } from "lucide-react";

export default function DownloadPage() {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 relative">
            <div className="absolute top-0 -left-1/4 w-[150%] h-[500px] bg-blue-900/10 blur-[120px] rounded-[100%] pointer-events-none" />

            <div className="w-full max-w-2xl bg-slate-900/60 backdrop-blur-xl rounded-2xl shadow-2xl overflow-hidden border border-slate-800 relative z-10">
                <Link href="/" className="absolute top-6 left-6 text-slate-400 hover:text-slate-200 transition">
                    <ArrowLeft className="w-6 h-6" />
                </Link>

                <div className="p-12 pb-6 text-center border-b border-slate-800/50">
                    <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-6 border border-blue-500/20">
                        <MonitorDown className="w-10 h-10 mx-auto text-blue-400" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-4 tracking-tight">Download Electron Assistant</h1>
                    <p className="text-slate-400 text-lg">
                        The desktop agent records, transcribes, and connects your audio to the SyncMind web dashboard securely.
                    </p>
                </div>

                <div className="p-12 pt-8">
                    <div className="mt-4">
                        <button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg transition flex justify-center items-center gap-2">
                            <MonitorDown className="w-5 h-5" />
                            <span>Download Desktop Assistant</span>
                        </button>
                    </div>

                    <div className="mt-8 bg-slate-950/50 border border-slate-800 rounded-xl p-6 text-center">
                        <p className="text-sm font-medium text-slate-400 mb-3">If the Electron build is not present, start the dev environment locally:</p>
                        <div className="bg-slate-900 border border-slate-700 text-blue-300 px-6 py-4 rounded-lg font-mono text-sm tracking-wide text-left inline-block">
                            $ cd electron<br />
                            $ npm run dev
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
