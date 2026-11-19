import { useState, type FormEvent } from 'react'
import { ArrowUpRight, Play, Send } from 'lucide-react'
import { Dropdown } from './choice-menu'
import { YoutubeReleaseTime } from './youtube-upload'
import type { BeatPublication, StoredBeat } from './beat-store'
import type { PlatformStats, StatsPlatform, TelegramChannel } from './cloud-beats'

type PublicationSource = Pick<StoredBeat, 'telegramLink' | 'youtubeLink' | 'youtubePublishAt' | 'publications'>
const names = { telegram: 'Telegram', youtube: 'YouTube' }
const visibilityNames = new Map([['public', 'Открытое'], ['unlisted', 'По ссылке'], ['private', 'Приватное']])
const dates = new Intl.DateTimeFormat('ru-RU', {dateStyle: 'medium', timeStyle: 'short'})
const numbers = new Intl.NumberFormat('ru-RU')

export function getBeatPublications(beat: PublicationSource) {
  const posts = [...(beat.publications ?? [])]
  for (const platform of ['telegram', 'youtube'] as const) {
    const url = (platform === 'telegram' ? beat.telegramLink : beat.youtubeLink).trim()
    if (url && !posts.some((post) => post.platform === platform && post.url === url)) {
      posts.push({ platform, url, publishAt: platform === 'youtube' ? beat.youtubePublishAt : null })
    }
  }
  return posts.sort((first, second) => (second.savedAt ?? '').localeCompare(first.savedAt ?? ''))
}

export function rememberPublication<T extends PublicationSource>(beat: T, platform: StatsPlatform, url: string, publishAt?: string | null): T {
  const posts = getBeatPublications(beat)
  const existing = posts.find((post) => post.platform === platform && post.url === url)
  const publication = { platform, url, publishAt, savedAt: existing ? existing.savedAt : new Date().toISOString() }
  const latest = platform === 'telegram' ? { telegramLink: url } : { youtubeLink: url, youtubePublishAt: publishAt }
  return { ...beat, ...latest, publications: [publication, ...posts.filter((post) => post !== existing)] }
}

function postUrl(value: string, platform: StatsPlatform) {
  try {
    const url = new URL(value.trim())
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port || url.href.length > 1000) return null
    const host = url.hostname.replace(/^www\./, '')
    const path = url.pathname.split('/').filter(Boolean)
    if (platform === 'telegram') {
      if (host !== 't.me' || !/^\/(?:[a-z][a-z0-9_]{3,31}|s\/[a-z][a-z0-9_]{3,31}|c\/[1-9]\d{0,11})\/[1-9]\d{0,9}\/?$/i.test(url.pathname)) return null
      return 'https://t.me/' + path.join('/')
    }
    const videoId = host === 'youtu.be' && path.length === 1 ? path[0]
      : ['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
        ? path[0] === 'watch' ? url.searchParams.get('v')
          : ['shorts', 'live', 'embed'].includes(path[0]) ? path[1] : null
        : null
    return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? 'https://youtu.be/' + videoId : null
  } catch { return null }
}

function channelName(post: BeatPublication, channels: TelegramChannel[]) {
  if (post.platform === 'youtube') return ''
  const path = new URL(post.url).pathname.split('/').filter(Boolean)
  if (path[0] === 'c') return channels.find((channel) => channel.id === String(-1e12 - Number(path[1])))?.title ?? 'Закрытый канал'
  const username = path[0] === 's' ? path[1] : path[0]
  return username ? channels.find((channel) => channel.username?.toLowerCase() === username.toLowerCase())?.title ?? '@' + username : ''
}

export function PublicationHistory({ beat, channels, stats, save, openPublication }: {
  beat: PublicationSource & { id: string; isDemo?: boolean }; channels: TelegramChannel[];
  stats: Record<StatsPlatform, PlatformStats | undefined>;
  save: (platform: StatsPlatform, url: string) => Promise<void>; openPublication: () => void
}) {
  const [platform, setPlatform] = useState<StatsPlatform>('telegram')
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const posts = getBeatPublications(beat)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    const url = postUrl(value, platform)
    if (!url) { setError('Вставь ссылку на конкретный пост или видео.'); return }
    if (posts.some((post) => post.platform === platform && postUrl(post.url, platform) === url)) {
      setError('Эта публикация уже есть в истории.'); return
    }
    setSaving(true)
    setError('')
    try { await save(platform, url); setValue('') }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось сохранить ссылку.') }
    finally { setSaving(false) }
  }

  return <div className="detail-section publication-history">
    <div className="section-intro"><h2>Публикации</h2></div>
    {posts.length === 0 ? <div className="links-panel">
      <p className="form-hint">У этого бита пока нет публикаций.</p>
      <button type="button" className="outline-button" onClick={openPublication}>К публикации</button>
    </div> : <ul className="history-list">{posts.map((post) => {
      const metrics = stats[post.platform]?.entries.find((entry) => entry.beatId === beat.id && entry.link === post.url)
      const href = postUrl(post.url, post.platform)
      const channel = metrics?.channel ?? (href ? channelName(post, channels) : '')
      const scheduled = post.publishAt && Date.parse(post.publishAt) > Date.now()
      const status = post.platform === 'telegram' && metrics?.mediaKey ? 'Опубликовано' : visibilityNames.get(metrics?.visibility ?? '')
      const metricsText = [
        typeof metrics?.views === 'number' ? numbers.format(metrics.views) + ' просм.' : '',
        typeof metrics?.likes === 'number' ? numbers.format(metrics.likes) + ' лайков' : '',
        typeof metrics?.reactions === 'number' ? numbers.format(metrics.reactions) + ' реакций' : '',
        typeof metrics?.comments === 'number' ? numbers.format(metrics.comments) + ' коммент.' : '',
        typeof metrics?.forwards === 'number' ? numbers.format(metrics.forwards) + ' пересылок' : '',
      ].filter(Boolean).join(' · ')
      return <li key={post.platform + ':' + post.url} className="history-row">
        <span className="platform-icon" aria-hidden="true">{post.platform === 'telegram' ? <Send size={16} /> : <Play size={17} />}</span>
        <div className="history-row-body">
          <strong>{names[post.platform]}{channel && ' · ' + channel}</strong>
          <small>{post.savedAt ? 'Добавлено ' + dates.format(Date.parse(post.savedAt)) : 'Дата добавления неизвестна'}</small>
          {post.publishAt && <YoutubeReleaseTime publishAt={post.publishAt} />}
          {!scheduled && status && <small>{status}</small>}
          {metricsText && <small>{metricsText}</small>}
        </div>
        {href && <a className="outline-button history-open" href={href} target="_blank" rel="noreferrer" aria-label={'Открыть публикацию ' + names[post.platform]}><ArrowUpRight size={17} /></a>}
      </li>
    })}</ul>}
    {!beat.isDemo && <form className="links-panel history-add" onSubmit={submit}>
      <h3>Добавить ссылку</h3>
      <Dropdown label="Площадка" value={platform} options={[{value:'telegram',label:'Telegram'},{value:'youtube',label:'YouTube'}]}
        disabled={saving} onChange={(next) => {setPlatform(next as StatsPlatform); setValue(''); setError('')}} />
      <label className="field"><span>Ссылка на публикацию</span><input type="url" value={value} disabled={saving}
        placeholder={platform === 'telegram' ? 'https://t.me/канал/123' : 'https://youtu.be/…'}
        onChange={(event) => {setValue(event.target.value); setError('')}} required /></label>
      {error && <p className="video-error" role="alert">{error}</p>}
      <button type="submit" className="outline-button" disabled={saving || !value.trim()}>{saving ? 'Сохраняем…' : 'Сохранить ссылку'}</button>
    </form>}
  </div>
}
