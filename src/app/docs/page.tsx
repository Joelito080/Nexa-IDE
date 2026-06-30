'use client'

import React, { useState, useEffect } from 'react'
import { 
  BookOpen, Code2, Bug, Terminal, GitBranch, 
  Settings, Key, ChevronRight, ArrowLeft, Cpu, Sparkles 
} from 'lucide-react'

interface DocSection {
  id: string
  title: string
  icon: React.ReactNode
  content: React.ReactNode
}

const DOCS_SECTIONS: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: <BookOpen size={14} />,
    content: (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <BookOpen size={18} className="text-purple-400" /> Welcome to NEXA IDE
        </h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          NEXA IDE is a premium desktop development environment built with Electron, React, and Monaco. It natively integrates local and cloud LLMs to streamline your coding workflow.
        </p>
        <div className="p-4 rounded-xl border border-white/[0.04] bg-white/[0.01] space-y-2">
          <h3 className="text-xs font-semibold text-slate-200">System Prerequisites</h3>
          <ul className="list-disc pl-4 text-xs text-slate-400 space-y-1">
            <li>Operating System: Windows 10/11, macOS 11+, Linux Ubuntu 20+</li>
            <li>OpenRouter API key via Settings or <code className="text-purple-300">OPENROUTER_API_KEY</code> in .env</li>
            <li>100+ models available through the unified OpenRouter backend</li>
          </ul>
        </div>
      </div>
    )
  },
  {
    id: 'ai-copilot',
    title: 'AI Copilot',
    icon: <Cpu size={14} />,
    content: (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Cpu size={18} className="text-purple-400" /> AI Assistant Panel
        </h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          The sidebar AI panel connects to OpenRouter. It evaluates selection lines, attaches workspace files to prompt contexts, and streams responses with slash commands like /fix, /refactor, and /debug.
        </p>
        <div className="p-4 rounded-xl border border-white/[0.04] bg-white/[0.01] space-y-2 font-mono text-xs">
          <span className="text-purple-400">Available Prompt Chips:</span>
          <div className="flex gap-2 mt-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/25 text-[#a855f7]">[Fix Code]</span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/25 text-[#06b6d4]">[Explain]</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[#10b981]">[Optimize]</span>
            <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25 text-[#f59e0b]">[Debug]</span>
          </div>
        </div>
      </div>
    )
  },
  {
    id: 'git-integration',
    title: 'Git Versioning',
    icon: <GitBranch size={14} />,
    content: (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <GitBranch size={18} className="text-emerald-400" /> Version Control Integration
        </h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          NEXA IDE incorporates deep git diagnostics. You can inspect line changes via diff blocks, stage modifications, check out remote branches, and commit code directly.
        </p>
      </div>
    )
  },
  {
    id: 'terminal-manager',
    title: 'Split Terminals',
    icon: <Terminal size={14} />,
    content: (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Terminal size={18} className="text-cyan-400" /> Multi-Terminal Manager
        </h2>
        <p className="text-sm text-slate-400 leading-relaxed">
          The bottom workspace panel lets you spawn native command line interfaces with automatic viewport size fitting. Telemetry options store your active shell path configurations.
        </p>
      </div>
    )
  },
  {
    id: 'keybindings',
    title: 'Keybindings',
    icon: <Key size={14} />,
    content: (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Key size={18} className="text-amber-400" /> Key Shortcuts
        </h2>
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-white/[0.06] text-slate-400">
              <th className="py-2">Command</th>
              <th className="py-2">Shortcut</th>
            </tr>
          </thead>
          <tbody className="text-slate-300 font-mono">
            <tr className="border-b border-white/[0.03]">
              <td className="py-2">Command Palette</td>
              <td className="py-2">Ctrl + Shift + P</td>
            </tr>
            <tr className="border-b border-white/[0.03]">
              <td className="py-2">Toggle AI Chat Panel</td>
              <td className="py-2">Ctrl + Alt + A</td>
            </tr>
            <tr className="border-b border-white/[0.03]">
              <td className="py-2">Toggle Bottom Terminal</td>
              <td className="py-2">Ctrl + `</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }
]

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('getting-started')

  // Sync state with URL params stably on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const currentSection = params.get('section')
    if (currentSection && DOCS_SECTIONS.some(s => s.id === currentSection)) {
      setActiveSection(currentSection)
    }
  }, [])

  const handleSectionChange = (sectionId: string) => {
    if (sectionId === activeSection) return
    setActiveSection(sectionId)
    
    // Replace URL query params using window history replacement to bypass Next.js loading loops
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('section', sectionId)
      window.history.replaceState(null, '', url.pathname + url.search)
    }
  }

  const activeDoc = DOCS_SECTIONS.find(s => s.id === activeSection) || DOCS_SECTIONS[0]

  return (
    <main className="min-h-screen bg-[#030407] flex flex-col items-center py-20 px-6 overflow-hidden relative">
      {/* Glow Effects */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />

      {/* Back Button */}
      <div className="max-w-6xl w-full mb-8 relative z-10 flex">
        <a 
          href="/" 
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-[#a855f7] transition-colors"
        >
          <ArrowLeft size={12} />
          <span>Back to Editor</span>
        </a>
      </div>

      {/* Header */}
      <div className="max-w-6xl w-full mb-12 text-left relative z-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-400 font-semibold mb-4">
          <Sparkles size={11} />
          <span>Nexus Documentation Hub</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          How to configure, code, and deploy.
        </h1>
      </div>

      {/* Docs navigation & reading panel */}
      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-4 gap-8 relative z-10 items-stretch">
        {/* Sidebar Navigation */}
        <div className="md:col-span-1 flex flex-col gap-1.5 p-3 rounded-2xl border border-white/[0.06] bg-[#07080c]/50 backdrop-blur-xl h-fit">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3.5 py-2 select-none">Documentation</span>
          {DOCS_SECTIONS.map((sec) => {
            const isActive = sec.id === activeSection
            return (
              <button
                key={sec.id}
                onClick={() => handleSectionChange(sec.id)}
                className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                  isActive 
                    ? 'bg-purple-500/10 border border-purple-500/25 text-[#a855f7]'
                    : 'bg-transparent border border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {sec.icon}
                <span>{sec.title}</span>
              </button>
            )
          })}
        </div>

        {/* Main Content Area */}
        <div className="md:col-span-3 rounded-2xl border border-white/[0.08] bg-[#07080c]/70 backdrop-blur-md p-8 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#8b5cf6]/30 to-transparent" />
          <div className="min-h-[300px]">
            {activeDoc.content}
          </div>
        </div>
      </div>
    </main>
  )
}

