import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Calendar, CheckSquare, AlertTriangle, Lightbulb } from "lucide-react";
import fs from "fs";
import path from "path";
import { meetings } from "@/lib/store";

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const meeting = meetings.find(m => m.id === id);

    if (!meeting) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800">
                <p className="text-xl mb-4 text-slate-600">Meeting not found (or memory reset).</p>
                <Link href="/dashboard" className="text-blue-600 font-semibold hover:underline">Return to Dashboard</Link>
            </div>
        );
    }

    // Handle parsing the JSON arrays for Insights
    const parseJson = (val: string | null) => {
        if (!val) return [];
        try { return JSON.parse(val); } catch (e) { return [val]; }
    };

    const actionItems = parseJson(meeting.actionItems);
    const risks = parseJson(meeting.risks);
    const decisions = parseJson(meeting.decisions);

    // Read transcript text
    // Since we are mocking everything in-memory, the raw transcript is stored directly in transcriptUrl.
    let transcriptText = meeting.transcriptUrl || "Transcript text not found or still processing.";

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Header */}
            <header className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <Link href="/dashboard" className="text-slate-500 hover:text-slate-800 transition">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-xl font-bold text-slate-900">{meeting.title}</h1>
                    </div>
                    <div className="flex items-center space-x-6 text-sm text-slate-500 font-medium">
                        <div className="flex items-center space-x-1">
                            <Calendar className="w-4 h-4" />
                            <span>{new Date(meeting.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center space-x-1">
                            <Clock className="w-4 h-4" />
                            <span>{Math.floor(meeting.duration / 60)}m {meeting.duration % 60}s</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content: Split Pane */}
            <main className="flex-grow max-w-[1600px] mx-auto w-full p-6 flex gap-6 h-[calc(100vh-73px)] overflow-hidden">

                {/* Left Panel: Transcript */}
                <div className="w-1/2 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                    <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                        <h2 className="text-lg font-semibold text-slate-900">Transcript</h2>
                    </div>
                    <div className="p-6 overflow-y-auto flex-grow text-slate-700 leading-relaxed font-serif whitespace-pre-wrap">
                        {transcriptText}
                    </div>
                </div>

                {/* Right Panel: AI Insights */}
                <div className="w-1/2 flex flex-col gap-6 h-full overflow-y-auto">

                    {/* Summary */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-shrink-0">
                        <div className="flex items-center space-x-2 mb-4 text-blue-600">
                            <Lightbulb className="w-5 h-5" />
                            <h2 className="text-lg font-semibold text-slate-900">Summary</h2>
                        </div>
                        <p className="text-slate-700 leading-relaxed">
                            {meeting.summary ? meeting.summary : "No summary available."}
                        </p>
                    </div>

                    {/* Action Items */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-shrink-0">
                        <div className="flex items-center space-x-2 mb-4 text-green-600">
                            <CheckSquare className="w-5 h-5" />
                            <h2 className="text-lg font-semibold text-slate-900">Action Items</h2>
                        </div>
                        <ul className="space-y-3">
                            {actionItems.length > 0 ? actionItems.map((item: any, i: number) => (
                                <li key={i} className="flex items-start">
                                    <div className="mt-1 w-2 h-2 rounded-full bg-green-500 mr-3 flex-shrink-0"></div>
                                    <span className="text-slate-700 break-words">{typeof item === 'string' ? item : item.description || item.title || JSON.stringify(item)}</span>
                                </li>
                            )) : <p className="text-slate-500 text-sm">No action items detected.</p>}
                        </ul>
                    </div>

                    {/* Risks */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-shrink-0">
                        <div className="flex items-center space-x-2 mb-4 text-red-500">
                            <AlertTriangle className="w-5 h-5" />
                            <h2 className="text-lg font-semibold text-slate-900">Risks & Blockers</h2>
                        </div>
                        <ul className="space-y-3">
                            {risks.length > 0 ? risks.map((risk: any, i: number) => (
                                <li key={i} className="flex flex-col bg-red-50 p-3 rounded-lg border border-red-100">
                                    <span className="font-semibold text-red-900">{typeof risk === 'string' ? 'Risk' : risk.severity || 'Risk'}</span>
                                    <span className="text-red-800 mt-1">{typeof risk === 'string' ? risk : risk.description || JSON.stringify(risk)}</span>
                                </li>
                            )) : <p className="text-slate-500 text-sm">No risks detected.</p>}
                        </ul>
                    </div>

                    {/* Decisions */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex-shrink-0">
                        <div className="flex items-center space-x-2 mb-4 text-purple-600">
                            <CheckSquare className="w-5 h-5" />
                            <h2 className="text-lg font-semibold text-slate-900">Decisions</h2>
                        </div>
                        <ul className="space-y-3">
                            {decisions.length > 0 ? decisions.map((dec: any, i: number) => (
                                <li key={i} className="flex items-start">
                                    <div className="mt-1 w-2 h-2 rounded-full bg-purple-500 mr-3 flex-shrink-0"></div>
                                    <span className="text-slate-700">{typeof dec === 'string' ? dec : dec.description || JSON.stringify(dec)}</span>
                                </li>
                            )) : <p className="text-slate-500 text-sm">No decisions detected.</p>}
                        </ul>
                    </div>

                </div>
            </main>
        </div>
    );
}
