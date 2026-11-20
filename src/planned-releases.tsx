import { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronRight, Play, RefreshCw } from 'lucide-react'
import type { StoredBeat } from './beat-store'
import { BeatSearch, matchBeats } from './beat-library'
import { getBeatPublications } from './publication-history'

type ReleaseBeat = Pick<StoredBeat, 'id' | 'title' | 'bpm' | 'key' | 'tags' | 'audioName' | 'telegramLink' | 'youtubeLink' | 'youtubePublishAt' | 'publications'> & {
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
  const [query, setQuery] = useState('')
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const inFlight = useRef(false)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const releasesByUrl = new Map<string, { beat: ReleaseBeat; url: string; publishAt: string; time: number }>()
  for (const beat of beats) {
    if (beat.isDemo) continue
    for (const post of getBeatPublications(beat)) {
      if (post.platform !== 'youtube' || !post.publishAt || releasesByUrl.has(post.url)) continue
      const time = Date.parse(post.publishAt)
      if (Number.isFinite(time)) releasesByUrl.set(post.url, { beat, url: post.url, publishAt: post.publishAt, time })
    }
  }
  const releases = [...releasesByUrl.values()].sort((a, b) => a.time - b.time)
  const matched = new Set(matchBeats(beats, query).map(({ id }) => id))
  const byDay = new Map<string, typeof releases>()
  const upcoming = releases.filter(({ time }) => time > now)
  const elapsed = releases.filter(({ time }) => time <= now).reverse()
  for (const release of [...upcoming, ...elapsed]) {
    if (!matched.has(release.beat.id)) continue
    const date = dayFormat.format(release.time)
    const day = release.time > now ? date : date + ' · Время выхода прошло'
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
      const { changed, unavailable } = await refresh(releases.map(({ url, publishAt }) => ({ url, publishAt })))
      const results = [changed ? 'Обновлено видео: ' + changed : '', unavailable ? 'Не удалось проверить: ' + unavailable : ''].filter(Boolean)
      setMessage(results.join(' · ') || 'Расписание совпадает с YouTube.')
      setNow(Date.now())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось сверить расписание.')
    } finally { inFlight.current = false; setChecking(false) }
  }

  return <section className="planned-releases" aria-label="Расписание релизов YouTube">
    {releases.length > 0 && <div className="planned-releases-head">
      <div className="section-intro">
        <h2>Расписание YouTube</h2>
        <p>Время по часовому поясу устройства · {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
      </div>
      {refresh && <button type="button" className="outline-button" onClick={() => void sync()} disabled={checking}>
        <RefreshCw size={15} aria-hidden="true" /> {checking ? 'Сверяем…' : 'Сверить с YouTube'}
      </button>}
    </div>}
    {releases.length > 0 && <div className="planned-releases-head">
      <BeatSearch label="Поиск по расписанию" value={query} onChange={setQuery} />
      <span className="form-hint" role="status">Предстоящие: {upcoming.length}{elapsed.length > 0 && ' · Время выхода прошло: ' + elapsed.length}</span>
    </div>}
    {message && <p className="planned-refresh-note form-hint" role="status">{message}</p>}
    {error && <p className="planned-refresh-note video-error" role="alert">{error}</p>}
    {releases.length > 0 && !byDay.size && <p className="form-hint" role="status">По этому запросу релизы не найдены.</p>}
    {!releases.length && <div className="publish-empty planned-empty">
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
