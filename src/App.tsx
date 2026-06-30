import { AuthProvider } from './context/AuthProvider'
import AuthGate from './components/auth/AuthGate'
import AppErrorBoundary from './components/ui/AppErrorBoundary'

/**
 * App root — wraps the IDE shell with Firebase auth.
 * Unauthenticated users see the login screen; authenticated users see the IDE shell.
 */
function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </AppErrorBoundary>
  )
}

export default App
