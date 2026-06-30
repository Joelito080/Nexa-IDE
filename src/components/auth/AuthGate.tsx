import AppShell from '../layout/AppShell'
import AuthLoading from './AuthLoading'
import LoginScreen from './LoginScreen'
import { useAuth } from '../../context/AuthProvider'

/**
 * Auth gate — shows login screen until authenticated, then loads the IDE shell.
 */
export default function AuthGate() {
  const { user, loading } = useAuth()

  if (loading) return <AuthLoading />
  if (!user)   return <LoginScreen />

  return <AppShell />
}
