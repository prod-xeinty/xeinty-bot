import { useEffect, useRef, useState } from 'react'
import { Dropdown } from './choice-menu'
import { ChannelIdentity, ChannelPanel } from './telegram-settings'
import {
  createYoutubeConnection, disconnectYoutube, loadYoutubeChannelProfile, resumeYoutubeUpload, sendYoutubeChunk,
  startYoutubeUpload, youtubeConnection, type ChannelProfile, type YoutubeConnection, type YoutubeUploadResult, type YoutubeUploadStep, type YoutubeVisibility,
} from './cloud-beats'

const chunkSize = 2 * 1024 * 1024
const visibilityOptions: { value: YoutubeVisibility; label: string }[] = [
  { value: 'public', label: 'Открытое' },
  { value: 'unlisted', label: 'По ссылке' },
  { value: 'private', label: 'Приватное' },
]
const releaseTimeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'long' })

export function YoutubeReleaseTime({ publishAt }: { publishAt: string }) {
  const time = Date.parse(publishAt)
  if (!Number.isFinite(time)) return null
  return <p className="form-hint">{time > Date.now() ? 'Запланировано на ' : 'Выход был запланирован на '}
    <time dateTime={publishAt}>{releaseTimeFormat.format(time)}</time>
  </p>
}

function encodeChunk(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1])
    reader.onerror = () => reject(new Error('Не удалось прочитать видео.'))
    reader.readAsDataURL(blob)
  })
}

function readSession(key: string) {
  try { return localStorage.getItem(key) ?? sessionStorage.getItem(key) } catch { return null }
}

function storeSession(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value)
    else { localStorage.removeItem(key); sessionStorage.removeItem(key) }
  } catch { /* Upload can still resume while this screen is open. */ }
}

export function YoutubeUpload({ initData, beatId, video, fileKey, existingLink, existingPublishAt, beforeStart, onSaved, onNotice, openSchedule }: {
  initData: string
  beatId: string
  video?: Blob
  fileKey: string
  existingLink: string
  existingPublishAt?: string | null
  beforeStart: () => Promise<void>
  onSaved: (result: YoutubeUploadResult) => void
  onNotice: (message: string) => void
  openSchedule: () => void
}) {
  const key = 'xeinty-youtube-upload:' + beatId + ':' + fileKey
  const beatUploadKey = 'xeinty-youtube-pending:' + beatId
  const [connection, setConnection] = useState<YoutubeConnection>()
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [confirmRepeat, setConfirmRepeat] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [visibility, setVisibility] = useState<YoutubeVisibility>('public')
  const [scheduled, setScheduled] = useState(false)
  const [releaseTime, setReleaseTime] = useState('')
  const [result, setResult] = useState<YoutubeUploadResult>()
  const [error, setError] = useState('')
  const request = useRef<AbortController>(null)
  const session = useRef(readSession(key))
  const pending = useRef(readSession(beatUploadKey) ?? session.current)
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

  const alreadyPublished = Boolean(existingLink.trim() || result?.saved)
  const publishAt = result ? result.publishAt : existingPublishAt
  const actionLabel = scheduled ? 'Запланировать выход' : visibility === 'public' ? 'Опубликовать сейчас' : 'Загрузить видео'

  function forgetUpload() {
    session.current = null
    pending.current = null
    storeSession(key, null)
    storeSession(beatUploadKey, null)
  }

  async function upload(republish = false) {
    if (request.current || (!video && !pending.current) || (alreadyPublished && !republish && !pending.current)) return
    const releaseTimestamp = scheduled && !pending.current ? Date.parse(releaseTime) : undefined
    if (releaseTimestamp !== undefined && (!Number.isFinite(releaseTimestamp) || releaseTimestamp <= Date.now())) {
      setError('Укажи дату и время выхода в будущем.')
      return
    }
    const controller = new AbortController()
    request.current = controller
    setUploading(true)
    setConfirming(false)
    setError('')
    const uploadId = pending.current ?? crypto.randomUUID()
    setConfirmRepeat(false)
    setResult(undefined)
    setProgress(0)
    try {
      if (!pending.current && video) {
        await beforeStart()
        if (controller.signal.aborted) return
        await startYoutubeUpload(initData, {
          uploadId, beatId, size: video.size, mimeType: video.type || 'application/octet-stream', madeForKids: false, republish, visibility,
          publishAt: releaseTimestamp === undefined ? undefined : new Date(releaseTimestamp).toISOString(),
        })
        session.current = uploadId
        pending.current = uploadId
        storeSession(key, uploadId)
        storeSession(beatUploadKey, uploadId)
      }
      let step: YoutubeUploadStep = await resumeYoutubeUpload(initData, uploadId, controller.signal)
      let confirmationChecks = 0
      while ('next' in step) {
        if (controller.signal.aborted) return
        const { next } = step
        if (!video || session.current !== uploadId) {
          throw new Error('Для продолжения выбери тот же файл видео. Если загрузка завершится, ссылку можно восстановить здесь.')
        }
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
      onNotice(step.saved ? (step.publishAt ? 'Выход видео запланирован' : 'Видео успешно загружено на YouTube') : 'Видео загружено, ссылка пока не сохранена')
      if (step.saved) {
        forgetUpload()
        onSaved(step)
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        if (failure instanceof Error && 'status' in failure && (failure.status === 404 || failure.status === 410)) {
          forgetUpload()
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
      {!pending.current && (!alreadyPublished || confirmRepeat) && <div className="youtube-release-options">
        <Dropdown label="Видимость" value={visibility} disabled={uploading || scheduled} options={visibilityOptions}
          onChange={(value) => setVisibility(value as YoutubeVisibility)} />
        <label className="batch-cover-toggle">
          <input type="checkbox" checked={scheduled} disabled={uploading} onChange={(event) => {
            setScheduled(event.target.checked)
            if (event.target.checked) setVisibility('public')
            setError('')
          }} />
          <span>Запланировать выход</span>
        </label>
        {scheduled && <label className="field">
          <span>Дата и время выхода</span>
          <input type="datetime-local" value={releaseTime} disabled={uploading}
            onChange={(event) => { setReleaseTime(event.target.value); setError('') }} />
          <small>Часовой пояс устройства · {Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
        </label>}
      </div>}
      {!video && <p className="form-hint">{pending.current ? 'Можно проверить, принял ли YouTube видео.' : 'Собери видео или выбери файл с устройства.'}</p>}
      {alreadyPublished && !uploading && !pending.current ? <>
        <p className="form-hint">{publishAt && Date.parse(publishAt) > Date.now() ? 'У бита уже запланирован выход на YouTube.' : 'У бита уже есть видео на YouTube.'}</p>
        {confirmRepeat ? <>
          <p className="form-hint">Загрузить новое видео для этого бита?</p>
          <button type="button" className="copy-button" disabled={!video} onClick={() => void upload(true)}>{scheduled ? 'Подтвердить запланированный выход' : 'Подтвердить повторную публикацию'}</button>
          <button type="button" className="copy-button copy-button--subtle" onClick={() => setConfirmRepeat(false)}>Отмена</button>
        </> : <button type="button" className="copy-button" disabled={!video} onClick={() => setConfirmRepeat(true)}>Опубликовать заново</button>}
      </> : <button type="button" className="copy-button" disabled={(!video && !pending.current) || uploading} onClick={() => void upload()}>
        {uploading ? confirming ? 'Ждём подтверждения YouTube…' : 'Загружаем…' : result && !result.saved ? 'Повторить сохранение ссылки' : pending.current ? video && session.current === pending.current ? 'Продолжить загрузку' : 'Проверить загрузку' : actionLabel}
      </button>}
      {!result && (uploading || progress > 0) && <div className="youtube-upload-progress">
        <progress value={progress} max={100} aria-label="Прогресс загрузки" /><span>{progress}%</span>
      </div>}

    </>}
    {error && <p className="video-error" role="alert">{error}</p>}
    {(result?.url || existingLink) && <a className="video-download" href={result?.url || existingLink} target="_blank" rel="noreferrer">Открыть видео на YouTube</a>}
    {publishAt && <YoutubeReleaseTime publishAt={publishAt} />}
    {result && <div className="stats-notice" role="status"><div>
      <strong>{result.saved ? (result.publishAt ? 'Выход видео запланирован' : 'Видео успешно загружено') : 'Видео загружено'}</strong>
      <p>{result.saved ? 'Ссылка сохранена у бита. YouTube может ещё обрабатывать видео.' : 'Ссылка пока не сохранилась. Можно повторить сохранение.'}</p>
      {result.saved && result.publishAt && <button type="button" className="outline-button youtube-open-schedule" onClick={openSchedule}>К расписанию</button>}
    </div></div>}
  </div>
}

export function YoutubeChannelSettings({ initData, openLink }: { initData?: string; openLink?: (url: string) => void }) {
  const [connection, setConnection] = useState<YoutubeConnection>()
  const [profile, setProfile] = useState<ChannelProfile>()
  const [profileLoading, setProfileLoading] = useState(false)
  const [authUrl, setAuthUrl] = useState('')
  const [requestingSchedule, setRequestingSchedule] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!initData) return
    let active = true
    void youtubeConnection(initData).then(async (status) => {
      if (!active) return
      setConnection(status)
      if (!status.connected) return
      setProfileLoading(true)
      try {
        const result = await loadYoutubeChannelProfile(initData)
        if (active) setProfile(result)
      } finally { if (active) setProfileLoading(false) }
    }).catch(() => { if (active) setError('Не удалось загрузить данные канала YouTube.') })
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
      if (!status.connected) return
      const updated = await loadYoutubeChannelProfile(session)
      setProfile(updated)
      if (!updated.needsAccess && (!requestingSchedule || updated.canManageSchedule)) setAuthUrl('')
    })
  }

  const needsConnection = connection?.configured && !connection.connected
  const needsAccess = connection?.connected && profile?.needsAccess

  return <ChannelPanel name="YouTube" description="Публикация видео и расписание">
    {!initData && <p className="form-hint">Открой XEINTY через Telegram, чтобы подключить YouTube.</p>}
    {initData && !connection && !error && <p role="status">Проверяем подключение…</p>}
    {connection?.configured === false && <p className="form-hint">Подключение Google пока не настроено.</p>}
    {connection?.connected && <div className="channel-row">
      <ChannelIdentity title="YouTube подключён" address={profile?.username ?? undefined} profile={profile} loading={profileLoading} />
      <button type="button" className="outline-button" disabled={busy || profileLoading} onClick={() => void run(async (session) => {
        await disconnectYoutube(session)
        setConnection({ configured: true, connected: false })
        setProfile(undefined)
        setAuthUrl('')
      })}>Отключить</button>
    </div>}
    {needsAccess && <p className="form-hint">Обнови доступ Google, чтобы увидеть профиль канала и количество подписчиков.</p>}
    <div className="youtube-channel-actions">
      {(needsConnection || needsAccess) && <button type="button" className="outline-button" disabled={busy} onClick={() => void run(async (session) => {
        setRequestingSchedule(false)
        setAuthUrl((await createYoutubeConnection(session)).url)
      })}>{needsAccess ? 'Обновить доступ' : 'Подключить YouTube'}</button>}
      {connection?.connected && !profileLoading && !profile?.canManageSchedule && <button type="button" className="outline-button"
        disabled={busy} onClick={() => void run(async (session) => {
          setRequestingSchedule(true)
          setAuthUrl((await createYoutubeConnection(session, true)).url)
        })}>Разрешить управление расписанием</button>}
      {(needsConnection || authUrl || (initData && error)) && <button type="button" className="outline-button" disabled={busy} onClick={() => void refresh()}>Проверить подключение</button>}
    </div>
    {authUrl && <>
      <a className="video-download" href={authUrl} target="_blank" rel="noreferrer" onClick={openLink ? (event) => {
        event.preventDefault()
        openLink(authUrl)
      } : undefined}>Открыть Google в браузере</a>
      <p className="form-hint">После согласия вернись в XEINTY и проверь подключение.</p>
    </>}
    {error && <p className="video-error" role="alert">{error}</p>}
  </ChannelPanel>
}
