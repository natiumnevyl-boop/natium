import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ConfigErrorScreen } from './config/ConfigErrorScreen'
import { envConfigError } from './config/env'

class RootErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : 'Error inesperado al iniciar.'
    return { message }
  }

  render() {
    if (this.state.message) {
      return <ConfigErrorScreen title="La aplicación no pudo iniciar" details={this.state.message} />
    }
    return this.props.children
  }
}

const root = createRoot(document.getElementById('root')!)

if (envConfigError) {
  root.render(
    <StrictMode>
      <ConfigErrorScreen details={envConfigError} />
    </StrictMode>,
  )
} else {
  void import('./app/App').then(({ App }) => {
    root.render(
      <StrictMode>
        <RootErrorBoundary>
          <App />
        </RootErrorBoundary>
      </StrictMode>,
    )
  })
}
