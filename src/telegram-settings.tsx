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

export type CaptionPreferences = { template: string; hashtags: string[] }

export function readCaptionPreferences(): CaptionPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem('xeinty-telegram-caption-preferences') ?? '{}')
    const hashtags = Array.isArray(saved.hashtags) ? saved.hashtags.filter((tag: unknown) => typeof tag === 'string').slice(0, 12) : []
    return { template: typeof saved.template === 'string' ? saved.template : '', hashtags }
  } catch { return { template: '', hashtags: [] } }
}

export function CaptionTools({ caption, onChange, preferences, onPreferences }: {
  caption: string
  onChange: (caption: string) => void
  preferences: CaptionPreferences
  onPreferences: (preferences: CaptionPreferences) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  function insert(value: string) {
    const next = [caption.trimEnd(), value].filter(Boolean).join('\n')
    if (next.length <= 1024) onChange(next)
  }

  return <div className="caption-tools">
    <div className="caption-tools-actions">
      {preferences.template && <button type="button" className="outline-button" disabled={caption.trimEnd().length + preferences.template.length + (caption.trim() ? 1 : 0) > 1024} onClick={() => insert(preferences.template)}>Вставить шаблон</button>}
      <button type="button" className="outline-button" onClick={() => { setDraft(preferences.template); setEditing(!editing) }}>{editing ? 'Закрыть' : preferences.template ? 'Изменить шаблон' : 'Создать шаблон'}</button>
    </div>
    {editing && <div className="caption-template">
      <label className="field"><span>Текст шаблона</span><textarea maxLength={1024} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Купить: https://t.me/твой_ник" /></label>
      <button type="button" className="copy-button" onClick={() => { onPreferences({ ...preferences, template: draft.trim() }); setEditing(false) }}>Сохранить шаблон</button>
    </div>}
    {preferences.hashtags.length > 0 && <div className="caption-tags" aria-label="Недавние хештеги">
      <span>Недавние хештеги</span>
      {preferences.hashtags.map((tag) => <button type="button" key={tag} className="outline-button"
        disabled={caption.toLowerCase().match(/#[\p{L}\p{N}_]+/gu)?.includes(tag.toLowerCase()) || caption.trimEnd().length + tag.length + (caption.trim() ? 1 : 0) > 1024}
        onClick={() => insert(tag)}>{tag}</button>)}
    </div>}
  </div>
}
