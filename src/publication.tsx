import { useEffect, useState } from 'react'
import type { TelegramChannel, TelegramPublication } from './cloud-beats'

export type PublishMedia = { name: string; file?: File; url?: string }

export function TelegramMedia({ audio, cover }: { audio: PublishMedia[]; cover?: PublishMedia }) {
  const files = cover ? [...audio, cover] : audio
  if (!files.length) return null
  return <details className="publication-link">
    <summary>Скачать файлы</summary>
    <div className="video-save-actions">{files.map((source, index) => source.file
      ? <FileDownload key={index} file={source.file} />
      : source.url && <a key={index} className="video-download" href={downloadUrl(source.url, source.name)} download={source.name}>{source.name}</a>)}</div>
  </details>
}

function downloadUrl(source: string, name: string) {
  if (source.startsWith('blob:')) return source
  const url = new URL(source)
  url.searchParams.set('download', name)
  return url.toString()
}

function FileDownload({ file }: { file: File }) {
  const [download, setDownload] = useState<{ file: File; url: string }>()
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setDownload({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])
  if (download?.file !== file) return null
  return <a className="video-download" href={download.url} download={file.name}>{file.name}</a>
}

export function PublicationLink({ platform, initial, onSave }: {
  platform: 'telegram' | 'youtube'
  initial: string
  onSave: (url: string) => Promise<void>
}) {
  const [url, setUrl] = useState(initial)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const label = platform === 'telegram' ? 'Ссылка на пост Telegram' : 'Ссылка на видео YouTube'

  async function save() {
    try {
      const parsed = new URL(url.trim())
      const valid = platform === 'telegram'
        ? parsed.hostname === 't.me' && /^\/(?:s\/|c\/)?[\w]+\/\d+(?:\/\d+)?\/?$/.test(parsed.pathname)
        : (parsed.hostname === 'youtu.be' && /^\/[\w-]+\/?$/.test(parsed.pathname)) ||
          (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(parsed.hostname) &&
            ((parsed.pathname === '/watch' && /^[\w-]+$/.test(parsed.searchParams.get('v') ?? '')) || /^\/(shorts|live)\/[\w-]+\/?$/.test(parsed.pathname)))
      if (parsed.protocol !== 'https:' || !valid) throw new Error()
    } catch {
      setStatus('Вставь полную ссылку на опубликованный пост или видео.')
      return
    }
    setSaving(true)
    setStatus('')
    try {
      await onSave(url.trim())
      setStatus('Ссылка сохранена')
    } catch {
      setStatus('Не удалось сохранить все изменения. Попробуй ещё раз.')
    } finally {
      setSaving(false)
    }
  }

  return <form className="publication-link" onSubmit={(event) => { event.preventDefault(); void save() }}>
    <label className="field"><span>{label}</span><input type="url" required value={url} disabled={saving} onChange={(event) => { setUrl(event.target.value); setStatus('') }} /></label>
    <button className="copy-button" disabled={saving || !url.trim()}>{saving ? 'Сохраняем…' : 'Сохранить ссылку'}</button>
    {status && <p className="form-hint" role="status">{status}</p>}
  </form>
}

export function DirectTelegramPublication({ publish, channels, onManage }: {
  channels: TelegramChannel[]
  onManage: () => void
  publish: (channel: string) => Promise<TelegramPublication>
}) {
  const [channel, setChannel] = useState('')
  const selectedChannel = channels.find((item) => item.id === channel)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TelegramPublication>()
  const [error, setError] = useState('')

  async function send() {
    setBusy(true)
    setError('')
    try { setResult(await publish(channel.trim())) }
    catch (error) {
      setError(error instanceof Error && !(error instanceof TypeError) ? error.message : 'Ответ не получен. Проверь канал перед повторной отправкой.')
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  return <form className="publication-link" onSubmit={(event) => {
    event.preventDefault()
    if (!busy && !result && selectedChannel) setConfirm(true)
  }}>
    <label className="field"><span>Канал Telegram</span><select required value={selectedChannel?.id ?? ''} disabled={busy || confirm || Boolean(result)} onChange={(event) => setChannel(event.target.value)}>
      <option value="">Выбрать канал</option>
      {channels.map((item) => <option key={item.id} value={item.id}>{item.title}{item.username ? ' (@' + item.username + ')' : ''}</option>)}
    </select></label>
    {!result && <button type="button" className="outline-button channel-manage" disabled={busy} onClick={onManage}>{channels.length ? 'Управлять каналами' : 'Подключить канал'}</button>}
    {!confirm && !result && <button className="copy-button" disabled={!selectedChannel}>Опубликовать через бота</button>}
    {confirm && <>
      <p className="form-hint">Отправить аудио и текущую подпись в {selectedChannel?.title}?</p>
      <button type="button" className="copy-button" disabled={busy} onClick={() => void send()}>{busy ? 'Публикуем…' : 'Подтвердить публикацию'}</button>
      <button type="button" className="copy-button copy-button--subtle" disabled={busy} onClick={() => setConfirm(false)}>Отмена</button>
    </>}
    {error && <p className="video-error" role="alert">{error}</p>}
    {result && <div role="status">
      <p>Аудио опубликовано{result.saved ? ', ссылка сохранена.' : '.'}</p>
      <a className="video-download" href={result.url} target="_blank" rel="noreferrer">Открыть публикацию</a>
      {result.warnings.map((warning) => <p key={warning} className="video-error">{warning}</p>)}
    </div>}
  </form>
}

export function readPublicationCover(file: File): Promise<string> {
  if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error('Обложка должна быть до 2 МБ.'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Не удалось прочитать обложку.'))
    reader.readAsDataURL(file)
  })
}
