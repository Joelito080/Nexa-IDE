import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, Check, ArrowRight, ArrowLeft, FolderOpen,
  Laptop, Cpu, Settings2, Moon, Sun, Shield, AlertCircle, Info
} from 'lucide-react'
import { useAppStore } from '../../store/appStore'

function OnboardingLogo() {
  return (
    <svg
      width="80"
      height="80"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="filter drop-shadow-[0_0_20px_rgba(139,92,246,0.3)]"
    >
      <defs>
        <linearGradient id="onboard-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"    stopColor="#c4b5fd" />
          <stop offset="40%"   stopColor="#818cf8" />
          <stop offset="100%"  stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <polygon
        points="50,3 95,26.5 95,73.5 50,97 5,73.5 5,26.5"
        stroke="url(#onboard-grad)"
        strokeWidth="4"
        fill="rgba(13, 14, 22, 0.75)"
      />
      <polygon
        points="50,15 85,32.5 85,67.5 50,85 15,67.5 15,32.5"
        fill="rgba(139, 92, 246, 0.15)"
        stroke="url(#onboard-grad)"
        strokeWidth="1.5"
        strokeDasharray="4 2"
      />
      <circle cx="50" cy="50" r="14" fill="url(#onboard-grad)" />
    </svg>
  )
}

type OnboardingStep = 'welcome' | 'theme' | 'workspace' | 'ai' | 'finish'

export default function OnboardingScreen() {
  // Store actions
  const setFirstRunComplete = useAppStore((s) => s.setFirstRunComplete)
  const setEditorTheme = useAppStore((s) => s.setEditorTheme)
  const setAIProvider = useAppStore((s) => s.setAIProvider)
  const setOpenrouterKeyConfigured = useAppStore((s) => s.setOpenrouterKeyConfigured)
  const setOpenrouterModel = useAppStore((s) => s.setOpenrouterModel)
  const setRootPath = useAppStore((s) => s.setRootPath)
  const setCurrentFolder = useAppStore((s) => s.setCurrentFolder)
  const setExplorerEntries = useAppStore((s) => s.setExplorerEntries)

  // Local onboarding state
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const [theme, setTheme] = useState<'vs-dark' | 'light' | 'hc-black'>('vs-dark')
  const [workspacePath, setWorkspacePath] = useState<string>('')
  
  // AI states
  const [openrouterKeyDraft, setOpenrouterKeyDraft] = useState<string>('')
  const [openrouterModelDraft, setOpenrouterModelDraft] = useState<string>('openai/gpt-4o')

  const [detecting, setDetecting] = useState(false)
  const [openCodeStatus, setOpenCodeStatus] = useState<{ installed: boolean; path: string | null; version: string | null } | null>(null)
  const [openrouterStatus, setOpenrouterStatus] = useState<{ connected: boolean; modelCount: number; keyConfigured: boolean } | null>(null)

  // Auto-run detections when transitioning to AI step
  useEffect(() => {
    if (currentStep === 'ai') {
      runDetections()
    }
  }, [currentStep])

  const runDetections = async () => {
    setDetecting(true)
    try {
      // 1. Detect OpenCode
      const oc = await window.electronAPI?.opencode.detect()
      if (oc) {
        setOpenCodeStatus(oc as any)
      }

      const diag = await window.electronAPI?.app.getDiagnostics(null)
      if (diag && !(diag as any).error) {
        const or = (diag as any).openrouter
        setOpenrouterStatus({
          connected: Boolean(or?.connected),
          modelCount: or?.modelCount ?? 0,
          keyConfigured: Boolean(or?.keyConfigured),
        })
      }
    } catch (err) {
      console.error('Onboarding detection failed:', err)
    } finally {
      setDetecting(false)
    }
  }

  const handleBrowseWorkspace = async () => {
    try {
      const selected = await window.electronAPI?.dialog.openFolder()
      if (selected) {
        setWorkspacePath(selected)
      }
    } catch (err) {
      console.error('Failed to open workspace directory picker:', err)
    }
  }

  const handleFinish = async () => {
    // 1. Save settings locally and in store
    setEditorTheme(theme)
    setAIProvider('openrouter')
    setOpenrouterModel(openrouterModelDraft)

    if (openrouterKeyDraft.trim()) {
      await window.electronAPI?.settings.save({
        aiProvider: 'openrouter',
        openrouterModel: openrouterModelDraft,
        openrouterKeyConfigured: true,
        openrouterApiKey: openrouterKeyDraft.trim(),
      })
      setOpenrouterKeyConfigured(true)
    }

    if (workspacePath) {
      if ((window as any).loadDirectory) {
        await (window as any).loadDirectory(workspacePath)
      } else {
        setRootPath(workspacePath)
        setCurrentFolder(workspacePath)
        
        try {
          const response = await window.electronAPI?.fs.readDir(workspacePath)
          if (response && !(response as any).error) {
            const entries = (response as any[]).map((entry) => ({
              name: entry.name,
              path: `${workspacePath}${workspacePath.includes('\\') ? '\\' : '/'}${entry.name}`,
              isDirectory: entry.isDirectory,
              isFile: entry.isFile,
            }))
            setExplorerEntries(entries)
          }
        } catch {
          // Fallback or ignore
        }
      }
    }

    // 2. Complete onboarding
    setFirstRunComplete(true)
  }

  const stepsOrder: OnboardingStep[] = ['welcome', 'theme', 'workspace', 'ai', 'finish']
  const currentIdx = stepsOrder.indexOf(currentStep)

  const goNext = () => {
    if (currentIdx < stepsOrder.length - 1) {
      setCurrentStep(stepsOrder[currentIdx + 1])
    }
  }

  const goBack = () => {
    if (currentIdx > 0) {
      setCurrentStep(stepsOrder[currentIdx - 1])
    }
  }

  // Visual Theme Selection Card Helper
  const renderThemeCard = (id: typeof theme, name: string, description: string, previewColors: string[]) => {
    const isSelected = theme === id
    return (
      <button
        type="button"
        onClick={() => {
          setTheme(id)
          // Live set theme in store so user sees appearance change!
          setEditorTheme(id)
        }}
        className={`flex flex-col items-start p-5 rounded-2xl border text-left transition-all duration-200 outline-none w-full ${
          isSelected
            ? 'bg-purple-500/10 border-purple-500 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
            : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
        }`}
      >
        <div className="flex items-center justify-between w-full mb-3">
          <span className="text-sm font-bold text-white">{name}</span>
          {isSelected && (
            <span className="p-0.5 bg-purple-500 rounded-full text-white">
              <Check size={12} />
            </span>
          )}
        </div>
        
        {/* Colors Preview block */}
        <div className="flex gap-1.5 mb-4">
          {previewColors.map((c, i) => (
            <div key={i} className="w-5 h-5 rounded-md" style={{ background: c }} />
          ))}
        </div>
        
        <span className="text-xs text-slate-400">{description}</span>
      </button>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-[#040507] text-white">
      {/* Background radial gradient glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.06),transparent_65%)] pointer-events-none" />

      <div className="relative w-full max-w-2xl bg-white/5 border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl backdrop-blur-md overflow-hidden">
        
        {/* Progress indicator */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          {stepsOrder.map((step, idx) => (
            <div
              key={step}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx <= currentIdx
                  ? 'bg-purple-500 w-8'
                  : 'bg-white/10 w-2'
              }`}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[300px] flex flex-col justify-between">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="flex-1 flex flex-col justify-center"
            >
              {currentStep === 'welcome' && (
                <div className="text-center space-y-6">
                  <div className="flex justify-center mb-2">
                    <OnboardingLogo />
                  </div>
                  <div>
                    <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent">
                      Welcome to NEXA IDE
                    </h2>
                    <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto leading-relaxed">
                      Your smart, AI-first code editor powered by OpenRouter AI with instant access to leading models.
                    </p>
                  </div>
                  <div className="flex justify-center gap-6 text-slate-500 text-xs mt-4">
                    <div className="flex items-center gap-1.5">
                      <Shield size={14} className="text-purple-400" />
                      <span>Local Sandboxed Execution</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Cpu size={14} className="text-blue-400" />
                      <span>OpenRouter Multi-Model AI</span>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 'theme' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                      <Sun size={20} className="text-purple-400" /> Select Visual Theme
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Choose an editor theme. You can change this anytime in Settings.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {renderThemeCard('vs-dark', 'VS Dark', 'Classic dark workspace. Easy on the eyes.', ['#1e1e1e', '#007acc', '#4ec9b0'])}
                    {renderThemeCard('light', 'VS Light', 'Clean light layout. Ideal for bright settings.', ['#fffffe', '#005fbb', '#048060'])}
                    {renderThemeCard('hc-black', 'High Contrast', 'High accessibility mode. Maximum contrast.', ['#000000', '#00ff00', '#ffff00'])}
                  </div>
                </div>
              )}

              {currentStep === 'workspace' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                      <FolderOpen size={20} className="text-purple-400" /> Primary Workspace Folder
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Select your default project workspace. NEXA IDE loads this folder automatically on startup.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleBrowseWorkspace}
                        className="flex items-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-lg cursor-pointer"
                      >
                        <FolderOpen size={16} /> Choose Folder
                      </button>
                      
                      <div className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-xl overflow-hidden truncate text-sm text-slate-300 font-mono">
                        {workspacePath || 'No folder selected'}
                      </div>
                    </div>

                    <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-start gap-3">
                      <Info size={16} className="text-blue-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-400 leading-relaxed">
                      Opening a workspace configures indexing, connects local git branches automatically, and lets the OpenRouter AI assistant analyze your files.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 'ai' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                      <Sparkles size={20} className="text-purple-400" /> AI Copilot Setup
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      NEXA IDE uses OpenRouter for 100+ cloud models. Add your API key or set OPENROUTER_API_KEY in .env.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-xs font-semibold text-slate-300">OpenRouter API Key</label>
                        <input
                          type="password"
                          placeholder="sk-or-v1-â€¦ (optional if set in .env)"
                          value={openrouterKeyDraft}
                          onChange={(e) => setOpenrouterKeyDraft(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-500 outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300">Default Model</label>
                        <input
                          type="text"
                          placeholder="openai/gpt-4o"
                          value={openrouterModelDraft}
                          onChange={(e) => setOpenrouterModelDraft(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-purple-500 outline-none font-mono"
                        />
                      </div>
                    </div>

                    {/* Auto Detection block */}
                    <div className="p-4 bg-black/40 border border-white/10 rounded-2xl space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
                        System Detection Status
                      </p>
                      
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">OpenCode CLI:</span>
                        {detecting ? (
                          <span className="text-slate-500">Checking...</span>
                        ) : openCodeStatus?.installed ? (
                          <span className="text-green-400 font-bold flex items-center gap-1">
                            <Check size={12} /> Detected ({openCodeStatus.version?.split(' ')[0]})
                          </span>
                        ) : (
                          <span className="text-yellow-400 flex items-center gap-1">
                            Not Installed (Requires override in settings)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">OpenRouter Connection:</span>
                        {detecting ? (
                          <span className="text-slate-500">Checking...</span>
                        ) : openrouterStatus?.connected ? (
                          <span className="text-green-400 font-bold flex items-center gap-1">
                            <Check size={12} /> {openrouterStatus.modelCount} models
                          </span>
                        ) : openrouterStatus?.keyConfigured ? (
                          <span className="text-yellow-400">Key set â€” verify in Settings</span>
                        ) : (
                          <span className="text-slate-500">Not configured</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentStep === 'finish' && (
                <div className="text-center space-y-6">
                  <div className="flex justify-center mb-2 text-purple-400 animate-pulse">
                    <Settings2 size={64} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold text-white">
                      Everything is Set!
                    </h3>
                    <p className="text-slate-400 text-sm mt-2 max-w-sm mx-auto leading-relaxed">
                      Onboarding is complete. NEXA IDE is fully configured and ready to build your next big project.
                    </p>
                  </div>

                  <div className="max-w-xs mx-auto border border-white/5 bg-white/5 rounded-2xl p-4 text-xs space-y-1.5 text-left text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Selected Theme:</span>
                      <span className="font-semibold capitalize">{theme}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Workspace Path:</span>
                      <span className="font-semibold truncate max-w-[160px]">
                        {workspacePath ? workspacePath.split(/[/\\]/).pop() : 'Default Scratch'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">AI Provider:</span>
                      <span className="font-semibold">OpenRouter</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Stepper Actions footer */}
          <div className="flex items-center justify-between mt-8 border-t border-white/10 pt-6">
            <button
              type="button"
              onClick={goBack}
              disabled={currentIdx === 0}
              className={`flex items-center gap-1 px-4 py-2 border border-white/10 rounded-xl text-xs font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none cursor-pointer`}
            >
              <ArrowLeft size={14} /> Back
            </button>

            {currentStep === 'finish' ? (
              <button
                type="button"
                onClick={handleFinish}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg transition-all transform hover:scale-[1.02] cursor-pointer"
              >
                Launch NEXA IDE <ArrowRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Continue <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

