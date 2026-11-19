import { useEffect, useState } from 'react'
import { remoteFile, type TelegramPublication } from './cloud-beats'

export type PublishMedia = { name: string; file?: File; url?: string }

export function TelegramMedia({ audio, cover }: { audio: PublishMedia[]; cover?: PublishMedia }) {
  const [prepared, setPrepared] = useState<{ sources: PublishMedia[]; files: File[] }>()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const sources = cover ? [...audio, cover] : audio
  const current = prepared?.sources.length === sources.length &&
    sources.every((source, i) => source.file === prepared.sources[i].file && source.url === prepared.sources[i].url)
    ? prepared.files : undefined

  async function prepare() {
    setLoading(true)
    setMessage('')
    try {
      const files = await Promise.all(sources.map(({ file, url, name }) => file ? file : remoteFile(url!, name)))
      setPrepared({ sources, files })
    } catch {
      setMessage('Не удалось получить файлы. Попробуй ещё раз или заново открой приложение.')
    } finally {
      setLoading(false)
    }
  }

  const audioFiles = current?.slice(0, audio.length)
  const canShare = Boolean(audioFiles?.length && typeof navigator.share === 'function' && navigator.canShare?.({ files: audioFiles }))
  async function share() {
    if (!audioFiles) return
    try {
      await navigator.share({ files: audioFiles })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('Не удалось открыть меню отправки. Скачай файлы ниже.')
    }
  }

  return <div>
    {!current && <button className="copy-button" disabled={!audio.length || loading} onClick={prepare}>{loading ? 'Готовим файлы…' : 'Подготовить файлы для Telegram'}</button>}
    {current && <>
      {canShare && <button className="copy-button" onClick={share}>Поделиться аудио</button>}
      <p className="form-hint">Выбери Telegram в меню отправки или скачай аудио и прикрепи его в канале. Вставь скопированную подпись перед отправкой.</p>
      <div className="video-save-actions">{current.map((file, index) => <FileDownload key={index} file={file} />)}</div>
      {cover && <p className="form-hint">Обложку можно отправить отдельным сообщением.</p>}
    </>}
    {message && <p className="video-error" role="status">{message}</p>}
  </div>
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

export function DirectTelegramPublication({ publish }: {
  publish: (channel: string) => Promise<TelegramPublication>
}) {
  const [channel, setChannel] = useState('')
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
    if (!busy && !result) setConfirm(true)
  }}>
    <label className="field"><span>Канал Telegram</span><input required value={channel} placeholder="@имя_канала или ID −100…" disabled={busy || confirm || Boolean(result)} onChange={(event) => setChannel(event.target.value)} /></label>
    {!result && <p className="form-hint">Добавь @xeintybot в администраторы канала с правом публиковать сообщения.</p>}
    {!confirm && !result && <button className="copy-button" disabled={!channel.trim()}>Опубликовать через бота</button>}
    {confirm && <>
      <p className="form-hint">Отправить аудио и текущую подпись в {channel.trim()}?</p>
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
