import { memo, useState, useEffect } from 'react'
import { Database, Server, RefreshCw, Folder, FileJson, Loader2 } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { motion } from 'framer-motion'

const DatabasePanel = memo(function DatabasePanel() {
  // State selectors — fine-grained to prevent cascading re-renders
  const dbConnected = useAppStore((s) => s.dbConnected)
  const dbDatabases = useAppStore((s) => s.dbDatabases)
  // Actions — stable references, never trigger re-renders
  const setDbConnected = useAppStore((s) => s.setDbConnected)
  const setDbDatabases = useAppStore((s) => s.setDbDatabases)
  const [uri, setUri] = useState('mongodb://localhost:27017/')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedDb, setExpandedDb] = useState<string | null>(null)
  const [collectionsCache, setCollectionsCache] = useState<Record<string, any[]>>({})

  const handleConnect = async () => {
    setLoading(true)
    setError(null)
    try {
      // @ts-ignore
      const res = await window.electronAPI.db.connect(uri)
      if (res.success) {
        setDbConnected(true)
        await fetchDatabases()
      } else {
        setError(res.error || 'Connection failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    // @ts-ignore
    await window.electronAPI.db.disconnect()
    setDbConnected(false)
    setDbDatabases([])
    setCollectionsCache({})
  }

  const fetchDatabases = async () => {
    try {
      // @ts-ignore
      const res = await window.electronAPI.db.listDatabases()
      if (res.success) {
        setDbDatabases(res.databases || [])
      } else {
        setError(res.error || 'Failed to list databases')
      }
    } catch (err: any) {
      setError(err.message)
    }
  }

  const toggleDb = async (dbName: string) => {
    if (expandedDb === dbName) {
      setExpandedDb(null)
      return
    }
    setExpandedDb(dbName)
    if (!collectionsCache[dbName]) {
      // @ts-ignore
      const res = await window.electronAPI.db.listCollections(dbName)
      if (res.success) {
        setCollectionsCache((prev) => ({ ...prev, [dbName]: res.collections || [] }))
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#080909] overflow-hidden text-sm">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <Database size={14} className="text-[#a78bfa]" />
          <span>DATABASE EXPLORER</span>
        </div>
        {dbConnected && (
          <button onClick={fetchDatabases} className="text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!dbConnected ? (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-widest">
              Connection String
            </label>
            <input
              type="text"
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              className="w-full bg-[#0f111a] border border-white/10 rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-[#a78bfa]"
              placeholder="mongodb://localhost:27017/"
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Server size={16} />}
              Connect to MongoDB
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-lg border border-white/10">
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-medium">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Connected
              </div>
              <button onClick={handleDisconnect} className="text-xs text-slate-400 hover:text-white">
                Disconnect
              </button>
            </div>

            <div className="space-y-1">
              {dbDatabases.map((db: any) => (
                <div key={db.name}>
                  <button
                    onClick={() => toggleDb(db.name)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-slate-300 hover:bg-white/5 rounded transition-colors text-left"
                  >
                    <Folder size={14} className={expandedDb === db.name ? "text-[#a78bfa]" : "text-slate-500"} />
                    <span className="truncate">{db.name}</span>
                  </button>
                  {expandedDb === db.name && (
                    <div className="ml-6 mt-1 space-y-1">
                      {collectionsCache[db.name] ? (
                        collectionsCache[db.name].map((col) => (
                          <div key={col.name} className="flex items-center gap-2 px-2 py-1 text-slate-400 text-xs">
                            <FileJson size={12} className="text-slate-500" />
                            {col.name}
                          </div>
                        ))
                      ) : (
                        <div className="px-2 py-1 text-xs text-slate-500 flex items-center gap-2">
                          <Loader2 size={10} className="animate-spin" /> Loading...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})

export default DatabasePanel
