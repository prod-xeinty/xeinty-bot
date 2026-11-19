import { Dropdown } from './choice-menu'
import { useState, type FormEvent } from 'react'
import type { TelegramChannel } from './cloud-beats'

export function TelegramChannels({ available, channels, loadError, onConnect, onDisconnect }: {
  available: boolean
  channels: TelegramChannel[]
  loadError: string
  onConnect: (address: string) => Promise<void>
  onDisconnect: (id: string) => Promise<void>
}) {
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function change(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось обновить каналы.') }
    finally { setBusy(false) }
  }

  function connect(event: FormEvent) {
    event.preventDefault()
    if (busy || !address.trim()) return
    void change(async () => {
      await onConnect(address.trim())
      setAddress('')
    })
  }

  return <section className="form-panel batch-panel">
    <p className="form-hint">Добавь @xeintybot в администраторы канала с правом «Публиковать сообщения». Затем укажи @имя канала или ID закрытого канала.</p>
    {!available ? <p>Открой XEINTY через Telegram, чтобы подключить канал.</p> : <>
      <form onSubmit={connect}>
        <label className="field"><span>Канал Telegram</span><input required value={address} disabled={busy} placeholder="@имя_канала или -100…" onChange={(e) => setAddress(e.target.value)} /></label>
        <button className="copy-button" disabled={busy || !address.trim()}>Подключить канал</button>
      </form>
      {(error || loadError) && <p className="video-error" role="alert">{error || loadError}</p>}
      {channels.length === 0 && !loadError && <p className="form-hint">Подключённых каналов пока нет.</p>}
      <ul className="telegram-channel-list">{channels.map((channel) => <li key={channel.id}>
        <div><strong>{channel.title}</strong><small>{channel.username ? '@' + channel.username : channel.id}</small></div>
        <button type="button" className="outline-button" disabled={busy} onClick={() => void change(() => onDisconnect(channel.id))}>Отключить</button>
      </li>)}</ul>
    </>}
  </section>
}

export type CaptionTemplate = { id: string; name: string; text: string; linkText: string; linkUrl: string }
export type CaptionPreferences = { templates: CaptionTemplate[]; hashtags: string[] }

export function readCaptionPreferences(): CaptionPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem('xeinty-telegram-caption-preferences') ?? '{}')
    const hashtags = Array.isArray(saved.hashtags) ? saved.hashtags.filter((tag: unknown) => typeof tag === 'string').slice(0, 12) : []
    const templates = Array.isArray(saved.templates) ? saved.templates : []
    if (!templates.length && typeof saved.template === 'string' && saved.template.trim()) {
      templates.push({ id: 'previous-template', name: 'Мой шаблон', text: saved.template, linkText: '', linkUrl: '' })
    }
    return { templates, hashtags }
  } catch { return { templates: [], hashtags: [] } }
}

export function CaptionTools({ caption, onChange, preferences, youtube = false }: {
  caption: string
  onChange: (caption: string) => void
  preferences: CaptionPreferences
  youtube?: boolean
}) {
  const limit = youtube ? 5000 : 1024
  const append = (value: string) => [caption.trimEnd(), value].filter(Boolean).join('\n')
  function insert(value: string) {
    const next = append(value)
    if (next.length <= limit) onChange(next)
  }
  function templateText(template: CaptionTemplate) {
    const { text, linkText, linkUrl } = template
    const link = !linkUrl ? '' : youtube ? linkText + ': ' + linkUrl : '[' + linkText + '](' + linkUrl + ')'
    return [text, link].filter(Boolean).join('\n')
  }

  return <div className="caption-tools">
    {preferences.templates.length ? <Dropdown label="Шаблон" placeholder="Выбрать шаблон" value="" onChange={(value) => {
      const template = preferences.templates.find((item) => item.id === value)
      if (template) onChange(templateText(template))
    }} options={preferences.templates.map((template) => ({ value: template.id, label: template.name, disabled: templateText(template).length > limit }))} /> : <p className="form-hint">Шаблоны можно создать в разделе «Ещё».</p>}
    {!youtube && preferences.hashtags.length > 0 && <div className="caption-tags" aria-label="Недавние хештеги">
      <span>Недавние хештеги</span>
      {preferences.hashtags.map((tag) => <button type="button" key={tag} className="outline-button"
        disabled={caption.toLowerCase().match(/#[\p{L}\p{N}_]+/gu)?.includes(tag.toLowerCase()) || append(tag).length > limit}
        onClick={() => insert(tag)}>{tag}</button>)}
    </div>}
  </div>
}

const emptyTemplate = { id: '', name: '', text: '', linkText: '', linkUrl: '' }

export function CaptionTemplates({ templates, onChange }: {
  templates: CaptionTemplate[]
  onChange: (templates: CaptionTemplate[]) => void
}) {
  const [draft, setDraft] = useState<CaptionTemplate>()
  const [error, setError] = useState('')
  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    const { id, name, text, linkText, linkUrl } = draft
    const label = linkText.trim()
    let url = linkUrl.trim()
    if (url || label) {
      try {
        const parsed = new URL(url)
        if (!['https:', 'http:'].includes(parsed.protocol) || !label || /[\[\]]/.test(label)) throw new Error()
        url = parsed.href.replaceAll('(', '%28').replaceAll(')', '%29')
      } catch {
        setError('Укажи текст ссылки без квадратных скобок и адрес, начинающийся с https:// или http://.')
        return
      }
    }
    if (!name.trim() || (!text.trim() && !url)) {
      setError('Укажи название и добавь текст или ссылку.')
      return
    }
    if (text.trim().length + label.length + url.length + (url ? 5 : 0) > 1024) {
      setError('Шаблон слишком длинный для подписи Telegram.')
      return
    }
    const saved = { id: id || crypto.randomUUID(), name: name.trim(), text: text.trim(), linkText: label, linkUrl: url }
    onChange(id ? templates.map((item) => item.id === id ? saved : item) : [...templates, saved])
    setDraft(undefined)
    setError('')
  }

  return <section className="form-panel batch-panel">
    <button type="button" className="outline-button" onClick={() => { setDraft({ ...emptyTemplate }); setError('') }}>Создать шаблон</button>
    {templates.length > 0 && <ul className="telegram-channel-list">{templates.map((item) => <li key={item.id}>
      <div><strong>{item.name}</strong></div>
      <button type="button" className="outline-button" onClick={() => { setDraft(item); setError('') }}>Изменить</button>
    </li>)}</ul>}
    {draft && <form className="caption-template field" onSubmit={save}>
      <label className="field"><span>Название шаблона</span><input required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className="field"><span>Текст поста</span><textarea maxLength={1024} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
      <label className="field"><span>Текст ссылки</span><input maxLength={160} placeholder="Купить" value={draft.linkText} onChange={(e) => setDraft({ ...draft, linkText: e.target.value })} /></label>
      <label className="field"><span>Адрес ссылки</span><input type="url" maxLength={600} placeholder="https://t.me/твой_ник" value={draft.linkUrl} onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })} /></label>
      {error && <p className="video-error" role="alert">{error}</p>}
      <div className="video-save-actions">
        <button className="outline-button">Сохранить шаблон</button>
        <button type="button" className="outline-button" onClick={() => setDraft(undefined)}>Отмена</button>
        {draft.id && <button type="button" className="outline-button" onClick={() => { onChange(templates.filter((item) => item.id !== draft.id)); setDraft(undefined) }}>Удалить</button>}
      </div>
    </form>}
  </section>
}
