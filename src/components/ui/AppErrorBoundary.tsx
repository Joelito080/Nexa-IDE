import { Component, type ErrorInfo, type ReactNode } from 'react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
  message: string
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('AppErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#090909] text-white p-6">
          <div className="max-w-xl rounded-3xl border border-white/10 bg-[#0b0c11] p-8 shadow-2xl">
            <h1 className="text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-4 text-sm text-slate-300">The app encountered an unexpected error. Please restart the application.</p>
            <p className="mt-4 text-xs text-slate-500">{this.state.message}</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-2xl bg-[#8b5cf6] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7c3aed]"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
