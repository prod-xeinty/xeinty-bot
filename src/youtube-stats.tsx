import { useEffect, useState } from 'react'
import { loadYoutubeStats, type YoutubeStats } from './cloud-beats'

const numberFormat = new Intl.NumberFormat('ru-RU')
const timeFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })

export function useYoutubeStats(initData?: string, activeView?: string) {
  const [stats, setStats] = useState<YoutubeStats>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!initData || !activeView) return
    const request = new AbortController()
    setStats(undefined)
    setError('')
    setLoading(true)
    void loadYoutubeStats(initData, request.signal).then((data) => {
      if (!request.signal.aborted) setStats(data)
    }).catch((failure) => {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : 'Не удалось загрузить просмотры.')
    }).finally(() => { if (!request.signal.aborted) setLoading(false) })
    return () => request.abort()
  }, [initData, activeView, revision])

  return { stats, error, loading, refresh: () => setRevision((value) => value + 1) }
}

type StatsState = ReturnType<typeof useYoutubeStats>
type LinkedBeat = { id: string; title: string; youtubeLink: string; cloud?: boolean }

function readViews(stats: YoutubeStats | undefined, beat: LinkedBeat) {
  if (!beat.cloud) return null
  return stats?.entries.find((entry) => entry.beatId === beat.id && entry.link === beat.youtubeLink)?.views ?? null
}

function StatsControls({ state, openChannels }: { state: StatsState; openChannels: () => void }) {
  return <>
    {state.error && <p className="video-error" role="alert">{state.error}</p>}
    <div className="youtube-stats-actions">
      <button className="outline-button" type="button" onClick={state.refresh} disabled={state.loading}>
        {state.loading ? 'Обновляем…' : 'Обновить просмотры'}
      </button>
      {state.error && <button className="outline-button" type="button" onClick={openChannels}>Открыть каналы</button>}
      {state.stats && <small>Данные на <time dateTime={state.stats.fetchedAt}>{timeFormat.format(Date.parse(state.stats.fetchedAt))}</time></small>}
    </div>
  </>
}

export function YoutubeOverview({ beats, state, openBeat, openChannels, openPublication }: {
  beats: LinkedBeat[]; state: StatsState; openBeat: (id: string) => void
  openChannels: () => void; openPublication: () => void
}) {
  const linked = beats.filter((beat) => beat.cloud && beat.youtubeLink.trim())
  const result = state.stats
  const rows = linked.map((beat) => ({ ...beat, views: readViews(result, beat) }))
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
  return <section className="overview-hero youtube-stats">
    <h2>Просмотры YouTube</h2>
    {linked.length === 0 ? <>
      <p>Опубликуй бит через XEINTY или добавь ссылку YouTube в его карточке.</p>
      <button type="button" className="outline-button" onClick={openPublication}>К публикации</button>
    </> : <>
      <div className="youtube-stats-total" aria-live="polite">
        <strong>{result?.videosWithViews ? numberFormat.format(result.totalViews) : '—'}</strong>
        {result && (result.linkedVideos > 0
          ? <span>Данные по {result.videosWithViews} из {result.linkedVideos} видео</span>
          : <span>Проверь ссылки на видео YouTube</span>)}
      </div>
      <StatsControls state={state} openChannels={openChannels} />
      <ul className="youtube-stats-list" aria-label="Просмотры по битам">{rows.map((beat) => <li key={beat.id}>
        <button type="button" onClick={() => openBeat(beat.id)}>
          <span>{beat.title}</span>
          <strong>{beat.views === null ? '—' : numberFormat.format(beat.views)}</strong>
        </button>
      </li>)}</ul>
    </>}
  </section>
}

export function YoutubeBeatViews({ beat, state, openChannels }: {
  beat: LinkedBeat; state: StatsState; openChannels: () => void
}) {
  if (!beat.youtubeLink.trim()) return null
  const views = readViews(state.stats, beat)
  return <section className="youtube-beat-views" aria-label="Просмотры YouTube">
    <div className="youtube-stats-total" aria-live="polite">
      <strong>{views === null ? '—' : numberFormat.format(views)}</strong>
      <span>Просмотры YouTube</span>
    </div>
    {!beat.cloud && <p className="form-hint">Перенеси бит в облако, чтобы получать просмотры.</p>}
    {beat.cloud && state.stats && views === null && <p className="form-hint">YouTube пока не вернул просмотры по этой ссылке.</p>}
    {beat.cloud && <StatsControls state={state} openChannels={openChannels} />}
  </section>
}
