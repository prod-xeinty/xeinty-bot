import { useEffect, useState, type CSSProperties } from 'react'
import { ChevronRight, Music2 } from 'lucide-react'
import { loadPlatformStats, type PlatformStats, type PostMetrics, type StatsPlatform } from './cloud-beats'
import { getBeatPublications } from './publication-history'
import type { StoredBeat } from './beat-store'

const numberFormat = new Intl.NumberFormat('ru-RU')
const timeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })

export function usePlatformStats(platform: StatsPlatform, initData?: string, activeView?: string) {
  const [stats, setStats] = useState<PlatformStats>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!initData || !activeView) return
    const request = new AbortController()
    setStats(undefined)
    setError('')
    setLoading(true)
    void loadPlatformStats(initData, platform, request.signal).then((data) => {
      if (!request.signal.aborted) setStats(data)
    }).catch((failure) => {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить статистику.')
    }).finally(() => { if (!request.signal.aborted) setLoading(false) })
    return () => request.abort()
  }, [platform, initData, activeView, revision])

  return { stats, error, loading, refresh: () => setRevision((value) => value + 1) }
}

type StatsState = ReturnType<typeof usePlatformStats>
type LinkedBeat = Pick<StoredBeat, 'id' | 'title' | 'youtubeLink' | 'youtubePublishAt' | 'telegramLink' | 'publications'> & { cloud?: boolean; coverUrl?: string }
const platformNames = { youtube: 'YouTube', telegram: 'Telegram' }
const metricLabels = { views: 'Просмотры', likes: 'Лайки', reactions: 'Реакции', comments: 'Комментарии', forwards: 'Пересылки', saves: 'Сохранения' }
const platformMetrics: Record<StatsPlatform, (keyof PostMetrics)[]> = {
  youtube: ['views', 'likes', 'comments', 'saves'],
  telegram: ['views', 'reactions', 'comments', 'forwards', 'saves'],
}

function linksFor(beat: LinkedBeat, platform: StatsPlatform) {
  return getBeatPublications(beat).filter((post) => post.platform === platform).map((post) => post.url)
}

function beatViews(stats: PlatformStats | undefined, beat: LinkedBeat, platform: StatsPlatform) {
  if (!beat.cloud || !stats) return null
  const links = new Set(linksFor(beat, platform))
  const unique = new Map<string, number>()
  for (const entry of stats.entries) {
    if (entry.beatId === beat.id && links.has(entry.link) && typeof entry.views === 'number') {
      unique.set(entry.mediaKey ?? entry.link, entry.views)
    }
  }
  return unique.size ? [...unique.values()].reduce((total, views) => total + views, 0) : null
}

const chartDay = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'short', timeZone: 'UTC'})

function ViewsHistory({ stats }: { stats?: PlatformStats }) {
  const [days, setDays] = useState<7 | 30>(7)
  if (!stats) return null
  const maximumDate = stats.fetchedAt.slice(0, 10)
  const minimumDay = Date.parse(maximumDate) - (days - 1) * 86_400_000
  const minimumDate = new Date(minimumDay).toISOString().slice(0, 10)
  const points = stats.series?.filter((point) => point.day >= minimumDate) ?? []
  const maximum = Math.max(1, ...points.map((point) => point.views))
  return <section className="view-history" aria-label="Динамика просмотров">
    <div className="stats-list-heading"><h2>Динамика просмотров</h2>
      <div className="view-history-period" role="group" aria-label="Период графика">
        {([7, 30] as const).map((range) => <button key={range} type="button" aria-pressed={days === range}
          onClick={() => setDays(range)}>{range} дней</button>)}
      </div>
    </div>
    {points.length > 1 ? <>
      <ol className="view-history-chart" aria-label="Всего просмотров по дням" style={{ gridTemplateColumns: "repeat(" + days + ", minmax(0, 1fr))" }}>
        {points.map((point) => {
          const label = chartDay.format(Date.parse(point.day)) + ' · ' + numberFormat.format(point.views)
          return <li key={point.day} title={label} aria-label={label}
            style={{ gridColumn: Math.round((Date.parse(point.day) - minimumDay) / 86_400_000) + 1, '--bar-height': (point.views / maximum * 100) + '%' } as CSSProperties}><span /></li>
        })}
      </ol>
      <div className="view-history-axis"><time dateTime={minimumDate}>{chartDay.format(minimumDay)}</time>
        <time dateTime={maximumDate}>{chartDay.format(Date.parse(maximumDate))}</time></div>
      <p className="form-hint">Всего просмотров на день замера. Даты указаны по UTC.</p>
    </> : <p className="form-hint">{stats.series === null ? 'История просмотров временно недоступна.' : 'График появится после замеров за два разных дня. Замер сохраняется при обновлении статистики.'}</p>}
  </section>
}

function MetricCards({ platform, metrics }: { platform: StatsPlatform; metrics?: PostMetrics }) {
  return <dl className="stats-metric-grid">{platformMetrics[platform].map((key) => {
    const value = metrics?.[key]
    return <div key={key} className="stats-metric-card">
      <dt>{metricLabels[key]}</dt>
      <dd>{typeof value === 'number' ? numberFormat.format(value) : <span aria-label="Нет данных">—</span>}</dd>
    </div>
  })}</dl>
}

function StatsControls({ state, openChannels }: { state: StatsState; openChannels: () => void }) {
  return <>
    {state.error && <p className="video-error" role="alert">{state.error}</p>}
    <div className="youtube-stats-actions">
      <button className="outline-button" type="button" onClick={state.refresh} disabled={state.loading}>
        {state.loading ? 'Обновляем…' : 'Обновить данные'}
      </button>
      {state.error && <button className="outline-button" type="button" onClick={openChannels}>Открыть каналы</button>}
      {state.stats && <small>Обновлено <time dateTime={state.stats.fetchedAt}>{timeFormat.format(Date.parse(state.stats.fetchedAt))}</time></small>}
    </div>
  </>
}

export function StatsOverview({ platform, setPlatform, beats, state, openBeat, openChannels, openPublication }: {
  platform: StatsPlatform; setPlatform: (platform: StatsPlatform) => void;
  beats: LinkedBeat[]; state: StatsState; openBeat: (id: string) => void;
  openChannels: () => void; openPublication: () => void
}) {
  const linked = beats.filter((beat) => beat.cloud && linksFor(beat, platform).length > 0)
  const result = state.stats
  const rows = linked.map((beat) => ({ ...beat, views: beatViews(result, beat, platform) }))
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
  return <section className="overview-hero youtube-stats" aria-label="Сводка по площадкам">
    <div className="publish-mode stats-platform-switch" role="group" aria-label="Площадка"
      style={{ '--tab-i': platform === 'youtube' ? 0 : 1 } as CSSProperties}>
      {(['youtube', 'telegram'] as const).map((item) => <button key={item} type="button" className={platform === item ? 'is-active' : undefined} aria-pressed={platform === item}
        onClick={() => setPlatform(item)}>{platformNames[item]}</button>)}
    </div>
    {linked.length === 0 ? <>
      <p>Опубликуй бит или добавь ссылку {platformNames[platform]} в его карточке.</p>
      <button type="button" className="outline-button" onClick={openPublication}>К публикации</button>
    </> : <>
      <MetricCards platform={platform} metrics={result?.totals} />
      <div className="stats-coverage" role="status">
        {result && <span>Просмотры получены {platform === 'youtube' ? 'по видео' : 'по постам'} · {result.videosWithViews} из {result.linkedVideos}</span>}
        {result?.unsupported && <span>Некоторые ссылки ведут не на посты Telegram или указаны в неподдерживаемом формате.</span>}
        {result?.restricted && <span>Для статистики закрытого канала подключи его во вкладке «Каналы» и проверь права администратора.</span>}
        <span>Прочерк означает, что данных нет. Счётчик сохранений пока недоступен.</span>
      </div>
      <StatsControls state={state} openChannels={openChannels} />
      <ViewsHistory stats={result} />
      <div className="stats-list-heading"><h2>По битам</h2><span>Просмотры</span></div>
      <ul className="youtube-stats-list" aria-label="Просмотры по битам">{rows.map((beat) => <li key={beat.id}>
        <button type="button" onClick={() => openBeat(beat.id)}>
          <span className="stats-row-cover" aria-hidden="true">
            {beat.coverUrl ? <img src={beat.coverUrl} loading="lazy" alt="" /> : <Music2 size={17} />}
          </span>
          <span className="stats-row-title">{beat.title}</span>
          <strong>{beat.views === null ? '—' : numberFormat.format(beat.views)}</strong>
          <ChevronRight className="stats-row-arrow" size={16} aria-hidden="true" />
        </button>
      </li>)}</ul>
    </>}
  </section>
}
