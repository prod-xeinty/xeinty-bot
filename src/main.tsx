import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

class AppBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error: Error) { console.error('XEINTY failed to start:', error) }

  render() {
    if (this.state.failed) return <div className="startup-error"><strong>Не удалось открыть XEINTY</strong><p>Закрой приложение и открой его снова.</p><button onClick={() => { const url = new URL(window.location.href); url.searchParams.set('reload', String(Date.now())); window.location.assign(url.toString()) }}>Повторить</button></div>
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppBoundary><App /></AppBoundary>
  </React.StrictMode>,
)
