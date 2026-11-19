import { useEffect, useRef, useState } from 'react'
import {
  createYoutubeConnection, disconnectYoutube, resumeYoutubeUpload, sendYoutubeChunk,
  startYoutubeUpload, youtubeConnection, type YoutubeConnection, type YoutubeUploadStep,
} from './cloud-beats'

const chunkSize = 2 * 1024 * 1024

function encodeChunk(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1])
    reader.onerror = () => reject(new Error('Не удалось прочитать видео.'))
    reader.readAsDataURL(blob)
  })
}

function readSession(key: string) {
  try { return sessionStorage.getItem(key) } catch { return null }
}

function storeSession(key: string, value: string | null) {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch { /* Upload can still resume while this screen is open. */ }
}

export function YoutubeUpload({ initData, beatId, video, fileKey, existingLink, beforeStart, onSaved, openLink }: {
  initData: string
  beatId: string
  video?: Blob
  fileKey: string
  existingLink: string
  beforeStart: () => Promise<void>
  onSaved: (url: string) => void
  openLink?: (url: string) => void
}) {
  const key = 'xeinty-youtube-upload:' + beatId + ':' + fileKey
  const [connection, setConnection] = useState<YoutubeConnection>()
  const [authUrl, setAuthUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ url: string; saved: boolean }>()
  const [error, setError] = useState('')
  const request = useRef<AbortController>(null)
  const session = useRef(readSession(key))
  const connectionRevision = useRef(0)

  useEffect(() => {
    const revision = ++connectionRevision.current
    void youtubeConnection(initData).then((status) => {
      if (connectionRevision.current === revision) setConnection(status)
    }).catch((failure) => {
      if (connectionRevision.current === revision) setError(failure.message)
    })
    return () => {
      connectionRevision.current++
      request.current?.abort()
    }
  }, [initData])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось связаться с YouTube.') }
    finally { setBusy(false) }
  }

  function refresh() {
    return run(async () => {
      const status = await youtubeConnection(initData)
      setConnection(status)
      if (status.connected) setAuthUrl('')
    })
  }

  async function upload() {
    if (!video || request.current) return
    const controller = new AbortController()
    request.current = controller
    setUploading(true)
    setError('')
    const uploadId = session.current ?? crypto.randomUUID()
    session.current = uploadId
    storeSession(key, uploadId)
    try {
      await beforeStart()
      if (controller.signal.aborted) return
      await startYoutubeUpload(initData, {
        uploadId, beatId, size: video.size, mimeType: video.type || 'application/octet-stream', madeForKids: false,
      })
      let step: YoutubeUploadStep = await resumeYoutubeUpload(initData, uploadId, controller.signal)
      while ('next' in step) {
        if (controller.signal.aborted) return
        const { next } = step
        setProgress(Math.floor(next / video.size * 100))
        if (next < 0 || next >= video.size) throw new Error('YouTube ещё проверяет загрузку. Нажми «Продолжить загрузку» чуть позже.')
        const chunk = await encodeChunk(video.slice(next, next + chunkSize))
        step = await sendYoutubeChunk(initData, uploadId, next, chunk, controller.signal)
        if ('next' in step && step.next <= next) throw new Error('YouTube не подтвердил фрагмент. Продолжи загрузку.')
      }
      if (controller.signal.aborted) return
      setProgress(100)
      setResult(step)
      if (step.saved) {
        session.current = null
        storeSession(key, null)
        onSaved(step.url)
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof Error && 'status' in failure && failure.status === 410) {
          session.current = null
          storeSession(key, null)
          setProgress(0)
        }
        setError(failure instanceof Error ? failure.message : 'Загрузка прервалась. Попробуй продолжить.')
      }
    } finally {
      request.current = null
      setUploading(false)
    }
  }

  return <div className="publication-link youtube-upload">
    <h3>Загрузка на YouTube</h3>
    {!connection && !error && <p className="form-hint">Проверяем подключение…</p>}
    {connection?.configured === false && <p className="form-hint">Подключение Google пока не настроено. Можно загрузить видео через YouTube Studio.</p>}
    {connection?.configured && !connection.connected && <>
      <button type="button" className="copy-button" disabled={busy} onClick={() => void run(async () => {
        setAuthUrl((await createYoutubeConnection(initData)).url)
      })}>Подключить YouTube</button>
      {authUrl && <>
        <a className="video-download" href={authUrl} target="_blank" rel="noreferrer" onClick={openLink ? (event) => {
          event.preventDefault()
          openLink(authUrl)
        } : undefined}>Открыть Google в браузере</a>
        <p className="form-hint">После согласия вернись в XEINTY и проверь подключение.</p>
      </>}
      <button type="button" className="copy-button copy-button--subtle" disabled={busy} onClick={() => void refresh()}>Проверить подключение</button>
    </>}
    {connection?.connected && <>
      <p className="form-hint">YouTube подключён. Видео будет доступно только тебе.</p>
      {!video && <p className="form-hint">Собери видео или выбери файл с устройства.</p>}
      {(!result || !result.saved) && <button type="button" className="copy-button" disabled={!video || uploading || busy} onClick={() => void upload()}>
        {uploading ? 'Загружаем…' : result ? 'Повторить сохранение ссылки' : session.current ? 'Продолжить загрузку' : 'Загрузить приватное видео'}
      </button>}
      {(uploading || progress > 0) && <div className="youtube-upload-progress">
        <progress value={progress} max={100} aria-label="Прогресс загрузки" /><span>{progress}%</span>
      </div>}
      <button type="button" className="copy-button copy-button--subtle" disabled={uploading || busy} onClick={() => void run(async () => {
        await disconnectYoutube(initData)
        session.current = null
        storeSession(key, null)
        setConnection({ configured: true, connected: false })
        setAuthUrl('')
      })}>Отключить YouTube</button>
    </>}
    {error && <p className="video-error" role="alert">{error}</p>}
    {(result?.url || existingLink) && <a className="video-download" href={result?.url || existingLink} target="_blank" rel="noreferrer">Открыть видео на YouTube</a>}
    {result && <p className="form-hint" role="status">{result.saved ? 'Видео загружено. Ссылка сохранена у бита.' : 'Видео загружено. Ссылка пока не сохранилась.'}</p>}
  </div>
}
