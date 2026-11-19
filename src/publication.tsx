import { Dropdown } from './choice-menu'
import { useEffect, useRef, useState } from 'react'
import { activeTelegramPublication, resetTelegramPublication, resumeTelegramPublication, type TelegramAttempt, type TelegramChannel, type TelegramPublication } from './cloud-beats'

const telegramAttemptKey = 'xeinty-telegram-attempt'
function readAttemptId() {
  try { return sessionStorage.getItem(telegramAttemptKey) ?? '' } catch { return '' }
}

export function DirectTelegramPublication({ publish, channels, publishedCount, initData, onRecovered }: {
  channels: TelegramChannel[]
  publishedCount: number
  initData: string
  publish: (attemptId: string, channel: string, republish: boolean) => Promise<TelegramPublication>
  onRecovered: (result: TelegramPublication) => void
}) {
  const [channel, setChannel] = useState('')
  const selectedChannel = channels.find((item) => item.id === channel)
  const [confirm, setConfirm] = useState<false | 'first' | 'repeat'>(false)
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const [checking, setChecking] = useState(true)
  const [attempt, setAttempt] = useState<TelegramAttempt | null>(null)
  const [pendingId, setPendingId] = useState(readAttemptId)
  const [confirmReset, setConfirmReset] = useState(false)
  const [result, setResult] = useState<TelegramPublication>()
  const [error, setError] = useState('')

  function remember(id: string) {
    setPendingId(id)
    try { if (id) sessionStorage.setItem(telegramAttemptKey, id); else sessionStorage.removeItem(telegramAttemptKey) }
    catch { /* Status remains available from the server. */ }
  }

  useEffect(() => {
    let active = true
    void activeTelegramPublication(initData).then(({ attempt }) => {
      if (active) setAttempt(attempt)
    }).catch(() => {}).finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [initData])

  async function run(task: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try { await task() }
    catch (failure) {
      const message = failure instanceof Error && !(failure instanceof TypeError) ? failure.message : 'Ответ потерялся. Проверь статус отправки.'
      setError(message)
      const status = await activeTelegramPublication(initData).catch(() => null)
      if (status) setAttempt(status.attempt)
    } finally {
      running.current = false
      setBusy(false)
      setConfirm(false)
    }
  }

  function complete(next: TelegramPublication) {
    setResult(next)
    if (next.saved) { remember(''); setAttempt(null) }
  }

  function send() {
    if (!confirm || !selectedChannel) return
    const id = crypto.randomUUID()
    void run(async () => {
      remember(id)
      const next = await publish(id, selectedChannel.id, confirm === 'repeat')
      complete(next)
      if (!next.saved) setAttempt((await activeTelegramPublication(initData)).attempt)
    })
  }

  function check() {
    const id = attempt?.id || pendingId
    if (!id) return
    void run(async () => {
      if (attempt?.stage === 'cover_sending' || attempt?.stage === 'audio_sending') {
        const current = (await activeTelegramPublication(initData)).attempt
        if (current) { setAttempt(current); return }
      }
      try {
        const next = await resumeTelegramPublication(initData, id)
        onRecovered(next)
        complete(next)
        if (!next.saved) setAttempt((await activeTelegramPublication(initData)).attempt)
      } catch (failure) {
        if (failure instanceof Error && 'status' in failure && (failure.status === 404 || failure.status === 410) && !attempt) remember('')
        throw failure
      }
    })
  }

  const pending = Boolean(attempt || pendingId)
  const uncertain = attempt?.stage === 'cover_sending' || attempt?.stage === 'audio_sending'
  const channelTitle = channels.find((item) => item.id === attempt?.channel)?.title
  const continueLabel = attempt?.stage === 'cover_ready' ? 'Повторить отправку обложки'
    : attempt?.stage === 'audio_ready' ? 'Продолжить отправку аудио'
    : attempt?.stage === 'audio_sent' ? 'Повторить сохранение ссылки' : 'Проверить статус отправки'

  return <form className="publication-link" onSubmit={(event) => {
    event.preventDefault()
    if (!busy && !checking && !pending && !confirm && selectedChannel) setConfirm(publishedCount || result ? 'repeat' : 'first')
  }}>
    {checking && <p className="form-hint" role="status">Проверяем незавершённые отправки…</p>}
    {!checking && (pending ? <>
      <p className="form-hint" role="status">{channelTitle && channelTitle + ' · '}
        {attempt?.coverSent && 'Обложка отправлена. '}
        {uncertain ? 'Telegram ещё не подтвердил отправку. Проверь канал.'
          : attempt?.stage === 'audio_sent' ? 'Аудио отправлено. Осталось сохранить ссылку.' : 'Есть незавершённая отправка в Telegram.'}
      </p>
      <button type="button" className="copy-button" disabled={busy} onClick={check}>{busy ? 'Проверяем…' : continueLabel}</button>
      {attempt && attempt.stage !== 'audio_sent' && (confirmReset ? <>
        <p className="form-hint">Проверь канал. Завершение попытки позволит начать новую отправку.</p>
        <button type="button" className="outline-button" disabled={busy} onClick={() => void run(async () => {
          await resetTelegramPublication(initData, attempt.id)
          setAttempt(null); setConfirmReset(false); remember('')
        })}>Проверил канал, завершить попытку</button>
        <button type="button" className="outline-button" disabled={busy} onClick={() => setConfirmReset(false)}>Отмена</button>
      </> : <button type="button" className="copy-button copy-button--subtle" disabled={busy} onClick={() => setConfirmReset(true)}>Завершить попытку</button>)}
    </> : <>
      <Dropdown label="Канал Telegram" placeholder="Выбрать канал" value={selectedChannel?.id ?? ''}
        disabled={!channels.length || busy || Boolean(confirm)} onChange={setChannel}
        options={channels.map((item) => ({ value: item.id, label: item.title + (item.username ? ' (@' + item.username + ')' : '') }))} />
      {!result && channels.length === 0 && <p className="form-hint">Сначала подключи канал во вкладке «Каналы».</p>}
      {!confirm && (publishedCount > 0 || result) && <p className="form-hint">Публикации уже есть в истории.</p>}
      {!confirm && <button className="copy-button" disabled={!selectedChannel || busy}>{publishedCount || result ? 'Опубликовать заново' : 'Опубликовать через бота'}</button>}
      {confirm && <>
        <p className="form-hint">{confirm === 'repeat' ? 'Отправить новый пост с выбранными битами' : 'Отправить аудио и текущую подпись'} в {selectedChannel?.title}?</p>
        <button type="button" className="copy-button" disabled={busy} onClick={send}>{confirm === 'repeat' ? 'Подтвердить повторную публикацию' : 'Подтвердить публикацию'}</button>
        <button type="button" className="copy-button copy-button--subtle" disabled={busy} onClick={() => setConfirm(false)}>Отмена</button>
      </>}
    </>)}
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

export function OwnYoutubeVideo({ file, onChange }: { file?: File; onChange: (file?: File) => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!file) { setUrl(''); return }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return <div className="video-result">
    <label className="upload-zone">
      <input type="file" accept="video/*,.mp4,.mov,.webm,.mkv" onChange={(event) => onChange(event.target.files?.[0])} />
      <strong>{file?.name || 'Выбрать видео с устройства'}</strong>
    </label>
    {file && url && <>
      <video src={url} controls playsInline preload="metadata" aria-label="Предпросмотр своего видео" />
      <a className="video-download" href="https://studio.youtube.com/" target="_blank" rel="noreferrer">Открыть YouTube Studio</a>
      <p>Выбери этот же файл при загрузке через Studio.</p>
    </>}
  </div>
}
