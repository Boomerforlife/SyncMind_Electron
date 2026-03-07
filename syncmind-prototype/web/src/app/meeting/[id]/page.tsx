import Link from "next/link";
import { ArrowLeft, Clock, Calendar, CheckSquare, AlertTriangle, Lightbulb } from "lucide-react";
import { meetings } from "@/lib/store";

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const meeting = meetings.find(m => m.id === id);

    if (!meeting) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 relative">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
                <p className="text-xl mb-4 text-slate-400 font-medium">Meeting not found in memory.</p>
                <Link href="/dashboard" className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-full font-medium transition text-white border border-slate-700 shadow-xl">Return to Dashboard</Link>
            </div>
        );
    }

    const parseJson = (val: string | null) => {
        if (!val) return [];
        try { return JSON.parse(val); } catch (e) { return [val]; }
    };

    const actionItems = parseJson(meeting.actionItems);
    const risks = parseJson(meeting.risks);
    const decisions = parseJson(meeting.decisions);

    let transcriptText = meeting.transcript || "Transcript text not found or still processing.";

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col text-slate-100">
            {/* Header */}
            <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
                <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <Link href="/dashboard" className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-xl font-bold tracking-tight text-white">{meeting.title}</h1>
                    </div>
                    <div className="flex items-center space-x-6 text-sm text-slate-400 font-medium">
                        <div className="flex items-center space-x-1.5 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
                            <Calendar className="w-4 h-4 text-indigo-400" />
                            <span>{new Date(meeting.createdAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Split Pane Layout */}
            <main className="flex-grow max-w-[1600px] mx-auto w-full p-6 flex gap-6 h-[calc(100vh-73px)] overflow-hidden relative">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-blue-900/5 blur-[150px] rounded-[100%] pointer-events-none" />

                {/* Left Panel: Transcript */}
                <div className="w-1/2 bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-800 flex flex-col h-full overflow-hidden relative z-10">
                    <div className="p-5 border-b border-slate-800 bg-slate-900/80 flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                        <h2 className="text-lg font-semibold text-white tracking-tight">Full Transcript</h2>
                    </div>
                    <div className="p-8 overflow-y-auto flex-grow text-slate-300/90 leading-loose font-mono text-sm whitespace-pre-wrap selection:bg-blue-500/30 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        {transcriptText}
                    </div>
                </div>

                {/* Right Panel: AI Insights */}
                <div className="w-1/2 flex flex-col gap-6 h-full overflow-y-auto relative z-10 pr-2 pb-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">

                    {/* Summary */}
                    <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-xl border border-slate-800 p-8 flex-shrink-0 group hover:bg-slate-900/80 transition-colors">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                <Lightbulb className="w-5 h-5 text-blue-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Summary</h2>
                        </div>
                        <p className="text-slate-300 leading-relaxed text-lg font-medium">
                            {meeting.summary ? meeting.summary : "No summary available."}
                        </p>
                    </div>

                    {/* Action Items */}
                    <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-xl border border-slate-800 p-8 flex-shrink-0 group hover:bg-slate-900/80 transition-colors">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                <CheckSquare className="w-5 h-5 text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Action Items</h2>
                        </div>
                        <ul className="space-y-4">
                            {actionItems.length > 0 ? actionItems.map((item: any, i: number) => (
                                <li key={i} className="flex items-start bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                    <div className="mt-1 w-2.5 h-2.5 rounded-full bg-emerald-500 mr-4 flex-shrink-0 box-shadow-emerald shadow-emerald-500/50"></div>
                                    <span className="text-slate-200 text-base leading-snug">{typeof item === 'string' ? item : item.description || item.title || JSON.stringify(item)}</span>
                                </li>
                            )) : <p className="text-slate-500">No action items detected.</p>}
                        </ul>
                    </div>

                    {/* Risks */}
                    <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-xl border border-slate-800 p-8 flex-shrink-0 group hover:bg-slate-900/80 transition-colors">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
                                <AlertTriangle className="w-5 h-5 text-rose-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Risks & Blockers</h2>
                        </div>
                        <ul className="space-y-4">
                            {risks.length > 0 ? risks.map((risk: any, i: number) => (
                                <li key={i} className="flex flex-col bg-rose-950/20 p-4 rounded-xl border border-rose-900/30">
                                    <span className="font-bold text-rose-400 uppercase tracking-wider text-xs mb-1">{typeof risk === 'string' ? 'Risk' : risk.severity || 'Risk'}</span>
                                    <span className="text-slate-200">{typeof risk === 'string' ? risk : risk.description || JSON.stringify(risk)}</span>
                                </li>
                            )) : <p className="text-slate-500">No risks detected.</p>}
                        </ul>
                    </div>

                    {/* Decisions */}
                    <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-xl border border-slate-800 p-8 flex-shrink-0 group hover:bg-slate-900/80 transition-colors">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                                <CheckSquare className="w-5 h-5 text-purple-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Decisions</h2>
                        </div>
                        <ul className="space-y-4">
                            {decisions.length > 0 ? decisions.map((dec: any, i: number) => (
                                <li key={i} className="flex items-start bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                    <div className="mt-1 w-2.5 h-2.5 rounded-full bg-purple-500 mr-4 flex-shrink-0 shadow-lg shadow-purple-500/50"></div>
                                    <span className="text-slate-200">{typeof dec === 'string' ? dec : dec.description || JSON.stringify(dec)}</span>
                                </li>
                            )) : <p className="text-slate-500">No decisions detected.</p>}
                        </ul>
                    </div>

                </div>
            </main>
        </div>
    );
}
