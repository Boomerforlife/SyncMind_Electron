import Link from "next/link";
import { Calendar, ChevronRight, Bot } from "lucide-react";
import { meetings } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
    const sortedMeetings = [...meetings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <div className="absolute top-0 -left-1/4 w-[150%] h-[500px] bg-indigo-900/10 blur-[120px] rounded-[100%] pointer-events-none" />

            {/* Navbar */}
            <nav className="bg-slate-900/50 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <Link href="/" className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">SyncMind</span>
                        </Link>
                        <div className="flex items-center space-x-6">
                            <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-blue-400 font-bold text-sm">
                                TS
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-10">
                <div className="mb-8">
                    <h1 className="text-3xl font-extrabold text-white tracking-tight">Meeting Intelligence</h1>
                    <p className="text-slate-400 mt-1 text-sm">Review your automatically extracted summaries and action items.</p>
                </div>

                {sortedMeetings.length === 0 ? (
                    <div className="bg-slate-900/40 backdrop-blur-sm rounded-2xl border border-slate-800 p-16 text-center max-w-2xl mx-auto mt-12 shadow-2xl">
                        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-700">
                            <Bot className="w-10 h-10 text-indigo-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3">No intelligent meetings found</h3>
                        <p className="text-slate-400 mb-8 max-w-md mx-auto leading-relaxed">
                            Connect your desktop agent to start sending live transcripts here. The S3/Bedrock pipeline will instantly process them.
                        </p>
                        <Link href="/download" className="inline-flex items-center justify-center px-6 py-3 rounded-full shadow-lg shadow-blue-900/20 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 active:scale-95 transition-all">
                            Get the Desktop Agent
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {sortedMeetings.map((meeting) => (
                            <Link key={meeting.id} href={`/meeting/${meeting.id}`} className="group relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur opacity-0 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none" />
                                <div className="bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-800 p-6 flex flex-col h-full relative group-hover:-translate-y-1 transition-transform duration-300 shadow-xl">
                                    <div className="flex items-start justify-between mb-4">
                                        <h3 className="text-lg font-bold text-white line-clamp-2 leading-tight pr-4">{meeting.title}</h3>
                                        <div className="w-8 h-8 rounded-full bg-slate-800 text-indigo-400 flex items-center justify-center flex-shrink-0 border border-slate-700">
                                            <Bot className="w-4 h-4" />
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-4 text-xs font-medium text-slate-400 mb-5 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                                        <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-500" /> {new Date(meeting.createdAt).toLocaleDateString()}</span>
                                    </div>

                                    <div className="mb-4 flex-grow">
                                        <h4 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Summary</h4>
                                        <p className="text-slate-300 text-sm line-clamp-3 leading-relaxed">
                                            {meeting.summary}
                                        </p>
                                    </div>

                                    <div className="mb-6">
                                        <h4 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">Action Items</h4>
                                        <p className="text-indigo-300 text-sm font-medium">
                                            {(() => {
                                                try {
                                                    const items = JSON.parse(meeting.actionItems);
                                                    return `${items.length} tasks`;
                                                } catch (e) { return "0 tasks"; }
                                            })()}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between text-blue-400 text-sm font-bold mt-auto group-hover:text-indigo-400 transition-colors">
                                        Review Insights
                                        <div className="w-8 h-8 rounded-full bg-blue-900/30 flex items-center justify-center group-hover:bg-indigo-900/50 transition-colors">
                                            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
