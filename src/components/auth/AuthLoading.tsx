import { motion } from 'framer-motion'

export default function AuthLoading() {
  return (
    <div
      className="flex flex-col items-center justify-center h-screen gap-4"
      style={{ background: '#080909' }}
    >
      <motion.div
        className="w-10 h-10 rounded-full"
        style={{
          border: '2px solid rgba(139, 92, 246, 0.2)',
          borderTopColor: '#8b5cf6',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
      />
      <p className="text-[12px] text-[#475569] tracking-widest uppercase">
        Verifying session…
      </p>
    </div>
  )
}
