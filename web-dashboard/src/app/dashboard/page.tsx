import Link from "next/link";
import { Calendar, Clock, ChevronRight, Download, Bot } from "lucide-react";
import { meetings } from "@/lib/store";

export default function DashboardPage() {
    const demoUser = {
        name: "Demo Account",
        email: "demo@syncmind.app",
    };

    // Output all meetings sorted descending by createdAt
    const sortedMeetings = [...meetings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Navbar */}
            <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md">
                                <Bot className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">SyncMind</span>
                        </div>
                        <div className="flex items-center space-x-6">
                            <Link href="/download" className="text-slate-600 hover:text-blue-600 flex items-center gap-2 font-medium text-sm transition-colors">
                                <Download className="w-4 h-4" /> Download Agent
                            </Link>
                            <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
                                <div className="text-right hidden sm:block">
                                    <div className="text-sm font-semibold text-slate-800">{demoUser.name}</div>
                                    <div className="text-xs text-slate-500">{demoUser.email}</div>
                                </div>
                                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-100 to-blue-100 flex items-center justify-center border border-slate-200 text-blue-600 font-bold text-sm">
                                    DA
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Meeting Intelligence</h1>
                        <p className="text-slate-500 mt-1 text-sm">Review your automatically extracted summaries and action items.</p>
                    </div>
                </div>

                {sortedMeetings.length === 0 ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-16 text-center max-w-2xl mx-auto mt-12">
                        <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Bot className="w-10 h-10 text-blue-500" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 mb-3">No intelligent meetings found</h3>
                        <p className="text-slate-500 mb-8 max-w-md mx-auto leading-relaxed">
                            Connect your desktop agent to start sending live transcripts here. The AI will instantly process them into executable insights.
                        </p>
                        <Link href="/download" className="inline-flex items-center justify-center px-6 py-3 rounded-full shadow-md shadow-blue-600/20 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-105 active:scale-95 transition-all">
                            Get the Desktop Agent
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {sortedMeetings.map((meeting) => (
                            <Link key={meeting.id} href={`/meeting/${meeting.id}`} className="group relative">
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-2xl blur opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
                                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col h-full relative group-hover:-translate-y-1 transition-transform duration-300">
                                    <div className="flex items-start justify-between mb-4">
                                        <h3 className="text-lg font-bold text-slate-900 line-clamp-2 leading-tight pr-4">{meeting.title}</h3>
                                        <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                                            <Bot className="w-4 h-4" />
                                        </div>
                                    </div>

                                    <div className="flex items-center space-x-4 text-xs font-medium text-slate-500 mb-5 bg-slate-50 p-2 rounded-lg">
                                        <span className="flex items-center"><Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> {new Date(meeting.createdAt).toLocaleDateString()}</span>
                                        <span className="flex items-center"><Clock className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> {Math.floor(meeting.duration / 60)}m {meeting.duration % 60}s</span>
                                    </div>

                                    <p className="text-slate-600 text-sm line-clamp-3 mb-6 flex-grow leading-relaxed">
                                        {meeting.summary ? meeting.summary : "Processing AI summary..."}
                                    </p>

                                    <div className="flex items-center justify-between text-blue-600 text-sm font-bold mt-auto group-hover:text-indigo-600 transition-colors">
                                        Review Insights
                                        <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-indigo-50 transition-colors">
                                            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
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
