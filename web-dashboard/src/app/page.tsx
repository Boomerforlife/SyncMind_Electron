"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Mic, Zap, CheckCircle, ArrowRight, Shield } from "lucide-react";

export default function Home() {
  const containerVariants: any = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.2 }
    }
  };

  const itemVariants: any = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5 } }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-hidden relative selection:bg-blue-500/30">
      {/* Background Gradients */}
      <div className="absolute top-0 -left-1/4 w-[150%] h-[500px] bg-blue-900/20 blur-[120px] rounded-[100%] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/10 blur-[150px] rounded-full pointer-events-none" />

      {/* Nav */}
      <nav className="flex items-center justify-between p-6 max-w-7xl mx-auto relative z-10">
        <div className="text-2xl font-bold tracking-tighter text-white flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Mic className="w-4 h-4 text-white" />
          </div>
          SyncMind
        </div>
        <div className="flex gap-4 items-center">
          <Link href="/dashboard" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
            Demo Login
          </Link>
          <Link href="/dashboard" className="text-sm font-medium bg-white text-slate-950 px-4 py-2 rounded-full hover:bg-slate-200 transition-colors">
            Try Demo
          </Link>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 pt-20 pb-24 relative z-10 flex flex-col items-center">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="text-center max-w-4xl mx-auto"
        >
          <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-900/30 border border-blue-500/20 text-blue-300 text-sm font-medium mb-8">
            <Zap className="w-4 h-4" />
            <span>v2.0 Beta with AWS Bedrock Intelligence</span>
          </motion.div>

          <motion.h1 variants={itemVariants} className="text-5xl md:text-7xl font-extrabold tracking-tight mb-8 leading-[1.1]">
            Turn your meetings into <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">
              instant intelligence.
            </span>
          </motion.h1>

          <motion.p variants={itemVariants} className="text-lg md:text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            A silent teammate that records, transcribes, and extracts action items from your calls using enterprise-grade AI algorithms.
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/dashboard" className="group flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-8 py-4 rounded-full font-semibold text-lg transition-all shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:scale-105 active:scale-95">
              Launch Dashboard
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </motion.div>

        {/* How it works section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mt-32 w-full max-w-5xl"
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight mb-4 text-white">How it works</h2>
            <p className="text-slate-400">Three simple steps to unlock your meeting intelligence.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Mic className="w-6 h-6 text-blue-400" />,
                title: "1. Capture",
                desc: "The lightweight Electron app silently monitors your system audio with high-precision AWS Streaming.",
                delay: 0
              },
              {
                icon: <Zap className="w-6 h-6 text-indigo-400" />,
                title: "2. Analyze",
                desc: "AWS Bedrock instantly parses your transcript identifying context, blockers, and decisions.",
                delay: 0.2
              },
              {
                icon: <CheckCircle className="w-6 h-6 text-purple-400" />,
                title: "3. Execute",
                desc: "Your dashboard organizes assigned action items and summarizes the meeting narrative perfectly.",
                delay: 0.4
              }
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: step.delay, duration: 0.6 }}
                className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 p-8 rounded-2xl hover:bg-slate-800/80 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mb-6 border border-slate-700">
                  {step.icon}
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
                <p className="text-slate-400 leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
