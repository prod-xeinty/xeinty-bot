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

export function YoutubeUpload({ initData, beatId, video, fileKey, existingLink, beforeStart, onSaved, onNotice }: {
  initData: string
  beatId: string
  video?: Blob
  fileKey: string
  existingLink: string
  beforeStart: () => Promise<void>
  onSaved: (url: string) => void
  onNotice: (message: string) => void
}) {
  const key = 'xeinty-youtube-upload:' + beatId + ':' + fileKey
  const [connection, setConnection] = useState<YoutubeConnection>()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [confirming, setConfirming] = useState(false)
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

  async function upload() {
    if (!video || request.current) return
    const controller = new AbortController()
    request.current = controller
    setUploading(true)
    setConfirming(false)
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
      let confirmationChecks = 0
      while ('next' in step) {
        if (controller.signal.aborted) return
        const { next } = step
        setProgress(Math.min(99, Math.floor(next / video.size * 100)))
        if (next < 0 || next > video.size) throw new Error('YouTube вернул неверную позицию загрузки.')
        if (next === video.size) {
          setConfirming(true)
          if (++confirmationChecks > 4) throw new Error('YouTube ещё проверяет загрузку. Нажми «Продолжить загрузку» чуть позже.')
          await new Promise((resolve) => window.setTimeout(resolve, 1500))
          if (controller.signal.aborted) return
          step = await resumeYoutubeUpload(initData, uploadId, controller.signal)
          continue
        }
        if (next + chunkSize >= video.size) setConfirming(true)
        const chunk = await encodeChunk(video.slice(next, next + chunkSize))
        step = await sendYoutubeChunk(initData, uploadId, next, chunk, controller.signal)
        if ('next' in step && step.next <= next) throw new Error('YouTube не подтвердил фрагмент. Продолжи загрузку.')
      }
      if (controller.signal.aborted) return
      setProgress(100)
      setResult(step)
      onNotice(step.saved ? 'Видео успешно загружено на YouTube' : 'Видео загружено, ссылка пока не сохранена')
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
      setConfirming(false)
    }
  }

  return <div className="publication-link youtube-upload">
    <h3>Загрузка на YouTube</h3>
    {!connection && !error && <p className="form-hint">Проверяем подключение…</p>}
    {connection?.configured === false && <p className="form-hint">Подключение Google пока не настроено. Можно загрузить видео через YouTube Studio.</p>}
    {connection?.configured && !connection.connected && <p className="form-hint">Подключи YouTube во вкладке «Каналы», чтобы загружать видео напрямую.</p>}
    {connection?.connected && <>
      <p className="form-hint">YouTube подключён. Видео будет доступно только тебе.</p>
      {!video && <p className="form-hint">Собери видео или выбери файл с устройства.</p>}
      {(!result || !result.saved) && <button type="button" className="copy-button" disabled={!video || uploading} onClick={() => void upload()}>
        {uploading ? confirming ? 'Ждём подтверждения YouTube…' : 'Загружаем…' : result ? 'Повторить сохранение ссылки' : session.current ? 'Продолжить загрузку' : 'Загрузить приватное видео'}
      </button>}
      {!result && (uploading || progress > 0) && <div className="youtube-upload-progress">
        <progress value={progress} max={100} aria-label="Прогресс загрузки" /><span>{progress}%</span>
      </div>}

    </>}
    {error && <p className="video-error" role="alert">{error}</p>}
    {(result?.url || existingLink) && <a className="video-download" href={result?.url || existingLink} target="_blank" rel="noreferrer">Открыть видео на YouTube</a>}
    {result && <div className="stats-notice" role="status"><div>
      <strong>{result.saved ? 'Видео успешно загружено' : 'Видео загружено'}</strong>
      <p>{result.saved ? 'Ссылка сохранена у бита. YouTube может ещё обрабатывать видео.' : 'Ссылка пока не сохранилась. Можно повторить сохранение.'}</p>
    </div></div>}
  </div>
}

export function YoutubeChannelSettings({ initData, openLink }: { initData?: string; openLink?: (url: string) => void }) {
  const [connection, setConnection] = useState<YoutubeConnection>()
  const [authUrl, setAuthUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!initData) return
    let active = true
    void youtubeConnection(initData).then((status) => { if (active) setConnection(status) })
      .catch(() => { if (active) setError('Не удалось проверить подключение YouTube.') })
    return () => { active = false }
  }, [initData])

  async function run(action: (session: string) => Promise<void>) {
    if (!initData) return
    setBusy(true)
    setError('')
    try { await action(initData) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось связаться с YouTube.') }
    finally { setBusy(false) }
  }

  function refresh() {
    return run(async (session) => {
      const status = await youtubeConnection(session)
      setConnection(status)
      if (status.connected) setAuthUrl('')
    })
  }

  return <section className="form-panel batch-panel" aria-label="Настройки канала YouTube">
    <div className="section-intro"><h2>YouTube</h2></div>
    {!initData && <p className="form-hint">Открой XEINTY через Telegram, чтобы подключить YouTube.</p>}
    {initData && !connection && !error && <p role="status">Проверяем подключение…</p>}
    {connection?.configured === false && <p className="form-hint">Подключение Google пока не настроено.</p>}
    {connection?.configured && !connection.connected && <>
      <button type="button" className="copy-button" disabled={busy} onClick={() => void run(async (session) => {
        setAuthUrl((await createYoutubeConnection(session)).url)
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
      <p role="status">YouTube подключён.</p>
      <button type="button" className="outline-button" disabled={busy} onClick={() => void run(async (session) => {
        await disconnectYoutube(session)
        setConnection({ configured: true, connected: false })
        setAuthUrl('')
      })}>Отключить YouTube</button>
    </>}
    {error && <p className="video-error" role="alert">{error}</p>}
    {initData && error && !connection && <button type="button" className="outline-button" disabled={busy} onClick={() => void refresh()}>Повторить проверку</button>}
  </section>
}
