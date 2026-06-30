import React from 'react'
import { motion } from 'framer-motion'
import { Terminal, GitPullRequest, Database, LayoutGrid, Sparkles } from 'lucide-react'
import AIChatPanel from '@/components/AIChatPanel'

export default function FeaturesGrid() {
  const cards = [
    {
      title: 'Deep Git Integration',
      desc: 'Stage changed files, inspect colored diff panels, and run branch checkouts inside a single side-panel.',
      icon: <GitPullRequest size={16} className="text-emerald-400" />
    },
    {
      title: 'Split Multi-Terminal',
      desc: 'Spawn, manage, and persist multiple terminal processes in the bottom panel with full xterm web-link support.',
      icon: <Terminal size={16} className="text-cyan-400" />
    },
    {
      title: 'Database Explorer',
      desc: 'Browse relational database nodes, view tables, and write inline SQL queries using the database dashboard.',
      icon: <Database size={16} className="text-amber-400" />
    }
  ]

  return (
    <section className="py-24 px-6 bg-[#030407] relative overflow-hidden">
      {/* Background radial accent */}
      <div className="absolute top-[50%] left-[50%] -translate-x-[50%] -translate-y-[50%] w-[60%] h-[60%] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />

      <div className="max-w-7xl w-full mx-auto relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#06b6d4] mb-2">IDE Features</h2>
          <h3 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Designed for Speed and Efficiency
          </h3>
          <p className="mt-4 text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
            Everything you need for full-stack software development, engineered directly into your native desktop workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left: AI Showcase Card (Large span 7) */}
          <div className="lg:col-span-7 rounded-2xl border border-white/[0.06] bg-[#08090e]/95 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden group min-h-[460px]">
            {/* Ambient edge glows */}
            <div className="absolute inset-0 pointer-events-none rounded-2xl border border-purple-500/10 shadow-[inset_0_0_15px_rgba(139,92,246,0.03)]" />
            
            <div className="flex flex-col gap-3 text-left relative z-10 max-w-md">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-500/10 border border-purple-500/20 text-[#a855f7] mb-2">
                <Sparkles size={18} />
              </div>
              <h4 className="text-lg font-bold text-white group-hover:text-purple-400 transition-colors">
                Premium Copilot Assistant
              </h4>
              <p className="text-[12px] text-slate-400 leading-relaxed">
                Chat with local models or cloud-powered LLMs. Code outputs feature Monaco editor highlights, quick-actions, and copy buttons.
              </p>
            </div>

            {/* Embedded Live AIChatPanel container */}
            <div className="mt-6 w-full h-[320px] rounded-xl overflow-hidden border border-white/[0.04] bg-[#0c0d14]/40 relative shadow-inner">
              <AIChatPanel />
            </div>
          </div>

          {/* Right: Static Feature Cards (Span 5) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {cards.map((card, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="flex-1 rounded-2xl border border-white/[0.06] bg-[#08090e]/60 p-6 flex flex-col gap-3 text-left hover:border-white/[0.1] hover:bg-[#08090e]/80 transition-all shadow-md"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.02] border border-white/[0.06]">
                  {card.icon}
                </div>
                <h4 className="text-sm font-bold text-white leading-none mt-1">
                  {card.title}
                </h4>
                <p className="text-[11.5px] text-slate-400 leading-relaxed">
                  {card.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
