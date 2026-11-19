import { useRef, useState, type FormEvent } from 'react'
import type { YoutubeScheduleResult } from './cloud-beats'

function localDateTime(value: string) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function YoutubeScheduleEditor({ date, onChange, openChannels }: {
  date: string; onChange: (publishAt: string | null) => Promise<YoutubeScheduleResult>; openChannels: () => void
}) {
  const [action, setAction] = useState<'move' | 'cancel'>()
  const [nextTime, setNextTime] = useState('')
  const [error, setError] = useState('')
  const [needsAccess, setNeedsAccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const request = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!action || request.current) return
    const time = Date.parse(nextTime)
    if (action === 'move' && (!Number.isFinite(time) || time <= Date.now() + 15_000)) {
      setError('Выбери дату и время позже текущего.')
      return
    }
    request.current = true
    setBusy(true)
    setNeedsAccess(false)
    setError('')
    try {
      const result = await onChange(action === 'move' ? new Date(time).toISOString() : null)
      if (result.saved) setAction(undefined)
      else setError('YouTube ответил, но XEINTY не сохранил расписание. Повтори подтверждение, чтобы сверить статус.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось обновить расписание.')
      setNeedsAccess(failure instanceof Error && 'status' in failure && failure.status === 403)
    } finally { request.current = false; setBusy(false) }
  }

  function begin(next: 'move' | 'cancel') {
    setAction(next)
    setNextTime(localDateTime(date))
    setError('')
    setNeedsAccess(false)
  }

  if (!action) return <div className="schedule-actions">
    <button type="button" className="outline-button" onClick={() => begin('move')}>Перенести выход</button>
    <button type="button" className="outline-button" onClick={() => begin('cancel')}>Отменить выход</button>
  </div>

  return <form className="schedule-editor" onSubmit={(event) => void submit(event)}>
    {action === 'move' ? <label className="field">
      <span>Новая дата и время выхода</span>
      <input type="datetime-local" value={nextTime} onChange={(event) => setNextTime(event.target.value)} disabled={busy} required />
      <small>Часовой пояс устройства · {Intl.DateTimeFormat().resolvedOptions().timeZone}</small>
    </label> : <p className="form-hint">Видео останется приватным, а ссылка сохранится в истории.</p>}
    {error && <p className="video-error" role="alert">{error}</p>}
    <div className="schedule-actions">
      <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Обновляем…' : action === 'move' ? 'Сохранить новое время' : 'Подтвердить отмену выхода'}</button>
      <button type="button" className="outline-button" disabled={busy} onClick={() => setAction(undefined)}>Назад</button>
      {needsAccess && <button type="button" className="outline-button" onClick={openChannels}>Открыть каналы</button>}
    </div>
  </form>
}
