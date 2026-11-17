import { useEffect, useState } from 'react'
import { applyTelegramTheme, getTelegramWebApp } from './telegram'

function App() {
  const [webApp] = useState(getTelegramWebApp)
  const [firstName, setFirstName] = useState(webApp?.initDataUnsafe.user?.first_name)

  useEffect(() => {
    if (!webApp) return

    const updateTheme = () => applyTelegramTheme(webApp.themeParams)
    updateTheme()
    webApp.onEvent('themeChanged', updateTheme)
    webApp.setHeaderColor?.(webApp.themeParams.bg_color || '#0e1016')
    webApp.setBackgroundColor?.(webApp.themeParams.bg_color || '#0e1016')
    webApp.expand()
    webApp.ready()
    setFirstName(webApp.initDataUnsafe.user?.first_name)

    return () => {
      webApp.offEvent('themeChanged', updateTheme)
      applyTelegramTheme({})
    }
  }, [webApp])

  return (
    <main className="app">
      <header className="topbar">
        <span className="brand">beatsy<span className="brand-dot">.</span></span>
        <span className="mode">{webApp ? 'Telegram Mini App' : 'Предпросмотр'}</span>
      </header>

      <section className="welcome">
        <p className="greeting">{firstName ? `Привет, ${firstName}` : 'Привет'}</p>
        <h1>Твои биты.<br />Один рабочий ритм.</h1>
        <p className="intro">Здесь появится удобный путь от готового бита до публикации в Telegram и YouTube.</p>
      </section>

      <section className="next-step" aria-labelledby="next-title">
        <div className="step-index">01 / СЛЕДУЮЩИЙ ШАГ</div>
        <h2 id="next-title">Библиотека битов</h2>
        <p>Добавление аудио и обложки, параметры трека и подготовка публикации — следующий этап разработки.</p>
      </section>

      <footer>Beatsy · ранняя версия</footer>
    </main>
  )
}

export default App
