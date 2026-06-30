import React, { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { Search, Keyboard, X, Sparkles, Code, Folder, Info } from 'lucide-react'

const SHORTCUTS = [
  { keys: 'Ctrl+Shift+P', desc: 'Open Command Palette', category: 'General', icon: Keyboard },
  { keys: 'Ctrl+P', desc: 'Quick File Open by Name', category: 'General', icon: Keyboard },
  { keys: 'Ctrl+Shift+F', desc: 'Global File Content Search', category: 'General', icon: Keyboard },
  { keys: 'Ctrl+/', desc: 'Toggle Keyboard Shortcuts Modal', category: 'General', icon: Keyboard },
  { keys: 'Ctrl+B', desc: 'Toggle Sidebar Panel', category: 'Layout', icon: Folder },
  { keys: 'Ctrl+Alt+A', desc: 'Toggle AI Panel', category: 'Layout', icon: Sparkles },
  { keys: 'Ctrl+`', desc: 'Toggle Bottom Terminal Panel', category: 'Layout', icon: Code },
  { keys: 'Ctrl+N', desc: 'Create New File in Workspace', category: 'Files', icon: Folder },
  { keys: 'Ctrl+S', desc: 'Save Current File', category: 'Files', icon: Code },
  { keys: 'Ctrl+W', desc: 'Close Active Editor Tab', category: 'Files', icon: Code },
  { keys: 'Ctrl+Shift+G', desc: 'Explain selection / Fix file with AI', category: 'AI Tools', icon: Sparkles },
  { keys: 'Ctrl+Alt+F', desc: 'Refactor selected block with AI', category: 'AI Tools', icon: Sparkles },
]

export default function ShortcutsHelpModal() {
  const isOpen = useAppStore((s) => s.shortcutsModalOpen)
  const setOpen = useAppStore((s) => s.setShortcutsModalOpen)
  const [search, setSearch] = useState('')

  if (!isOpen) return null

  const filtered = SHORTCUTS.filter(
    (s) =>
      s.desc.toLowerCase().includes(search.toLowerCase()) ||
      s.keys.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase())
  )

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setOpen(false)
    }
  }

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300 select-none"
      style={{ zIndex: 99999 }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#090b11]/95 text-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transform transition-transform duration-300 scale-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Keyboard size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Keyboard Shortcuts</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Quick hotkey commands for NEXA IDE navigation.</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 bg-white/[0.01] border-b border-white/5">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search shortcuts..."
              className="w-full pl-9 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:border-purple-500 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Shortcuts list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filtered.length > 0 ? (
            filtered.map((s, idx) => {
              const CategoryIcon = s.icon
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.04] transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 p-1.5 rounded bg-black/40 border border-white/5">
                      <CategoryIcon size={12} className="group-hover:text-purple-400 transition-colors" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-white">{s.desc}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">{s.category}</p>
                    </div>
                  </div>
                  <kbd className="px-2 py-1 bg-black/60 border border-white/10 rounded font-mono text-[11px] text-purple-300 shadow min-w-[70px] text-center">
                    {s.keys}
                  </kbd>
                </div>
              )
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
              <Info size={24} className="opacity-50" />
              <p className="text-xs font-medium">No keyboard shortcuts match your search.</p>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 bg-white/[0.02] border-t border-white/10 text-center text-[10px] text-slate-500 font-medium">
          Press <span className="font-mono text-purple-400">Ctrl+/</span> to open or close this modal at any time.
        </div>
      </div>
    </div>
  )
}

