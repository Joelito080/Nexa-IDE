import { memo } from 'react'
import { motion } from 'framer-motion'

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  cta?: string
  onCta?: () => void
}

export const EmptyState = memo(function EmptyState({
  icon,
  title,
  subtitle,
  cta,
  onCta,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08, duration: 0.35 }}
      className="flex flex-col items-center gap-3 text-center px-5 py-6"
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{
          background: 'rgba(139, 92, 246, 0.08)',
          border: '1px solid rgba(139, 92, 246, 0.18)',
        }}
      >
        <span className="text-[#8b5cf6] opacity-70 flex items-center justify-center">{icon}</span>
      </div>
      <div>
        <p className="text-[12px] text-[#6b7280] font-medium mb-1">{title}</p>
        <p className="text-[10.5px] text-[#3d4661] leading-relaxed">{subtitle}</p>
      </div>
      {cta && (
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onCta}
          className="btn-outline text-[11px] py-1.5"
        >
          {cta}
        </motion.button>
      )}
    </motion.div>
  )
})
