import React from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Terminal, Shield, Cpu, Sparkles } from 'lucide-react'
import AIChatPanel from '@/components/AIChatPanel'

export default function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center py-20 px-6 overflow-hidden bg-[#030407]">
      {/* Background Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-500/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-500/10 blur-[120px]" />
      
      <div className="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
        {/* Left: Text & CTA */}
        <div className="lg:col-span-5 flex flex-col gap-6 text-left">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs text-[#a855f7] font-semibold w-fit"
          >
            <Sparkles size={12} />
            <span>NEXA IDE v1.0.0 Launching Soon</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight"
          >
            The Code Editor <br />
            <span className="bg-gradient-to-r from-[#a855f7] via-[#818cf8] to-[#06b6d4] bg-clip-text text-transparent">
              Built for Agentic AI
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base text-slate-400 leading-relaxed max-w-lg"
          >
            Experience a state-of-the-art desktop development environment where your AI assistant, terminal managers, and version control loops work in absolute harmony.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap gap-4 mt-2"
          >
            <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#a855f7] to-[#6366f1] text-sm font-semibold text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all">
              <span>Get Started</span>
              <ArrowRight size={14} />
            </button>
            <button className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] text-sm font-semibold text-slate-300 transition-all">
              <span>Read Docs</span>
            </button>
          </motion.div>
        </div>

        {/* Right: Premium IDE Mockup with mounted AIChatPanel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="lg:col-span-7 w-full h-[500px] rounded-2xl border border-white/[0.08] bg-[#07080c]/80 backdrop-blur-xl relative overflow-hidden shadow-2xl"
        >
          {/* Custom Window Header bar */}
          <div className="flex items-center justify-between px-4 py-3 bg-[#0d0e15] border-b border-white/[0.04] select-none">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <span className="text-[10px] text-slate-500 font-mono tracking-wider font-semibold">NEXUS MOCKUP PREVIEW</span>
            <div className="w-12" />
          </div>

          {/* Editor Layout Split view */}
          <div className="flex h-[calc(100%-41px)] w-full">
            {/* Mock Editor Workspace */}
            <div className="flex-1 p-5 font-mono text-[11px] text-slate-400 leading-relaxed bg-[#040508]/40 border-r border-white/[0.04] overflow-hidden select-none">
              <span className="text-purple-400">import</span> {'{'} binarySearch {'}'} <span className="text-purple-400">from</span> <span className="text-cyan-400">'./search'</span>
              <br /><br />
              <span className="text-amber-400">function</span> <span className="text-blue-400">evaluateMetrics</span>() {'{'}
              <br />
              &nbsp;&nbsp;<span className="text-slate-600">// Compute binary paths</span>
              <br />
              &nbsp;&nbsp;<span className="text-purple-400">const</span> arr = [1, 2, 3, 5, 8, 13];
              <br />
              &nbsp;&nbsp;<span className="text-purple-400">const</span> target = 8;
              <br />
              &nbsp;&nbsp;<span className="text-purple-400">const</span> index = <span className="text-blue-400">binarySearch</span>(arr, target);
              <br />
              &nbsp;&nbsp;<span className="text-purple-400">console</span>.<span className="text-blue-400">log</span>(<span className="text-cyan-400">{"`Found at: ${index}`"}</span>);
              <br />
              {'}'}
              
              {/* Fake Terminal Output */}
              <div className="mt-8 p-3 rounded-xl border border-white/[0.04] bg-[#0c0d12]/90">
                <div className="flex items-center gap-1.5 text-[9px] text-[#475569] font-sans font-bold uppercase tracking-wider mb-2">
                  <Terminal size={10} className="text-emerald-400" />
                  <span>Terminal</span>
                </div>
                <div className="text-[10px] text-emerald-400/90 font-mono select-none">
                  $ node search.js
                  <br />
                  <span className="text-slate-500">Found at index: 4</span>
                </div>
              </div>
            </div>

            {/* Premium AI Chat Panel (Live Interactive Component) */}
            <div className="w-[320px] h-full shrink-0">
              <AIChatPanel />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

