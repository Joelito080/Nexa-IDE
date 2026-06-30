import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthProvider'
import EmailLoginForm from './EmailLoginForm'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09A6.97 6.97 0 0 1 5.46 12c0-.78.14-1.53.38-2.23V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function NexusLogo({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="login-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#a78bfa" />
          <stop offset="50%"  stopColor="#818cf8" />
          <stop offset="100%" stopColor="#60a5fa" />
        </linearGradient>
        <filter id="login-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" fill="url(#login-grad)" filter="url(#login-glow)" />
      <text x="50" y="64" textAnchor="middle" fontFamily="Inter, system-ui" fontWeight="800" fontSize="40" fill="white" letterSpacing="-2">N</text>
    </svg>
  )
}

export default function LoginCard() {
  const { loginWithGoogle, error, clearError, isConfigured } = useAuth()
  const [showEmail, setShowEmail]   = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleGoogle = async () => {
    clearError()
    setGoogleLoading(true)
    try {
      await loginWithGoogle()
    } catch {
      // error surfaced via context
    } finally {
      setGoogleLoading(false)
    }
  }

  if (!isConfigured) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card w-full max-w-[420px] p-8 text-center"
      >
        <NexusLogo />
        <h1 className="mt-4 text-lg font-bold text-white">Google OAuth Not Configured</h1>
        <p className="mt-2 text-[12px] text-[#94a3b8] leading-relaxed mb-4">
          Copy <code className="text-[#a78bfa]">.env.example</code> to <code className="text-[#a78bfa]">.env</code> and
          add your Google OAuth Client ID as <code className="text-[#a78bfa]">GOOGLE_CLIENT_ID</code>.
        </p>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
      className="glass-card w-full max-w-[420px] p-8"
    >
      {/* Brand */}
      <div className="flex flex-col items-center mb-7">
        <NexusLogo />
        <h1 className="mt-4 text-[22px] font-bold tracking-tight text-white">
          Welcome to <span className="gradient-text">NEXA IDE</span>
        </h1>
        <p className="mt-1.5 text-[12px] text-[#475569] text-center">
          Sign in to access your AI-first development environment
        </p>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 p-3 rounded-lg text-[11.5px]"
            style={{
              background: 'rgba(248, 113, 113, 0.08)',
              border: '1px solid rgba(248, 113, 113, 0.2)',
            }}
          >
            <p className="text-[#f87171]">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!showEmail ? (
          <motion.div
            key="oauth"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            className="flex flex-col gap-3"
          >
            {/* Google â€” primary */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="login-btn-primary flex items-center justify-center gap-3 w-full py-3 rounded-xl text-[13px] font-semibold text-white transition-all duration-200 disabled:opacity-60"
            >
              {googleLoading
                ? <Loader2 size={16} className="animate-spin" />
                : <GoogleIcon />
              }
              Continue with Google
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-white/[0.07]" />
              <span className="text-[10px] text-[#2d3748] uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-white/[0.07]" />
            </div>

            {/* Email â€” secondary */}
            <button
              onClick={() => { clearError(); setShowEmail(true) }}
              className="login-btn-secondary flex items-center justify-center gap-2.5 w-full py-3 rounded-xl text-[13px] font-medium text-[#94a3b8] hover:text-white transition-all duration-200"
            >
              <Mail size={15} />
              Sign in with Email
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="email"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
          >
            <EmailLoginForm onBack={() => { clearError(); setShowEmail(false) }} />
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-6 text-center text-[10px] text-[#2d3748] leading-relaxed">
        Session encrypted with OS keychain Â· Auto-login on restart
      </p>
    </motion.div>
  )
}

