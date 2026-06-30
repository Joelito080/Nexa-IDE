import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../../context/AuthProvider'

interface Props {
  onBack: () => void
}

export default function EmailLoginForm({ onBack }: Props) {
  const { loginWithEmail, registerWithEmail, clearError } = useAuth()
  const [mode, setMode]         = useState<'signin' | 'signup'>('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    setLoading(true)
    try {
      if (mode === 'signin') {
        await loginWithEmail(email.trim(), password)
      } else {
        await registerWithEmail(email.trim(), password)
      }
    } catch {
      // surfaced via context
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-[11px] text-[#475569] hover:text-[#94a3b8] transition-colors mb-1 self-start"
      >
        <ArrowLeft size={12} />
        Back
      </button>

      <div>
        <label className="block text-[10px] text-[#475569] uppercase tracking-widest mb-1.5">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="login-input w-full"
        />
      </div>

      <div>
        <label className="block text-[10px] text-[#475569] uppercase tracking-widest mb-1.5">
          Password
        </label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder="••••••••"
            className="login-input w-full pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#475569] hover:text-[#94a3b8]"
          >
            {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <motion.button
        type="submit"
        disabled={loading}
        whileTap={{ scale: 0.98 }}
        className="login-btn-primary flex items-center justify-center gap-2 w-full py-3 rounded-xl text-[13px] font-semibold text-white mt-1 disabled:opacity-60"
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        {mode === 'signin' ? 'Sign In' : 'Create Account'}
      </motion.button>

      <p className="text-center text-[11px] text-[#475569]">
        {mode === 'signin' ? (
          <>
            No account?{' '}
            <button
              type="button"
              onClick={() => { clearError(); setMode('signup') }}
              className="text-[#a78bfa] hover:text-[#c4b5fd] transition-colors"
            >
              Create one
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => { clearError(); setMode('signin') }}
              className="text-[#a78bfa] hover:text-[#c4b5fd] transition-colors"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </form>
  )
}
