import { useEffect, useState, type CSSProperties } from 'react'
import { ChevronRight, Music2 } from 'lucide-react'
import { BeatSearch, matchBeats } from './beat-library'
import { Dropdown } from './choice-menu'
import { loadPlatformStats, type PlatformStats, type StatsPlatform } from './cloud-beats'
import { getBeatPublications } from './publication-history'
import type { StoredBeat } from './beat-store'

const numberFormat = new Intl.NumberFormat('ru-RU')
const timeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })

export function usePlatformStats(platform: StatsPlatform, initData?: string, activeView?: string) {
  type Snapshot = { data: PlatformStats; session: string; platform: StatsPlatform; view: string }
  const [overview, setOverview] = useState<Snapshot>()
  const [detail, setDetail] = useState<Snapshot>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!initData || !activeView) return
    const request = new AbortController()
    setError('')
    setLoading(true)
    const beatId = activeView === 'overview' ? undefined : activeView
    void loadPlatformStats(initData, platform, request.signal, beatId).then((data) => {
      if (!request.signal.aborted) (beatId ? setDetail : setOverview)({ data, session: initData, platform, view: activeView })
    }).catch((failure) => {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить статистику.')
    }).finally(() => { if (!request.signal.aborted) setLoading(false) })
    return () => request.abort()
  }, [platform, initData, activeView, revision])

  const snapshot = activeView === 'overview' ? overview : detail
  const stats = snapshot?.view === activeView && snapshot?.session === initData && snapshot?.platform === platform ? snapshot?.data : undefined
  return { stats, error, loading, refresh: () => setRevision((value) => value + 1) }
}

type StatsState = ReturnType<typeof usePlatformStats>
type LinkedBeat = Pick<StoredBeat, 'id' | 'title' | 'bpm' | 'key' | 'tags' | 'audioName' | 'youtubeLink' | 'youtubePublishAt' | 'telegramLink' | 'publications'> & { cloud?: boolean; coverUrl?: string }
const platformNames = { youtube: 'YouTube', telegram: 'Telegram' }
const metricLabels = { views: 'Просмотры', likes: 'Лайки', reactions: 'Реакции', comments: 'Комментарии', forwards: 'Пересылки' }
const rankingMetrics = {
  youtube: ['views', 'likes', 'comments'],
  telegram: ['views', 'reactions', 'comments', 'forwards'],
} as const
type RankingMetric = typeof rankingMetrics[StatsPlatform][number]
export type StatsRanking = { query: string; metrics: Record<StatsPlatform, RankingMetric> }

function rankBeats(beats: { beat: LinkedBeat; links: Set<string> }[], stats: PlatformStats | undefined, metric: RankingMetric) {
  const rows = new Map(beats.map(({ beat, links }) => [beat.id, { beat, links, counts: new Map<string, number>() }]))
  for (const entry of stats?.entries ?? []) {
    const row = rows.get(entry.beatId)
    const count = entry[metric]
    if (row?.links.has(entry.link) && typeof count === 'number') row.counts.set(entry.mediaKey ?? entry.link, count)
  }
  return Array.from(rows.values(), ({ beat, counts }) => ({
    beat, count: counts.size ? Array.from(counts.values()).reduce((sum, value) => sum + value, 0) : null,
  })).sort((a, b) => (b.count ?? -1) - (a.count ?? -1))
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

function MetricCards({ metrics }: { metrics: { key: RankingMetric; value: number }[] }) {
  if (!metrics.length) return null
  return <dl className="stats-metric-grid">{metrics.map(({ key, value }) => (
    <div key={key} className="stats-metric-card">
      <dt>{metricLabels[key]}</dt>
      <dd>{numberFormat.format(value)}</dd>
    </div>
  ))}</dl>
}

function StatsControls({ state, openChannels }: { state: StatsState; openChannels: () => void }) {
  return <>
    {state.error && <p className="video-error" role="alert">{state.error}</p>}
    <div className="youtube-stats-actions">
      <button className="outline-button" type="button" onClick={state.refresh} disabled={state.loading}>
        {state.loading ? 'Обновляем…' : 'Обновить данные'}
      </button>
      {state.error && <button className="outline-button" type="button" onClick={openChannels}>Открыть каналы</button>}
      {state.stats && <small>Последний замер <time dateTime={state.stats.fetchedAt}>{timeFormat.format(Date.parse(state.stats.fetchedAt))}</time></small>}
    </div>
  </>
}

export function StatsOverview({ platform, setPlatform, beats, state, ranking, setRanking, openBeat, openChannels, openPublication }: {
  platform: StatsPlatform; setPlatform: (platform: StatsPlatform) => void;
  beats: LinkedBeat[]; state: StatsState; ranking: StatsRanking; setRanking: (ranking: StatsRanking) => void;
  openBeat: (id: string) => void;
  openChannels: () => void; openPublication: () => void
}) {
  const linked = beats.filter((beat) => beat.cloud).map((beat) => ({
    beat, links: new Set(getBeatPublications(beat).filter((post) => post.platform === platform).map((post) => post.url)),
  })).filter(({ links }) => links.size > 0)
  const result = state.stats
  const metrics = rankingMetrics[platform].flatMap((key) => {
    const value = result?.totals[key]
    return typeof value === 'number' ? [{ key, value }] : []
  })
  const options = metrics.map(({ key }) => ({ value: key, label: metricLabels[key] }))
  const preferredMetric = ranking.metrics[platform]
  const metric = options.some(({ value }) => value === preferredMetric) ? preferredMetric : options[0]?.value
  const matches = new Set(matchBeats(linked.map(({ beat }) => beat), ranking.query).map((beat) => beat.id))
  const rows = metric ? rankBeats(linked.filter(({ beat }) => matches.has(beat.id)), result, metric) : []
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
      <MetricCards metrics={metrics} />
      {result && !metrics.length && <p className="form-hint">Статистика по этим публикациям пока недоступна.</p>}
      <div className="stats-coverage" role="status">
        {result && typeof result.totals.views === 'number' && <span>Просмотры получены {platform === 'youtube' ? 'по видео' : 'по постам'} · {result.videosWithViews} из {result.linkedVideos}</span>}
        {result?.unsupported && <span>Некоторые ссылки ведут не на посты Telegram или указаны в неподдерживаемом формате.</span>}
        {result?.restricted && <span>Для статистики закрытого канала подключи его во вкладке «Каналы» и проверь права администратора.</span>}
      </div>
      <StatsControls state={state} openChannels={openChannels} />
      {result && (typeof result.totals.views === 'number' || Boolean(result.series?.length)) && <ViewsHistory stats={result} />}
      {metric && <section className="stats-ranking" aria-label="Рейтинг битов">
        <div className="stats-list-heading"><h2>По битам</h2><span role="status">{rows.length} из {linked.length}</span></div>
        <div className="stats-ranking-controls">
          <BeatSearch label="Поиск бита в статистике" value={ranking.query} onChange={(query) => setRanking({ ...ranking, query })} />
          <Dropdown label="Показатель" value={metric} options={options} onChange={(value) => {
            const option = options.find((item) => item.value === value)
            if (option) setRanking({ ...ranking, metrics: { ...ranking.metrics, [platform]: option.value } })
          }} />
        </div>
        {rows.length === 0 && <p className="form-hint" role="status">По этому запросу ничего не найдено.</p>}
        {rows.length > 0 && <ul className="youtube-stats-list" aria-label={metricLabels[metric] + " по битам"}>{rows.map(({ beat, count }) => <li key={beat.id}>
            <button type="button" onClick={() => openBeat(beat.id)}>
              <span className="stats-row-cover" aria-hidden="true">
                {beat.coverUrl ? <img src={beat.coverUrl} loading="lazy" alt="" /> : <Music2 size={17} />}
              </span>
              <span className="stats-row-title">{beat.title}</span>
              <strong>{count === null ? <span aria-label="Нет данных">—</span> : numberFormat.format(count)}</strong>
              <ChevronRight className="stats-row-arrow" size={16} aria-hidden="true" />
            </button>
          </li>)}</ul>}
      </section>}
    </>}
  </section>
}
