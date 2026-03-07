import Link from "next/link";
import { ArrowLeft, MonitorDown, Key } from "lucide-react";

export default async function DownloadPage() {
    // The simplified token for Electron usage
    const electronToken = "demo-user";

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 relative">
                <Link href="/dashboard" className="absolute top-6 left-6 text-slate-400 hover:text-slate-700 transition">
                    <ArrowLeft className="w-6 h-6" />
                </Link>

                <div className="p-12 pb-6 text-center border-b border-slate-100">
                    <MonitorDown className="w-16 h-16 mx-auto text-blue-600 mb-6" />
                    <h1 className="text-3xl font-bold text-slate-900 mb-4">Install Desktop Assistant</h1>
                    <p className="text-slate-500 text-lg">
                        The Electron desktop assistant records your meetings automatically and intelligently syncs them with your web dashboard.
                    </p>
                </div>

                <div className="p-12 pt-8">
                    <div className="bg-slate-50 rounded-lg border border-indigo-100 p-6 shadow-inner tracking-wide">
                        <div className="flex items-center space-x-2 text-indigo-700 font-semibold mb-4">
                            <Key className="w-5 h-5" />
                            <span>Your Authentication Token</span>
                        </div>
                        <p className="text-sm text-slate-600 mb-4">
                            Copy this token and paste it into your Electron app settings so it knows where to send your transcripts. Keep this secret.
                        </p>
                        <div className="bg-slate-800 text-emerald-400 font-mono text-sm p-4 rounded-md break-all relative">
                            {electronToken}
                        </div>
                    </div>

                    <div className="mt-8 bg-blue-50 border border-blue-100 rounded-lg p-6 text-center">
                        <p className="text-sm font-medium text-blue-800 mb-2">If build is not available yet, run locally using:</p>
                        <code className="bg-white text-blue-900 px-4 py-2 rounded-md shadow-sm font-mono text-lg font-bold">
                            npm run dev
                        </code>
                    </div>
                </div>
            </div>
        </div>
    );
}
