import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Copy, Check, Download, Eye, EyeOff, Zap, Brain, 
  Clock, Database, AlertTriangle, CheckCircle2
} from 'lucide-react'
import type { AiDebugInfo } from '../../lib/aiDebugStore'

interface AiDebugModalProps {
  isOpen: boolean
  debugInfo: AiDebugInfo | null
  onClose: () => void
}

export function AiDebugModal({ isOpen, debugInfo, onClose }: AiDebugModalProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState({
    prompt: false,
    sources: false,
    metrics: false,
    errors: false,
  })

  if (!debugInfo) return null

  const handleCopy = (text: string, sectionId: string) => {
    navigator.clipboard.writeText(text)
    setCopied(sectionId)
    setTimeout(() => setCopied(null), 2000)
  }

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const formatLatency = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-br from-slate-900 to-slate-950 border border-purple-500/20 rounded-xl shadow-2xl max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="sticky top-0 bg-slate-950/90 backdrop-blur border-b border-purple-500/10 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Brain size={24} className="text-purple-400" />
                <h2 className="text-xl font-bold text-white">AI Debug Info</h2>
                <span className="text-xs px-2 py-1 bg-purple-500/20 text-purple-300 rounded-full">
                  {debugInfo.requestId}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400">Model</div>
                  <div className="text-sm font-mono text-white font-semibold truncate">{debugInfo.modelName}</div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400">Provider</div>
                  <div className="text-sm font-mono text-white font-semibold">{debugInfo.provider}</div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 flex items-center gap-1">
                    <Zap size={12} /> Tokens (prompt)
                  </div>
                  <div className="text-sm font-mono text-purple-300 font-semibold">{debugInfo.promptTokens}</div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock size={12} /> Latency
                  </div>
                  <div className="text-sm font-mono text-blue-300 font-semibold">
                    {debugInfo.latencyMs ? formatLatency(debugInfo.latencyMs) : 'pending'}
                  </div>
                </div>
              </div>

              {/* Model Configuration */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
                <div className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                  <Database size={16} /> Configuration
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400">Temperature:</span>
                    <span className="text-slate-200 ml-2 font-mono">{debugInfo.temperature.toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Top P:</span>
                    <span className="text-slate-200 ml-2 font-mono">{debugInfo.topP}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Max Tokens:</span>
                    <span className="text-slate-200 ml-2 font-mono">{debugInfo.maxTokens}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Context Limit:</span>
                    <span className="text-slate-200 ml-2 font-mono">{debugInfo.contextLimit.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Prompt Budget:</span>
                    <span className="text-slate-200 ml-2 font-mono">{debugInfo.promptBudget.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Reserved Output:</span>
                    <span className="text-slate-200 ml-2 font-mono">{debugInfo.reservedOutputTokens}</span>
                  </div>
                </div>
              </div>

              {/* Context Sources */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
                <button
                  onClick={() => toggleSection('sources')}
                  className="w-full flex items-center justify-between text-sm font-semibold text-white mb-3 hover:text-purple-300 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Database size={16} /> Context Sources ({debugInfo.contextSources.length})
                  </span>
                  <span className="text-slate-400">{expandedSections.sources ? '−' : '+'}</span>
                </button>
                {expandedSections.sources && (
                  <div className="space-y-2 text-xs">
                    {debugInfo.contextSources.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-start gap-2 p-2 bg-slate-700/30 rounded border border-slate-600/50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-slate-300 font-semibold">{source.label}</span>
                            <span className="text-slate-500">({source.category})</span>
                            {source.preserved && (
                              <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded">
                                preserved
                              </span>
                            )}
                            {source.truncated && (
                              <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 rounded">
                                truncated
                              </span>
                            )}
                          </div>
                          <div className="text-slate-400">
                            <Zap size={12} className="inline mr-1" />
                            {source.tokenCount} tokens
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Truncation Events */}
              {debugInfo.truncationEvents.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={16} className="text-yellow-400" />
                    <span className="text-sm font-semibold text-yellow-300">
                      Truncation Events ({debugInfo.truncationEvents.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {debugInfo.truncationEvents.map((event, idx) => (
                      <div key={idx} className="text-xs text-yellow-200 pl-6 relative">
                        <div className="absolute left-0 top-1.5 w-1 h-1 bg-yellow-400 rounded-full" />
                        {event}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Final Prompt */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
                <button
                  onClick={() => toggleSection('prompt')}
                  className="w-full flex items-center justify-between text-sm font-semibold text-white mb-3 hover:text-purple-300 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Eye size={16} /> Final Compiled Prompt
                  </span>
                  <span className="text-slate-400">{expandedSections.prompt ? '−' : '+'}</span>
                </button>
                {expandedSections.prompt && (
                  <div className="relative">
                    <pre className="text-xs font-mono bg-slate-950 border border-slate-700/50 rounded p-3 overflow-x-auto max-h-64 text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                      {debugInfo.finalPrompt || '(empty)'}
                    </pre>
                    <button
                      onClick={() => handleCopy(debugInfo.finalPrompt, 'prompt')}
                      className="absolute top-2 right-2 p-1.5 bg-slate-700 hover:bg-slate-600 rounded transition-colors"
                    >
                      {copied === 'prompt' ? (
                        <Check size={14} className="text-green-400" />
                      ) : (
                        <Copy size={14} className="text-slate-300" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Metrics */}
              {(debugInfo.outputTokens || debugInfo.latencyMs) && (
                <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
                  <button
                    onClick={() => toggleSection('metrics')}
                    className="w-full flex items-center justify-between text-sm font-semibold text-white mb-3 hover:text-purple-300 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Zap size={16} /> Response Metrics
                    </span>
                    <span className="text-slate-400">{expandedSections.metrics ? '−' : '+'}</span>
                  </button>
                  {expandedSections.metrics && (
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      {debugInfo.outputTokens !== undefined && (
                        <div>
                          <span className="text-slate-400">Output Tokens</span>
                          <div className="text-slate-200 font-mono font-semibold">{debugInfo.outputTokens}</div>
                        </div>
                      )}
                      {debugInfo.totalTokens !== undefined && (
                        <div>
                          <span className="text-slate-400">Total Tokens</span>
                          <div className="text-slate-200 font-mono font-semibold">{debugInfo.totalTokens}</div>
                        </div>
                      )}
                      {debugInfo.latencyMs !== undefined && (
                        <div>
                          <span className="text-slate-400">Latency</span>
                          <div className="text-slate-200 font-mono font-semibold">
                            {formatLatency(debugInfo.latencyMs)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Errors */}
              {debugInfo.error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold text-red-300 mb-1">Error</div>
                      <div className="text-sm text-red-200">{debugInfo.error}</div>
                      {debugInfo.errorCode && (
                        <div className="text-xs text-red-400 font-mono mt-1">Code: {debugInfo.errorCode}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Success Indicator */}
              {!debugInfo.error && debugInfo.responsePreview && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-green-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-semibold text-green-300 mb-1">Response Received</div>
                    <div className="text-sm text-green-200 line-clamp-2">{debugInfo.responsePreview}</div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
