import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ComponentErrorBoundaryProps {
  children: ReactNode
  title?: string
  message?: string
}

interface ComponentErrorBoundaryState {
  hasError: boolean
  message: string
}

export default class ComponentErrorBoundary extends Component<ComponentErrorBoundaryProps, ComponentErrorBoundaryState> {
  constructor(props: ComponentErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ComponentErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="rounded-3xl border border-white/10 bg-[#090b11] p-6 text-center text-slate-200 shadow-2xl">
            <p className="text-sm uppercase tracking-[0.26em] text-[#6b7280]">
              {this.props.title ?? 'Component error'}
            </p>
            <h2 className="mt-3 text-lg font-semibold text-white">{this.props.message ?? 'This section failed to load.'}</h2>
            <p className="mt-2 text-sm text-slate-400">{this.state.message}</p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
