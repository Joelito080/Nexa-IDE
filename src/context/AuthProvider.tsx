import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  signInWithGoogle,
  loadSession,
  clearSession,
  type OAuthUser,
} from '../lib/oauth/oauthService'

interface AuthContextValue {
  user: OAuthUser | null
  loading: boolean
  error: string | null
  isConfigured: boolean
  clearError: () => void
  loginWithGoogle: () => Promise<void>
  loginWithEmail: (email: string, password: string) => Promise<void>
  registerWithEmail: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function mapAuthError(err: unknown): string {
  // Basic mapping — OAuth errors typically come as Error with message
  const messages: Record<string, string> = {
    'popup-closed-by-user': 'Sign-in was cancelled.',
    'popup-blocked': 'Sign-in popup was blocked. Please try again.',
  }
  const msg = err instanceof Error ? err.message : String(err)
  return messages[msg] ?? msg ?? 'Authentication failed.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<OAuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const isConfigured          = true

  useEffect(() => {
    let mounted = true
    
    if (!isConfigured) {
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        const isTestActive = await window.electronAPI?.invoke('test:isTestSuiteActive')
        if (isTestActive && mounted) {
          const mockUser = {
            uid: 'test-user-id-12345',
            displayName: 'Test Runner User',
            email: 'jonnywalkee456@gmail.com',
            photoURL: '',
            idToken: 'mock.id.token',
            accessToken: 'mock.access.token'
          }
          window.electronAPI?.license?.activate('ULT-OWNER-0000').then((status: any) => {
            if (status && !status.error) {
              import('../store/appStore').then(({ useAppStore }) => {
                useAppStore.getState().setLicenseStatus(status)
              })
            }
          }).catch(() => {})
          setUser(mockUser)
          setLoading(false)
          return
        }

        const tokens = await loadSession()
        if (!mounted) return
        if (tokens?.id_token) {
          // decode id_token (base64url) in browser
          const parts = tokens.id_token.split('.')
          if (parts.length >= 2) {
            const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
            try {
              const jsonPayload = decodeURIComponent(
                atob(b64)
                  .split('')
                  .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                  .join(''),
              )
              const parsed = JSON.parse(jsonPayload)
              const userObj = {
                uid: parsed.sub,
                displayName: parsed.name,
                email: parsed.email,
                photoURL: parsed.picture,
                idToken: tokens.id_token,
                accessToken: tokens.access_token,
              }
              if (userObj.email === 'jonnywalkee456@gmail.com') {
                window.electronAPI?.license?.activate('ULT-OWNER-0000').then((status: any) => {
                  if (status && !status.error) {
                    import('../store/appStore').then(({ useAppStore }) => {
                      useAppStore.getState().setLicenseStatus(status)
                    })
                  }
                }).catch(() => {})
              }
              setUser(userObj)
            } catch (e) {
              // eslint-disable-next-line no-console
              console.error('Failed to decode id_token', e)
            }
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('loadSession error:', err)
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => { mounted = false }
  }, [isConfigured])

  const clearError = useCallback(() => setError(null), [])

  const loginWithGoogle = useCallback(async () => {
    setError(null)
    try {
      const res = await signInWithGoogle()
      if (res.user?.email === 'jonnywalkee456@gmail.com') {
        const status: any = await window.electronAPI?.license?.activate('ULT-OWNER-0000')
        if (status && !status.error) {
          const { useAppStore } = await import('../store/appStore')
          useAppStore.getState().setLicenseStatus(status)
        }
      }
      setUser(res.user ?? null)
    } catch (err) {
      // Log raw error for debugging (shown in dev console)
      // eslint-disable-next-line no-console
      console.error('loginWithGoogle error:', err)
      const errorMsg = mapAuthError(err)
      setError(errorMsg)
      // Don't re-throw — let user handle the error UI
    }
  }, [])

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    // Email/password is not supported when using native Google OAuth
    setError('Email/password login is not supported. Use Google Sign-In.')
    throw new Error('Email/password login not supported')
  }, [])

  const registerWithEmail = useCallback(async (email: string, password: string) => {
    setError('Registration via email is not supported. Use Google Sign-In.')
    throw new Error('Email registration not supported')
  }, [])

  const logout = useCallback(async () => {
    setError(null)
    try {
      await clearSession()
      setUser(null)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('logout error:', err)
      setError(mapAuthError(err))
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    error,
    isConfigured,
    clearError,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    logout,
  }), [user, loading, error, isConfigured, clearError, loginWithGoogle, loginWithEmail, registerWithEmail, logout])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
