import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  Terminal,
  Shield,
  Zap,
  Sparkles,
  Settings,
  FolderTree,
  ChevronDown,
  Github,
  Check,
  Code,
  FileText,
  RotateCw,
  HelpCircle,
  Cpu,
  Monitor
} from 'lucide-react'

// Constants
const REPO = 'nexa-ide/nexa-ide'

interface ReleaseData {
  version: string
  publishDate: string
  changelog: string
}

export default function App() {
  // OS & Download States
  const [detectedOS, setDetectedOS] = useState<'windows' | 'mac' | 'linux'>('windows')
  const [downloadDropdownOpen, setDownloadDropdownOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | null>(null)
  const [releaseInfo, setReleaseInfo] = useState<ReleaseData>({
    version: 'v1.1.0',
    publishDate: '2026-06-27',
    changelog: '### v1.1.0\n- **OpenRouter AI**: Single-key access to a wide range of models through one unified backend.\n- **Streaming & slash commands**: Real-time responses with /fix, /explain, /refactor.\n- **Split view & autosave**: Side-by-side editors with 2s crash-recovery buffers.\n- **Performance**: Faster cold boot, project load, and first-token AI latency.'
  })

  // Simulated IDE interactive states
  const [activeTab, setActiveTab] = useState<'safetyRules.ts' | 'main.ts' | 'recentProjects.ts'>('safetyRules.ts')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [aiTypingText, setAiTypingText] = useState('')
  const [aiMessageFinished, setAiMessageFinished] = useState(false)
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    'Windows PowerShell',
    'Copyright (C) Microsoft Corporation. All rights reserved.',
    '',
    'PS D:\\Projects\\nexus-app> npm run build',
    '  tsc --noEmit && vite build',
    '  âœ“ built in 1.84s',
    'PS D:\\Projects\\nexus-app> '
  ])
  const [newTerminalCmd, setNewTerminalCmd] = useState('')

  // Price tier state
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')

  // Run OS detection and fetch latest release info
  useEffect(() => {
    // Detect Client OS
    const platform = navigator.userAgent.toLowerCase()
    if (platform.includes('win')) {
      setDetectedOS('windows')
    } else if (platform.includes('mac')) {
      setDetectedOS('mac')
    } else if (platform.includes('linux')) {
      setDetectedOS('linux')
    } else {
      setDetectedOS('windows')
    }

    // Fetch latest release
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then((res) => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then((data) => {
        if (data && data.tag_name) {
          setReleaseInfo({
            version: data.tag_name,
            publishDate: new Date(data.published_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }),
            changelog: data.body || 'Maintenance release with security and performance improvements.'
          })
        }
      })
      .catch(() => {
        // Fallback info stays
      })
  }, [])

  // Stream AI typing animation for Showcase
  useEffect(() => {
    const fullMessage = `I reviewed safetyRules.ts. I found a potential path traversal risk at line 50 where resolving relative paths did not enforce absolute bounds.

I recommend applying the following fix:
\`\`\`diff
- const resolved = path.resolve(filePath)
+ const resolved = path.resolve(workspaceRoot, filePath)
+ if (!isPathInsideWorkspace(resolved, workspaceRoot)) {
+   throw new Error("Access Denied");
+ }
\`\`\`
Would you like me to automatically apply this refactoring across the file?`

    let index = 0
    setAiTypingText('')
    setAiMessageFinished(false)

    const timer = setInterval(() => {
      if (index < fullMessage.length) {
        setAiTypingText((prev) => prev + fullMessage.charAt(index))
        index++
      } else {
        clearInterval(timer)
        setAiMessageFinished(true)
      }
    }, 12)

    return () => clearInterval(timer)
  }, [activeTab])

  // Get OS download link
  const getDownloadLink = (os: 'windows' | 'mac' | 'linux') => {
    const base = `https://github.com/${REPO}/releases/latest/download`
    const ver = releaseInfo.version.startsWith('v') ? releaseInfo.version.slice(1) : releaseInfo.version
    if (os === 'windows') return `${base}/NEXA.IDE.Setup.${ver}.exe`
    if (os === 'mac') return `${base}/NEXA.IDE-${ver}.dmg`
    return `${base}/NEXA.IDE-${ver}.AppImage`
  }

  // Handle simulated terminal commands
  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTerminalCmd.trim()) return

    const cmd = newTerminalCmd.trim()
    let response = [`PS D:\\Projects\\nexus-app> ${cmd}`]

    if (cmd === 'git status') {
      response.push(
        'On branch main',
        'Your branch is up to date with \'origin/main\'.',
        '',
        'Changes not staged for commit:',
        '  (use "git add <file>..." to update what will be committed)',
        '  (use "git restore <file>..." to discard changes in working directory)',
        '        modified:   src/lib/fileSystem.ts',
        '',
        'no changes added to commit (use "git add" and/or "git commit -a")'
      )
    } else if (cmd === 'clear') {
      setTerminalLogs([])
      setNewTerminalCmd('')
      return
    } else if (cmd.startsWith('npm run')) {
      response.push(
        'Running script...',
        'âœ“ tsc check passed',
        'âœ“ client build compiled (2.1s)'
      )
    } else {
      response.push(`Command '${cmd}' executed successfully.`)
    }

    setTerminalLogs((prev) => [...prev, ...response, ''])
    setNewTerminalCmd('')
  }

  return (
    <div className="min-h-screen bg-brand-bg text-slate-300 font-sans relative">
      {/* Background Decorative Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-radial-purple pointer-events-none z-0" />
      <div className="absolute top-[800px] right-0 w-[600px] h-[600px] bg-radial-blue pointer-events-none z-0" />
      <div className="absolute bottom-[400px] left-0 w-[600px] h-[600px] bg-radial-purple pointer-events-none z-0" />
      <div className="absolute inset-0 bg-grid-pattern opacity-60 pointer-events-none z-0" />

      {/* Navigation Header */}
      <nav className="sticky top-0 z-40 bg-brand-bg/85 backdrop-blur-md border-b border-brand-border select-none">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="#" className="flex items-center gap-3 group">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-accent to-brand-indigo flex items-center justify-center text-white font-bold shadow-[0_0_15px_rgba(139,92,246,0.5)]">
              N
            </div>
            <span className="font-display font-extrabold text-white text-lg tracking-wider group-hover:text-brand-violet transition-colors">
              NEXA IDE
            </span>
          </a>

          <div className="hidden md:flex items-center gap-8 text-[13px] font-semibold text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#ai-showcase" className="hover:text-white transition-colors">AI Assistant</a>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#downloads" className="hover:text-white transition-colors">Downloads</a>
            <a
              href="https://github.com/nexa-ide/nexa-ide"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <Github size={14} /> GitHub
            </a>
          </div>

          <a
            href="#downloads"
            className="px-4 py-2 rounded-xl bg-brand-accent/15 hover:bg-brand-accent/25 border border-brand-accent/30 text-brand-violet text-xs font-bold transition-all shadow-[0_0_15px_rgba(139,92,246,0.1)] hover:shadow-[0_0_20px_rgba(139,92,246,0.2)]"
          >
            Get Free IDE
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-20 pb-16 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/20 text-brand-violet text-[11px] font-semibold tracking-wider uppercase mb-6"
        >
          <Sparkles size={10} className="animate-pulse" />
          V1.1.0 â€” OpenRouter Multi-Model AI
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="text-5xl md:text-7xl font-extrabold font-display leading-[1.1] tracking-tight text-white mb-6"
        >
          The AI-First <br className="hidden md:block" />
          <span className="bg-gradient-to-r from-brand-violet via-brand-indigo to-brand-blue bg-clip-text text-transparent drop-shadow-sm">
            Development Environment
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-base md:text-lg text-slate-400 max-w-2xl leading-relaxed mb-10"
        >
          NEXA IDE fuses a sandboxed secure file engine, native shell workspaces,
          and an OpenRouter-powered AI copilot that lets you switch instantly between
          leading models to build, edit, and audit software at speed.
        </motion.p>

        {/* Primary Download Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="flex flex-col sm:flex-row items-center gap-4 relative mb-12 select-none"
        >
          <div className="flex items-stretch rounded-2xl bg-brand-accent border border-brand-accent shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:shadow-[0_0_40px_rgba(139,92,246,0.45)] transition-all">
            <a
              href={getDownloadLink(detectedOS)}
              className="flex items-center gap-2.5 px-6 py-3.5 text-[14px] font-bold text-white bg-brand-accent hover:bg-[#7c3aed] transition-colors rounded-l-2xl border-r border-white/10"
            >
              <Download size={16} />
              Download for {detectedOS === 'windows' ? 'Windows' : detectedOS === 'mac' ? 'macOS' : 'Linux'}
            </a>

            {/* Custom Dropdown Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDownloadDropdownOpen(!downloadDropdownOpen)}
                className="px-3 h-full flex items-center justify-center bg-brand-accent hover:bg-[#7c3aed] text-white rounded-r-2xl transition-colors"
                title="Select Platform"
              >
                <ChevronDown size={16} className={`transition-transform duration-200 ${downloadDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {downloadDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2.5 w-48 rounded-xl bg-brand-card border border-brand-border p-1.5 shadow-2xl z-50 text-left"
                  >
                    <a
                      href={getDownloadLink('windows')}
                      onClick={() => setDownloadDropdownOpen(false)}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      Windows (.exe) {detectedOS === 'windows' && <Check size={12} className="text-brand-violet" />}
                    </a>
                    <a
                      href={getDownloadLink('mac')}
                      onClick={() => setDownloadDropdownOpen(false)}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      macOS (.dmg) {detectedOS === 'mac' && <Check size={12} className="text-brand-violet" />}
                    </a>
                    <a
                      href={getDownloadLink('linux')}
                      onClick={() => setDownloadDropdownOpen(false)}
                      className="flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      Linux (.AppImage) {detectedOS === 'linux' && <Check size={12} className="text-brand-violet" />}
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <span className="text-xs text-slate-500 font-semibold tracking-wide">
            {releaseInfo.version} Â· Release: {releaseInfo.publishDate}
          </span>
        </motion.div>

        {/* Live CSS Interactive Mockup Showcase */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="w-full max-w-5xl rounded-2xl border border-white/10 bg-[#08090f] shadow-2xl relative overflow-hidden flex flex-col h-[560px]"
        >
          {/* Mock Browser Header */}
          <div className="h-11 bg-black/40 border-b border-brand-border px-4 flex items-center justify-between select-none">
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-3 h-3 rounded-full bg-rose-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-500/80" />
              <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
            </div>
            <div className="text-[11px] text-slate-500 font-mono truncate px-10 max-w-sm rounded-lg bg-black/25 py-1 border border-white/[0.03]">
              nexus://editor/safetyRules.ts
            </div>
            <div className="flex items-center gap-2 text-slate-500 shrink-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`hover:text-slate-300 transition-colors p-0.5 rounded ${sidebarOpen ? 'text-brand-violet' : ''}`}
                title="Toggle Sidebar"
              >
                <FolderTree size={14} />
              </button>
              <Settings size={14} className="hover:text-slate-300 cursor-pointer" />
            </div>
          </div>

          {/* Editor Body */}
          <div className="flex-1 flex overflow-hidden min-h-0 text-left">
            {/* Sidebar Explorer */}
            {sidebarOpen && (
              <div className="w-52 bg-black/25 border-r border-brand-border flex flex-col font-mono text-xs select-none">
                <div className="p-3 border-b border-brand-border flex items-center justify-between text-slate-400">
                  <span className="font-bold text-[10px] tracking-wider uppercase text-slate-500">Explorer</span>
                  <FolderTree size={12} />
                </div>
                <div className="p-2 space-y-1 text-slate-400 overflow-y-auto">
                  <div className="text-[11px] font-bold text-slate-500 px-1 py-0.5">NEXUS-APP</div>
                  <div className="pl-3 py-1 text-slate-500">ðŸ“ electron</div>
                  <div className="pl-3 py-1 text-slate-500">ðŸ“ src</div>
                  <div className="pl-6 py-0.5 hover:text-white cursor-pointer flex items-center gap-1.5" onClick={() => setActiveTab('safetyRules.ts')}>
                    <Code size={11} className={activeTab === 'safetyRules.ts' ? 'text-brand-violet' : 'text-slate-400'} />
                    <span className={activeTab === 'safetyRules.ts' ? 'text-brand-violet font-bold' : ''}>safetyRules.ts</span>
                  </div>
                  <div className="pl-6 py-0.5 hover:text-white cursor-pointer flex items-center gap-1.5" onClick={() => setActiveTab('main.ts')}>
                    <Code size={11} className={activeTab === 'main.ts' ? 'text-brand-violet' : 'text-slate-400'} />
                    <span className={activeTab === 'main.ts' ? 'text-brand-violet font-bold' : ''}>main.ts</span>
                  </div>
                  <div className="pl-6 py-0.5 hover:text-white cursor-pointer flex items-center gap-1.5" onClick={() => setActiveTab('recentProjects.ts')}>
                    <Code size={11} className={activeTab === 'recentProjects.ts' ? 'text-brand-violet' : 'text-slate-400'} />
                    <span className={activeTab === 'recentProjects.ts' ? 'text-brand-violet font-bold' : ''}>recentProjects.ts</span>
                  </div>
                  <div className="pl-3 py-1 text-slate-500">âš™ï¸ tailwind.config.js</div>
                  <div className="pl-3 py-1 text-slate-500">âš™ï¸ package.json</div>
                </div>
              </div>
            )}

            {/* Editor Workspace Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-[#090b11]">
              {/* Tabs */}
              <div className="h-9 bg-black/15 border-b border-brand-border flex items-center font-mono text-[11px] select-none">
                <div
                  className={`px-3.5 h-full flex items-center gap-1.5 border-r border-brand-border cursor-pointer transition-colors ${activeTab === 'safetyRules.ts' ? 'bg-[#090b11] text-white border-t border-t-brand-accent' : 'text-slate-500 hover:bg-black/10'}`}
                  onClick={() => setActiveTab('safetyRules.ts')}
                >
                  <Code size={11} className="text-brand-violet" />
                  <span>safetyRules.ts</span>
                </div>
                <div
                  className={`px-3.5 h-full flex items-center gap-1.5 border-r border-brand-border cursor-pointer transition-colors ${activeTab === 'main.ts' ? 'bg-[#090b11] text-white border-t border-t-brand-accent' : 'text-slate-500 hover:bg-black/10'}`}
                  onClick={() => setActiveTab('main.ts')}
                >
                  <Code size={11} className="text-brand-indigo" />
                  <span>main.ts</span>
                </div>
                <div
                  className={`px-3.5 h-full flex items-center gap-1.5 border-r border-brand-border cursor-pointer transition-colors ${activeTab === 'recentProjects.ts' ? 'bg-[#090b11] text-white border-t border-t-brand-accent' : 'text-slate-500 hover:bg-black/10'}`}
                  onClick={() => setActiveTab('recentProjects.ts')}
                >
                  <Code size={11} className="text-brand-blue" />
                  <span>recentProjects.ts</span>
                </div>
              </div>

              {/* File Editor Contents */}
              <div className="flex-1 p-4 font-mono text-[11px] leading-relaxed overflow-y-auto select-text text-slate-300">
                {activeTab === 'safetyRules.ts' && (
                  <div>
                    <div><span className="text-slate-500">1</span> <span className="text-purple-400">import</span> path <span className="text-purple-400">from</span> <span className="text-emerald-300">'path'</span></div>
                    <div><span className="text-slate-500">2</span> </div>
                    <div><span className="text-slate-500">3</span> <span className="text-purple-400">const</span> <span className="text-blue-300">ALLOWED_ROOTS</span> = <span className="text-purple-400">new</span> <span className="text-amber-300">Set</span>()</div>
                    <div><span className="text-slate-500">4</span> </div>
                    <div><span className="text-slate-500">5</span> <span className="text-purple-400">export function</span> <span className="text-amber-300">allowPath</span>(targetPath) &#123;</div>
                    <div><span className="text-slate-500">6</span>   <span className="text-blue-300">ALLOWED_ROOTS</span>.add(path.resolve(targetPath))</div>
                    <div><span className="text-slate-500">7</span> &#125;</div>
                    <div><span className="text-slate-500">8</span> </div>
                    <div><span className="text-slate-500">9</span> <span className="text-purple-400">export function</span> <span className="text-amber-300">isPathInsideWorkspace</span>(filePath, workspaceRoot) &#123;</div>
                    <div className="bg-rose-950/20 border-l border-rose-500/50"><span className="text-slate-500">10</span>   <span className="text-purple-400">const</span> resolved = path.resolve(filePath) <span className="text-rose-400">// RISK: Path Traversal</span></div>
                    <div><span className="text-slate-500">11</span>   <span className="text-purple-400">const</span> relative = path.relative(workspaceRoot, resolved)</div>
                    <div><span className="text-slate-500">12</span>   <span className="text-purple-400">return</span> !relative.startsWith(<span className="text-emerald-300">'..'</span>) && !path.isAbsolute(relative)</div>
                    <div><span className="text-slate-500">13</span> &#125;</div>
                  </div>
                )}
                {activeTab === 'main.ts' && (
                  <div>
                    <div><span className="text-slate-500">1</span> <span className="text-purple-400">import</span> &#123; app, BrowserWindow, ipcMain &#125; <span className="text-purple-400">from</span> <span className="text-emerald-300">'electron'</span></div>
                    <div><span className="text-slate-500">2</span> <span className="text-purple-400">import</span> &#123; isPathInsideWorkspace &#125; <span className="text-purple-400">from</span> <span className="text-emerald-300">'./safetyRules'</span></div>
                    <div><span className="text-slate-500">3</span> </div>
                    <div><span className="text-slate-500">4</span> app.whenReady().then(() =&gt; &#123;</div>
                    <div><span className="text-slate-500">5</span>   log.info(<span className="text-emerald-300">"Main Process Ready"</span>)</div>
                    <div><span className="text-slate-500">6</span>   createWindow()</div>
                    <div><span className="text-slate-500">7</span> &#125;)</div>
                  </div>
                )}
                {activeTab === 'recentProjects.ts' && (
                  <div>
                    <div><span className="text-slate-500">1</span> <span className="text-purple-400">export interface</span> <span className="text-blue-300">RecentProject</span> &#123;</div>
                    <div><span className="text-slate-500">2</span>   path: <span className="text-blue-300">string</span>;</div>
                    <div><span className="text-slate-500">3</span>   name: <span className="text-blue-300">string</span>;</div>
                    <div><span className="text-slate-500">4</span>   lastOpened: <span className="text-blue-300">number</span>;</div>
                    <div><span className="text-slate-500">5</span>   pinned: <span className="text-blue-300">boolean</span>;</div>
                    <div><span className="text-slate-500">6</span> &#125;</div>
                  </div>
                )}
              </div>

              {/* Terminal Panel Area */}
              <div className="h-36 bg-[#06070a] border-t border-brand-border flex flex-col font-mono text-xs">
                <div className="p-2 border-b border-brand-border bg-black/25 flex items-center justify-between text-slate-500 select-none">
                  <div className="flex items-center gap-1">
                    <Terminal size={12} className="text-slate-400" />
                    <span className="font-bold text-[10px] uppercase tracking-wider">Terminal (PowerShell)</span>
                  </div>
                  <div className="text-[10px]">Active Â· 1 Session</div>
                </div>
                <div className="flex-1 p-2 overflow-y-auto text-slate-300 leading-tight space-y-0.5">
                  {terminalLogs.map((logLine, idx) => (
                    <div key={idx} className="whitespace-pre">
                      {logLine}
                    </div>
                  ))}
                  <form onSubmit={handleTerminalSubmit} className="flex items-center">
                    <span className="text-slate-500 mr-1.5 select-none">PS D:\Projects\nexus-app&gt;</span>
                    <input
                      type="text"
                      value={newTerminalCmd}
                      onChange={(e) => setNewTerminalCmd(e.target.value)}
                      className="flex-1 bg-transparent text-slate-200 outline-none border-none ring-0 select-text"
                      placeholder="Type git status, npm run build or clear..."
                    />
                  </form>
                </div>
              </div>
            </div>

            {/* AI Assistant Showcase Sidebar */}
            <div className="w-80 border-l border-brand-border bg-[#07090d]/80 flex flex-col font-sans">
              <div className="p-3 border-b border-brand-border bg-black/20 flex items-center justify-between text-slate-400 select-none">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-brand-violet" />
                  <span className="text-[11px] font-bold tracking-wider uppercase text-white">Nexus Assistant</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="px-1.5 py-0.5 rounded bg-brand-accent/20 border border-brand-accent/30 text-[9px] font-bold text-brand-violet">
                    OpenRouter
                  </div>
                </div>
              </div>

              {/* Chat Stream Panel */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 flex flex-col justify-end min-h-0 select-text">
                <div className="self-start max-w-[85%] rounded-2xl rounded-tl-none bg-[#11131c] border border-white/[0.04] p-3 text-[11.5px] text-slate-300">
                  <div className="font-bold text-[10px] text-brand-violet mb-1">User</div>
                  Audit this file for safety concerns.
                </div>

                <div className="self-start max-w-[90%] rounded-2xl rounded-tl-none bg-brand-accent/5 border border-brand-accent/15 p-3 text-[11.5px] leading-relaxed text-slate-300 relative overflow-hidden">
                  <div className="font-bold text-[10px] text-brand-violet mb-1 flex items-center gap-1.5">
                    <Cpu size={10} className="animate-spin-slow" />
                    NexusAI (Streaming)
                  </div>
                  <div className="whitespace-pre-wrap font-mono text-[10.5px]">
                    {aiTypingText}
                    {!aiMessageFinished && <span className="inline-block w-1.5 h-3 bg-brand-violet ml-0.5 animate-pulse" />}
                  </div>
                </div>
              </div>

              <div className="p-2.5 border-t border-brand-border bg-black/20 select-none">
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="flex-1 py-1.5 rounded-lg bg-brand-accent hover:bg-[#7c3aed] text-white text-[10.5px] font-bold transition-all shadow-[0_0_10px_rgba(139,92,246,0.2)] flex items-center justify-center gap-1"
                  >
                    Apply Fix
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[10.5px] font-medium transition-colors"
                  >
                    Refuse
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Core Features Showcase Grid */}
      <section id="features" className="py-24 px-6 max-w-7xl mx-auto relative z-10 select-none">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-extrabold font-display text-white tracking-tight mb-4">
            Engineered For Speed & Safety
          </h2>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Every layer of NEXA IDE has been redesigned to optimize file access latency, secure workspace sandboxes, and stream OpenRouter completions with sub-second first-token latency.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Fast Central File System */}
          <div className="glass-panel rounded-2xl p-6 hover:border-brand-violet/30 transition-all hover:-translate-y-1 duration-200">
            <div className="w-10 h-10 rounded-lg bg-brand-accent/15 border border-brand-accent/20 flex items-center justify-center text-brand-violet mb-5">
              <Zap size={20} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Centralized File System</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Equipped with EBUSY/EPERM promise retry layers, exponential backoffs, and an in-memory dedup read cache. Files open instantly and re-scan under 1ms.
            </p>
          </div>

          {/* Card 2: Security & Sandboxed paths */}
          <div className="glass-panel rounded-2xl p-6 hover:border-brand-violet/30 transition-all hover:-translate-y-1 duration-200">
            <div className="w-10 h-10 rounded-lg bg-brand-accent/15 border border-brand-accent/20 flex items-center justify-center text-brand-violet mb-5">
              <Shield size={20} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Secure Path Sandboxing</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Blocks path traversals and unauthorized filesystem calls. Access is restricted to dynamic workspace paths, temp folder spaces, and cloned templates.
            </p>
          </div>

          {/* Card 3: Session Restore & Crash Recovery */}
          <div className="glass-panel rounded-2xl p-6 hover:border-brand-violet/30 transition-all hover:-translate-y-1 duration-200">
            <div className="w-10 h-10 rounded-lg bg-brand-accent/15 border border-brand-accent/20 flex items-center justify-center text-brand-violet mb-5">
              <RotateCw size={20} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Crash Recovery</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Buffers unsaved text documents every 2 seconds. In case of host OS restarts or crashes, you are cleanly prompted to restore all dirty buffers.
            </p>
          </div>
        </div>
      </section>

      {/* AI Assistant Showcase Section */}
      <section id="ai-showcase" className="py-20 px-6 max-w-7xl mx-auto border-t border-brand-border relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/20 text-brand-violet text-[10px] font-bold tracking-wider uppercase mb-5 select-none">
              <Sparkles size={11} />
              AI Copilot
            </div>
            <h2 className="text-3xl md:text-5xl font-extrabold font-display text-white tracking-tight leading-tight mb-6">
              A Copilot that Knows <br /> Your Workspace
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-8">
              The Nexus AI assistant indexes your folder tree, reads compiler diagnostics, and streams responses instantly through OpenRouter â€” one API key unlocks a broad set of leading models.
            </p>

            <div className="space-y-4 font-sans text-xs">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-brand-accent/15 flex items-center justify-center text-brand-violet shrink-0 mt-0.5">
                  <Check size={11} />
                </div>
                <div>
                  <span className="font-bold text-white block mb-0.5">Context Aware Actions</span>
                  <span className="text-slate-400">Trigger "Fix File", "Explain Code", or "Refactor Selection" commands directly from editor markers.</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-brand-accent/15 flex items-center justify-center text-brand-violet shrink-0 mt-0.5">
                  <Check size={11} />
                </div>
                <div>
                  <span className="font-bold text-white block mb-0.5">Multi-Model OpenRouter</span>
                  <span className="text-slate-400">Switch between leading OpenRouter models through a single API key in Settings.</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-brand-accent/15 flex items-center justify-center text-brand-violet shrink-0 mt-0.5">
                  <Check size={11} />
                </div>
                <div>
                  <span className="font-bold text-white block mb-0.5">Full Streaming IPC</span>
                  <span className="text-slate-400">Stream chunks as they arrive directly from native sockets to the Monaco viewâ€”no blocking lags.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Graphical Representation of Model Selection */}
          <div className="glass-panel rounded-2xl p-6 border border-white/10 relative overflow-hidden select-none">
            <h3 className="text-sm font-bold text-slate-300 mb-6 flex items-center gap-2">
              <Settings size={14} className="text-brand-violet" />
              OpenRouter Model Selection
            </h3>

            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-black/30 border border-[#8b5cf6]/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#8b5cf6]/10 flex items-center justify-center text-[#8b5cf6]">
                    <Monitor size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">OpenRouter (Active)</span>
                    <span className="text-[10px] text-slate-500">Claude, GPT, DeepSeek, Qwen, Mistral, Llama, and more</span>
                  </div>
                </div>
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              </div>

              <div className="p-3.5 rounded-xl bg-black/10 border border-white/[0.04] flex items-center justify-between opacity-80">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                    <Cpu size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-300 block">Claude 3.5 Sonnet</span>
                    <span className="text-[10px] text-slate-500">anthropic/claude-3.5-sonnet via OpenRouter</span>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-bold uppercase">Popular</span>
              </div>

              <div className="p-3.5 rounded-xl bg-black/10 border border-white/[0.04] flex items-center justify-between opacity-80">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <Code size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-300 block">GPT-4o & DeepSeek</span>
                    <span className="text-[10px] text-slate-500">openai/gpt-4o, deepseek/deepseek-chat, qwen/qwen-2.5-coder</span>
                  </div>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-accent/20 border border-brand-accent/30 text-brand-violet font-bold uppercase">100+ Models</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Options */}
      <section id="pricing" className="py-24 px-6 max-w-7xl mx-auto border-t border-brand-border relative z-10 select-none">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-extrabold font-display text-white tracking-tight mb-4">
            Simple, Transparent Plans
          </h2>
          <p className="text-slate-400 text-sm md:text-base leading-relaxed">
            Free to use with your own OpenRouter API key. Premium plans unlock managed routing, multi-agent workspaces, and priority updates.
          </p>

          {/* Billing Switch */}
          <div className="inline-flex items-center gap-2 mt-8 p-1 rounded-xl bg-brand-card border border-brand-border">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${billingPeriod === 'monthly' ? 'bg-brand-accent text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${billingPeriod === 'yearly' ? 'bg-brand-accent text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
            >
              Yearly <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 ml-1">Save 20%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Free Tier */}
          <div className="glass-panel rounded-3xl p-8 border border-white/5 flex flex-col justify-between h-[450px]">
            <div>
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-2">Free Starter</span>
              <h3 className="text-2xl font-extrabold text-white mb-4">Free</h3>
              <p className="text-slate-400 text-xs leading-relaxed mb-6">
                Redefined developer workspace with OpenRouter multi-model AI, native terminal, and secure sandboxing.
              </p>
              <ul className="space-y-3 text-xs text-slate-400">
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> OpenRouter Multi-Model AI</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> Streaming & Slash Commands</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> Native PowerShell / Terminal</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> Sandbox Workspace Safety</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> Session Restore & Autosave</li>
              </ul>
            </div>
            <a href="#downloads" className="w-full py-3 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white text-xs font-bold text-center transition-all select-none">
              Download Installer
            </a>
          </div>

          {/* Pro Tier */}
          <div className="glass-panel rounded-3xl p-8 border-2 border-brand-accent relative flex flex-col justify-between h-[480px] -translate-y-4 shadow-[0_0_30px_rgba(139,92,246,0.15)]">
            <div className="absolute top-0 right-8 -translate-y-1/2 px-3 py-1 rounded-full bg-brand-accent text-white text-[9.5px] font-extrabold tracking-wider uppercase shadow-md select-none">
              Most Popular
            </div>
            <div>
              <span className="text-brand-violet text-xs font-bold uppercase tracking-wider block mb-2">Professional</span>
              <h3 className="text-2xl font-extrabold text-white mb-1">
                ${billingPeriod === 'monthly' ? '15' : '12'}
                <span className="text-xs text-slate-500 font-normal"> / month</span>
              </h3>
              <span className="text-[10px] text-emerald-400 font-semibold block mb-4">
                {billingPeriod === 'yearly' && 'Billed annually ($144)'}
              </span>
              <p className="text-slate-400 text-xs leading-relaxed mb-6">
                Unlocks professional cloud integration, advanced workspace AI search, and priority agent routines.
              </p>
              <ul className="space-y-3 text-xs text-slate-400">
                <li className="flex items-center gap-2"><Check size={14} className="text-brand-violet shrink-0" /> All OpenRouter Models (Claude, GPT, DeepSeek, Qwen)</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-brand-violet shrink-0" /> Split View & Multi-Tab Editor</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-brand-violet shrink-0" /> Workspace Indexing and Diagnostics</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-brand-violet shrink-0" /> Priority Support & Auto-Updates</li>
              </ul>
            </div>
            <button type="button" className="w-full py-3 rounded-xl bg-brand-accent hover:bg-[#7c3aed] text-white text-xs font-bold text-center transition-all shadow-md select-none">
              Start 14-Day Free Trial
            </button>
          </div>

          {/* Ultimate Tier */}
          <div className="glass-panel rounded-3xl p-8 border border-white/5 flex flex-col justify-between h-[450px]">
            <div>
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider block mb-2">Team Enterprise</span>
              <h3 className="text-2xl font-extrabold text-white mb-1">
                ${billingPeriod === 'monthly' ? '29' : '23'}
                <span className="text-xs text-slate-500 font-normal"> / month</span>
              </h3>
              <span className="text-[10px] text-emerald-400 font-semibold block mb-4">
                {billingPeriod === 'yearly' && 'Billed annually ($276)'}
              </span>
              <p className="text-slate-400 text-xs leading-relaxed mb-6">
                Fully autonomous multi-agent coding cycles, self-healing test logs, and shared workspaces.
              </p>
              <ul className="space-y-3 text-xs text-slate-400">
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> Multi-Agent Cooperative Cycles</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> Native Test Logger Auto-Healing</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> Shared SSH Secure Workspaces</li>
                <li className="flex items-center gap-2"><Check size={14} className="text-emerald-400 shrink-0" /> Customizable LLM System Prompt</li>
              </ul>
            </div>
            <button type="button" className="w-full py-3 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white text-xs font-bold text-center transition-all select-none">
              Contact Sales
            </button>
          </div>
        </div>
      </section>

      {/* Downloads & Releases Audit Section */}
      <section id="downloads" className="py-20 px-6 max-w-7xl mx-auto border-t border-brand-border relative z-10 select-none">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-extrabold font-display text-white tracking-tight mb-4">
            Download NEXA IDE
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Get the installer compiled specifically for your operating system, or choose from alternative bundles below.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Windows Download */}
          <div className="glass-panel rounded-2xl p-6 border border-white/5 flex flex-col justify-between h-48 hover:border-brand-violet/20 transition-all">
            <div>
              <h3 className="text-base font-bold text-white mb-1.5">Windows Setup</h3>
              <p className="text-slate-500 text-xs leading-relaxed mb-4">
                NSIS executable installer or standalone portable package. Designed for Windows 10/11 x64.
              </p>
            </div>
            <a
              href={getDownloadLink('windows')}
              className="py-2.5 rounded-xl border border-brand-accent/20 hover:border-brand-accent/40 bg-brand-accent/10 hover:bg-brand-accent/25 text-brand-violet text-xs font-bold text-center transition-all"
            >
              Download Setup (.exe)
            </a>
          </div>

          {/* Mac Download */}
          <div className="glass-panel rounded-2xl p-6 border border-white/5 flex flex-col justify-between h-48 hover:border-brand-violet/20 transition-all">
            <div>
              <h3 className="text-base font-bold text-white mb-1.5">macOS DMG</h3>
              <p className="text-slate-500 text-xs leading-relaxed mb-4">
                Apple Disk Image supporting both Intel (x64) and Apple Silicon (M1/M2/M3 arm64) architectures.
              </p>
            </div>
            <a
              href={getDownloadLink('mac')}
              className="py-2.5 rounded-xl border border-brand-accent/20 hover:border-brand-accent/40 bg-brand-accent/10 hover:bg-brand-accent/25 text-brand-violet text-xs font-bold text-center transition-all"
            >
              Download Image (.dmg)
            </a>
          </div>

          {/* Linux Download */}
          <div className="glass-panel rounded-2xl p-6 border border-white/5 flex flex-col justify-between h-48 hover:border-brand-violet/20 transition-all">
            <div>
              <h3 className="text-base font-bold text-white mb-1.5">Linux AppImage</h3>
              <p className="text-slate-500 text-xs leading-relaxed mb-4">
                Standard portable executable package for Ubuntu, Debian, Fedora, Arch, and generic distributions.
              </p>
            </div>
            <a
              href={getDownloadLink('linux')}
              className="py-2.5 rounded-xl border border-brand-accent/20 hover:border-brand-accent/40 bg-brand-accent/10 hover:bg-brand-accent/25 text-brand-violet text-xs font-bold text-center transition-all"
            >
              Download AppImage (.AppImage)
            </a>
          </div>
        </div>

        {/* Dynamic Changelog Box */}
        <div className="glass-panel rounded-2xl p-6 border border-white/5 max-w-3xl mx-auto">
          <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2 border-b border-white/[0.04] pb-3">
            <FileText size={14} className="text-brand-violet" />
            Release Notes â€” {releaseInfo.version} ({releaseInfo.publishDate})
          </h3>
          <div className="text-xs text-slate-400 leading-relaxed font-mono whitespace-pre-line space-y-1">
            {releaseInfo.changelog}
          </div>
        </div>
      </section>

      {/* FAQs / Help section */}
      <section className="py-20 px-6 max-w-5xl mx-auto border-t border-brand-border relative z-10">
        <h2 className="text-2xl md:text-4xl font-extrabold font-display text-white text-center tracking-tight mb-12 select-none">
          Frequently Asked Questions
        </h2>

        <div className="space-y-6 text-left">
          <div className="p-5 rounded-2xl bg-[#090b11]/60 border border-white/[0.04]">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <HelpCircle size={14} className="text-brand-violet shrink-0" />
              How secure is the filesystem integration?
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              NEXA IDE enforces strict path checking via whitelisted directories. Absolute resolving and relative sandboxing ensure the IDE cannot access or write to sensitive host system resources (such as Windows system folders, user documents outside project roots, etc.) unless explicitly allowed by dialog selections.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#090b11]/60 border border-white/[0.04]">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <HelpCircle size={14} className="text-brand-violet shrink-0" />
              Does the AI Assistant send code to external servers?
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              When you use the AI assistant, code context is sent directly to OpenRouter, which routes to your chosen model. Your OpenRouter API key is stored securely in local app storage and never sent to NEXA IDE servers.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-[#090b11]/60 border border-white/[0.04]">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <HelpCircle size={14} className="text-brand-violet shrink-0" />
              Can I customize the terminal settings?
            </h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Yes. On Windows, the terminal integrates PowerShell by default to maximize utility command-line compatibility, while macOS and Linux default to standard Zsh or Bash login shells. Resizing and session cleanup handlers keep memory leaks at bay.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-brand-border bg-[#030508]/80 text-center text-slate-500 text-xs relative z-10 select-none">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-brand-accent to-brand-indigo flex items-center justify-center text-white font-bold">
              N
            </div>
            <span className="font-display font-extrabold text-white text-[13px] tracking-wider">
              NEXA IDE
            </span>
          </div>

          <div className="flex items-center gap-6 text-[11px] font-semibold flex-wrap justify-center">
            <a href="#features" className="hover:text-slate-300 transition-colors">Features</a>
            <a href="#ai-showcase" className="hover:text-slate-300 transition-colors">AI Showcase</a>
            <a href="#downloads" className="hover:text-slate-300 transition-colors">Downloads</a>
            <a href="#pricing" className="hover:text-slate-300 transition-colors">Pricing</a>
            <a href="#terms" onClick={(e) => { e.preventDefault(); setActiveModal('terms'); }} className="hover:text-slate-300 transition-colors">Terms</a>
            <a href="#privacy" onClick={(e) => { e.preventDefault(); setActiveModal('privacy'); }} className="hover:text-slate-300 transition-colors">Privacy</a>
            <a href="mailto:support@nexa-ide.com" className="hover:text-slate-300 transition-colors">Support</a>
            <a href="https://github.com/nexa-ide/nexa-ide" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors flex items-center gap-1">
              <Github size={12} /> GitHub
            </a>
          </div>

          <p>Â© 2026 NEXA IDE. Released under the MIT License.</p>
        </div>
      </footer>

      {/* Modal */}
      <AnimatePresence>
        {activeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[#0e111a] border border-white/10 rounded-2xl p-6 relative text-left"
            >
              <button
                onClick={() => setActiveModal(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
              >
                âœ•
              </button>
              {activeModal === 'terms' ? (
                <div>
                  <h3 className="text-xl font-bold text-white mb-4">Terms of Service</h3>
                  <div className="text-slate-300 text-xs space-y-3 leading-relaxed max-h-96 overflow-y-auto pr-2">
                    <p><strong>1. Acceptance of Terms</strong><br/>By accessing or using NEXA IDE, you agree to be bound by these Terms of Service. If you do not agree, do not download or use the application.</p>
                    <p><strong>2. MIT License</strong><br/>NEXA IDE is licensed under the MIT License. You may copy, modify, and distribute the software in accordance with the license conditions.</p>
                    <p><strong>3. Use Constraints</strong><br/>You agree not to bypass security protections, path traversal validations, or local sandbox environments built into the IDE to access unauthorized filesystem sectors.</p>
                    <p><strong>4. No Warranty</strong><br/>THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. THE AUTHORS OR COPYRIGHT HOLDERS SHALL NOT BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY.</p>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-xl font-bold text-white mb-4">Privacy Policy</h3>
                  <div className="text-slate-300 text-xs space-y-3 leading-relaxed max-h-96 overflow-y-auto pr-2">
                    <p><strong>1. Local-First Design</strong><br/>Your source code, file structures, and credentials never leave your machine without your consent. All indexing and base operations run locally.</p>
                    <p><strong>2. AI API Keys</strong><br/>Your OpenRouter API key is encrypted and stored in your host OS user data directory. It is never sent to NEXA IDE servers.</p>
                    <p><strong>3. Analytics and Telemetry</strong><br/>NEXA IDE does not include any third-party analytics, crash reporting, or telemetry trackers. We collect zero usage statistics.</p>
                    <p><strong>4. Third-Party Services</strong><br/>When you use the AI assistant, code context is transmitted directly to OpenRouter and your selected model provider in accordance with their privacy policies.</p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

