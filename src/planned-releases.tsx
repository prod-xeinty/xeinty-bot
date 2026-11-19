import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronRight, Play, RefreshCw } from 'lucide-react'
import type { StoredBeat } from './beat-store'
import { getBeatPublications } from './publication-history'

type ReleaseBeat = Pick<StoredBeat, 'id' | 'title' | 'telegramLink' | 'youtubeLink' | 'youtubePublishAt' | 'publications'> & {
  coverUrl?: string; isDemo?: boolean
}

const dayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

export function PlannedReleases({ beats, openRelease, openComposer, refresh }: {
  beats: ReleaseBeat[]
  openRelease: (beatId: string, url: string) => void
  openComposer: () => void
  refresh?: (links: { url: string; publishAt: string }[]) => Promise<{ changed: number; unavailable: number }>
}) {
  const [now, setNow] = useState(Date.now)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const releases = beats.filter((beat) => !beat.isDemo).flatMap((beat) => getBeatPublications(beat).flatMap((post) => {
    if (post.platform !== 'youtube' || !post.publishAt) return []
    const time = Date.parse(post.publishAt)
    return time > now ? [{ beat, url: post.url, publishAt: post.publishAt, time }] : []
  })).sort((a, b) => a.time - b.time)
  const byDay = new Map<string, typeof releases>()
  const seen = new Set<string>()
  for (const release of releases) {
    if (seen.has(release.url)) continue
    seen.add(release.url)
    const day = dayFormat.format(release.time)
    const group = byDay.get(day) ?? []
    group.push(release)
    byDay.set(day, group)
  }

  async function sync() {
    if (inFlight.current || !refresh) return
    inFlight.current = true
    setChecking(true)
    setError('')
    setMessage('')
    try {
      const { changed, unavailable } = await refresh([...byDay.values()].flat().map(({url, publishAt}) => ({url, publishAt})))
      const results = [changed ? 'Обновлено видео: ' + changed : '', unavailable ? 'Не удалось проверить: ' + unavailable : ''].filter(Boolean)
      setMessage(results.join(' · ') || 'Расписание совпадает с YouTube.')
      setNow(Date.now())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось сверить расписание.')
    } finally { inFlight.current = false; setChecking(false) }
  }

  return <section className="planned-releases" aria-label="Предстоящие релизы YouTube">
    {byDay.size > 0 && <div className="planned-releases-head">
      <div className="section-intro">
        <h2>Расписание YouTube</h2>
        <p>Время по часовому поясу устройства · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
      </div>
      {refresh && <button type="button" className="outline-button" onClick={() => void sync()} disabled={checking}>
        <RefreshCw size={15} aria-hidden="true" /> {checking ? 'Сверяем…' : 'Сверить с YouTube'}
      </button>}
    </div>}
    {message && <p className="planned-refresh-note form-hint" role="status">{message}</p>}
    {error && <p className="planned-refresh-note video-error" role="alert">{error}</p>}
    {!byDay.size && <div className="publish-empty planned-empty">
      <CalendarDays size={25} aria-hidden="true" />
      <strong>Запланированных релизов пока нет</strong>
      <p>Загрузи видео на YouTube и выбери дату выхода.</p>
      <button type="button" className="outline-button" onClick={openComposer}>Запланировать видео</button>
    </div>}
    {[...byDay].map(([day, group]) => <section className="release-day" key={day} aria-label={day}>
      <h3>{day}</h3>
      <ul className="youtube-stats-list release-list">{group.map(({ beat, url, publishAt, time }) => <li key={url}>
        <button type="button" onClick={() => openRelease(beat.id, url)}>
          <time dateTime={publishAt}>{timeFormat.format(time)}</time>
          <span className="stats-row-cover" aria-hidden="true">
            {beat.coverUrl ? <img src={beat.coverUrl} loading="lazy" alt="" /> : <Play size={14} />}
          </span>
          <span className="stats-row-title">{beat.title}</span>
          <ChevronRight className="stats-row-arrow" size={16} aria-hidden="true" />
        </button>
      </li>)}</ul>
    </section>)}
  </section>
}
