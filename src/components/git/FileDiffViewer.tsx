import { useEffect, useRef, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { useAppStore } from '../../store/appStore'

interface FileDiffViewerProps {
  projectPath: string
  filePath: string
  isStaged?: boolean
  commitHash?: string | null
  /** Called when the viewer should be closed */
  onClose?: () => void
}

export default function FileDiffViewer({ projectPath, filePath, isStaged = false, commitHash = null, onClose }: FileDiffViewerProps) {
  const editorTheme = useAppStore((s) => s.editorTheme)
  const [original, setOriginal] = useState<string>('')
  const [modified, setModified] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        if (commitHash) {
          // Commit vs parent: original = commitHash^, modified = commitHash
          const parentRes = await window.electronAPI?.git.fileContent(projectPath, filePath, `${commitHash}^`)
          if (cancelled) return
          const parentContent = parentRes && !('error' in parentRes) ? parentRes.content : ''

          const currentRes = await window.electronAPI?.git.fileContent(projectPath, filePath, commitHash)
          if (cancelled) return
          const currentContent = currentRes && !('error' in currentRes) ? currentRes.content : ''

          setOriginal(parentContent)
          setModified(currentContent)
        } else {
          // Get HEAD version of the file as "original"
          const headRes = await window.electronAPI?.git.fileContent(projectPath, filePath, 'HEAD')
          if (cancelled) return
          const headContent = headRes && !('error' in headRes) ? headRes.content : ''

          if (isStaged) {
            // Staged: original = HEAD, modified = staged (index) version
            const stagedRes = await window.electronAPI?.git.fileContent(projectPath, filePath, ':0')
            if (cancelled) return
            const stagedContent = stagedRes && !('error' in stagedRes) ? stagedRes.content : headContent
            setOriginal(headContent)
            setModified(stagedContent)
          } else {
            // Unstaged: original = HEAD, modified = working tree (read via fs)
            const fsRes = await window.electronAPI?.fs.readFile(`${projectPath}/${filePath}`)
            if (cancelled) return
            const workingContent = fsRes && !('error' in fsRes) ? fsRes.content : ''
            setOriginal(headContent)
            setModified(workingContent)
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [projectPath, filePath, isStaged, commitHash])

  // Guess language from extension
  const ext = filePath.split('.').pop() ?? ''
  const lang = EXT_LANG_MAP[ext] ?? 'plaintext'
  const fileName = filePath.split('/').pop() ?? filePath

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#0a0b12' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b shrink-0"
        style={{ borderColor: 'rgba(139,92,246,0.15)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
            style={{
              background: commitHash 
                ? 'rgba(139,92,246,0.15)' 
                : isStaged 
                  ? 'rgba(74,222,128,0.15)' 
                  : 'rgba(251,191,36,0.15)',
              color: commitHash 
                ? '#a78bfa' 
                : isStaged 
                  ? '#4ade80' 
                  : '#fbbf24',
            }}
          >
            {commitHash ? `COMMIT ${commitHash.slice(0, 7)}` : isStaged ? 'STAGED' : 'UNSTAGED'}
          </span>
          <span className="text-[12px] text-white font-semibold truncate">{fileName}</span>
          <span className="text-[11px] text-[#475569] truncate hidden sm:block">{filePath}</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[#475569] hover:text-white transition-colors text-[11px] shrink-0 ml-2"
          >
            ✕ Close diff
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0b12]">
            <span className="text-[12px] text-[#475569] animate-pulse">Loading diff…</span>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0b12]">
            <span className="text-[12px] text-[#f87171]">Error: {error}</span>
          </div>
        )}
        {!loading && !error && (
          <DiffEditor
            original={original}
            modified={modified}
            language={lang}
            theme={editorTheme}
            options={{
              readOnly: true,
              renderSideBySide: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineHeight: 18,
              scrollBeyondLastLine: false,
              wordWrap: 'off',
              renderOverviewRuler: false,
              hideCursorInOverviewRuler: true,
              scrollbar: { vertical: 'auto', horizontal: 'auto' },
              enableSplitViewResizing: true,
              ignoreTrimWhitespace: false,
            }}
            onMount={(editor) => {
              editorRef.current = editor
            }}
          />
        )}
      </div>
    </div>
  )
}

const EXT_LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html',
  py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
  cs: 'csharp', sh: 'shell', bash: 'shell', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', xml: 'xml', sql: 'sql', rb: 'ruby', php: 'php',
  swift: 'swift', kt: 'kotlin', dart: 'dart',
}
