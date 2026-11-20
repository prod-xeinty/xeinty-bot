export type TelegramUser = {
  id: number
  first_name: string
  username?: string
}

export type TelegramTheme = {
  bg_color?: string
  text_color?: string
  hint_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
}

export type TelegramWebApp = {
  initData: string
  initDataUnsafe: { user?: TelegramUser }
  themeParams: TelegramTheme
  ready: () => void
  expand: () => void
  openLink?: (url: string) => void
  openTelegramLink?: (url: string) => void
  requestFullscreen?: () => void
  onEvent: (event: 'themeChanged', callback: () => void) => void
  offEvent: (event: 'themeChanged', callback: () => void) => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  setBottomBarColor?: (color: string) => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export function getTelegramWebApp(): TelegramWebApp | undefined {
  const webApp = window.Telegram?.WebApp
  return webApp?.initData ? webApp : undefined
}

export function applyTelegramTheme(theme: TelegramTheme): void {
  const root = document.documentElement
  const colors: Record<string, string | undefined> = {
    '--tg-bg': theme.bg_color,
    '--tg-text': theme.text_color,
    '--tg-muted': theme.hint_color,
    '--tg-accent': theme.button_color,
    '--tg-accent-text': theme.button_text_color,
    '--tg-surface': theme.secondary_bg_color,
  }

  for (const [name, value] of Object.entries(colors)) {
    if (value) root.style.setProperty(name, value)
    else root.style.removeProperty(name)
  }
}
