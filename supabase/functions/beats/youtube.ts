import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { dailyViews, publicationLinks } from './publication-history.ts'

const scope = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'
const chunkSize = 2 * 1024 * 1024
const maxVideoSize = 256 * 1024 * 1024 * 1024
const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

class YoutubeError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

function config() {
  const clientId = Deno.env.get('YOUTUBE_CLIENT_ID')
  const clientSecret = Deno.env.get('YOUTUBE_CLIENT_SECRET')
  const key = Deno.env.get('YOUTUBE_TOKEN_KEY')
  const projectUrl = Deno.env.get('SUPABASE_URL')
  if (!clientId || !clientSecret || !key || key.length < 32 || !projectUrl) return
  return { clientId, clientSecret, key, redirect: projectUrl.replace(/\/$/, '') + '/functions/v1/beats/youtube/callback' }
}

async function tokenKey(secret: string, owner: number) {
  const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret + ':' + owner))
  return crypto.subtle.importKey('raw', material, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function encrypt(value: string, key: string, owner: number) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv },
    await tokenKey(key, owner), new TextEncoder().encode(value)))
  return btoa(String.fromCharCode(...iv, ...encrypted))
}

async function decrypt(value: string, key: string, owner: number) {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
  return new TextDecoder().decode(await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: bytes.subarray(0, 12),
  }, await tokenKey(key, owner), bytes.subarray(12)))
}

async function token(cfg: NonNullable<ReturnType<typeof config>>, grant: Record<string, string>) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...grant }),
    signal: AbortSignal.timeout(15_000),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || typeof result?.access_token !== 'string') {
    throw new YoutubeError('Не удалось авторизовать YouTube. Попробуй подключить аккаунт заново.')
  }
  return result as { access_token: string; refresh_token?: string; expires_in?: number }
}

function callbackPage(message: string, status = 200) {
  return new Response(message, {
    status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
  })
}

export async function youtubeCallback(db: SupabaseClient, request: Request) {
  const cfg = config()
  if (!cfg) return callbackPage('Подключение YouTube ещё не настроено.', 503)
  const params = new URL(request.url).searchParams
  const state = params.get('state')
  const code = params.get('code')
  if (!state || !uuid.test(state) || !code) return callbackPage('Подключение отменено. Вернись в XEINTY.', 400)
  try {
    const { data, error } = await db.from('youtube_oauth_states').delete().eq('state', state)
      .gt('expires_at', new Date().toISOString()).select('telegram_user_id').maybeSingle()
    if (error || !data) return callbackPage('Ссылка устарела. Запусти подключение заново в XEINTY.', 400)
    const userId = Number(data.telegram_user_id)
    const credentials = await token(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.redirect })
    if (!credentials.refresh_token) return callbackPage('Google не выдал доступ для загрузок. Подключи аккаунт заново.', 400)
    const saved = await db.from('youtube_connections').upsert({
      telegram_user_id: userId, refresh_token: await encrypt(credentials.refresh_token, cfg.key, userId),
    })
    if (saved.error) throw saved.error
    return callbackPage('YouTube подключён. Вернись в XEINTY и нажми «Проверить подключение».')
  } catch {
    return callbackPage('Не удалось подключить YouTube. Вернись в XEINTY и попробуй ещё раз.', 400)
  }
}

type Result = { data: object; status?: number }
type Upload = { id: string; beat_id: string; session_url: string; access_token: string; file_size: number; mime_type: string; video_id: string | null; publish_at: string | null }

function uploadUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || !['www.googleapis.com', 'youtube.googleapis.com'].includes(url.hostname) ||
      url.username || url.password || url.port || url.pathname !== '/upload/youtube/v3/videos') {
    throw new YoutubeError('YouTube вернул неподдерживаемый адрес загрузки.', 502)
  }
  return url
}

async function accessToken(db: SupabaseClient, userId: number, cfg: NonNullable<ReturnType<typeof config>>) {
  const { data, error } = await db.from('youtube_connections').select('refresh_token').eq('telegram_user_id', userId).maybeSingle()
  if (error) throw error
  if (!data) throw new YoutubeError('Сначала подключи YouTube.')
  const refreshToken = await decrypt(data.refresh_token, cfg.key, userId)
  return (await token(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken })).access_token
}

function linkedVideoId(link: string): string | null {
  let url: URL
  try { url = new URL(link) } catch { return null }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null
  const path = url.pathname.split('/').filter(Boolean)
  const host = url.hostname.replace(/^www\./, '')
  let id: string | null = null
  if (host === 'youtu.be' && path.length === 1) id = path[0]
  if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    if (path.length === 1 && path[0] === 'watch') id = url.searchParams.get('v')
    if (path.length === 2 && ['shorts', 'live', 'embed'].includes(path[0])) id = path[1]
  }
  return id && videoIdPattern.test(id) ? id : null
}

async function youtubeStats(db: SupabaseClient, userId: number, cfg: NonNullable<ReturnType<typeof config>>): Promise<Result> {
  const rows = (await publicationLinks(db, userId, 'youtube')).map((row) => ({ ...row, videoId: linkedVideoId(row.link) }))
  const ids = [...new Set(rows.flatMap((row) => row.videoId ? [row.videoId] : []))]
  const metrics = new Map<string, { views: number | null; likes: number | null; comments: number | null; channel?: string; visibility?: string }>()
  if (ids.length) {
    const access = await accessToken(db, userId, cfg)
    const batches = Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) => ids.slice(index * 50, index * 50 + 50))
    await Promise.all(batches.map(async (batch) => {
      const params = new URLSearchParams({ part: 'statistics,snippet,status', id: batch.join(','), fields: 'items(id,snippet(channelTitle),status(privacyStatus),statistics(viewCount,likeCount,commentCount))' })
      const response = await fetch('https://www.googleapis.com/youtube/v3/videos?' + params, {
        headers: { Authorization: 'Bearer ' + access }, signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) {
        const failure = await response.json().catch(() => null)
        const insufficient = failure?.error?.errors?.some((item: { reason?: string }) => item.reason === 'insufficientPermissions') ||
          failure?.error?.details?.some((item: { reason?: string }) => item.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')
        if (response.status === 403 && insufficient) throw new YoutubeError('Обнови доступ к YouTube во вкладке «Каналы».', 403)
        throw new YoutubeError('Не удалось получить просмотры с YouTube. Попробуй обновить позже.', 502)
      }
      const parsed: { items?: { id: string; snippet?: { channelTitle?: string }; status?: { privacyStatus?: string }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] } = await response.json()
      for (const video of parsed.items ?? []) {
        const count = (value?: string) => value !== undefined && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null
        metrics.set(video.id, { views: count(video.statistics?.viewCount), likes: count(video.statistics?.likeCount), comments: count(video.statistics?.commentCount), channel: video.snippet?.channelTitle, visibility: video.status?.privacyStatus })
      }
    }))
  }
  const values = [...metrics.values()]
  const sum = (key: 'views' | 'likes' | 'comments') => {
    const counts = values.flatMap((entry) => entry[key] === null ? [] : [entry[key]])
    return counts.length ? counts.reduce((total, count) => total + count, 0) : null
  }
  const data = {
    entries: rows.map(({ beatId, link, videoId }) => ({ beatId, link, mediaKey: videoId, views: null, ...metrics.get(videoId ?? '') })),
    totalViews: sum('views') ?? 0,
    totals: { views: sum('views'), likes: sum('likes'), comments: sum('comments') },
    videosWithViews: values.filter((entry) => entry.views !== null).length,
    linkedVideos: ids.length,
    fetchedAt: new Date().toISOString(),
  }
  const series = await dailyViews(db, userId, 'youtube', data).catch(() => null)
  return { data: { ...data, series } }
}

async function finishUpload(db: SupabaseClient, userId: number, upload: Upload, videoId: string): Promise<Result> {
  if (!videoIdPattern.test(videoId)) throw new YoutubeError('YouTube не вернул ID видео.', 502)
  const recorded = await db.from('youtube_uploads').update({ video_id: videoId })
    .eq('id', upload.id).eq('telegram_user_id', userId)
  if (recorded.error) throw recorded.error
  const url = 'https://youtu.be/' + videoId
  const publishAt = upload.publish_at
  const saved = await db.from('beats').update({ youtube_link: url, youtube_publish_at: publishAt, updated_at: new Date().toISOString() })
    .eq('id', upload.beat_id).eq('telegram_user_id', userId).select('id').maybeSingle()
  if (saved.error || !saved.data) return { data: { url, publishAt, saved: false } }
  return { data: { url, publishAt, saved: true } }
}

export async function youtubeAction(db: SupabaseClient, userId: number, body: Record<string, unknown>): Promise<Result> {
  const cfg = config()
  const action = body.action
  if (action === 'youtube-status') {
    if (!cfg) return { data: { configured: false, connected: false } }
    const { data, error } = await db.from('youtube_connections').select('telegram_user_id').eq('telegram_user_id', userId).maybeSingle()
    if (error) throw error
    return { data: { configured: true, connected: Boolean(data) } }
  }
  if (!cfg) return { data: { error: 'Подключение YouTube ещё не настроено.' }, status: 503 }
  try {
    if (action === 'youtube-stats') return await youtubeStats(db, userId, cfg)

    if (action === 'youtube-profile') {
      const access = await accessToken(db, userId, cfg)
      const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
        headers: { Authorization: 'Bearer ' + access }, signal: AbortSignal.timeout(10_000),
      })
      if (response.status === 403) {
        const denied = await response.json().catch(() => null)
        if (denied?.error?.errors?.some((entry: { reason?: string }) => entry.reason === 'insufficientPermissions') ||
            denied?.error?.details?.some((entry: { reason?: string }) => entry.reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT')) {
          return { data: { needsAccess: true } }
        }
      }
      if (!response.ok) throw new YoutubeError('Не удалось получить данные канала YouTube.', 502)
      const channel = (await response.json()).items?.[0]
      if (!channel) return { data: { needsAccess: false } }
      const count = channel.statistics?.subscriberCount
      return { data: {
        title: channel.snippet?.title,
        username: channel.snippet?.customUrl,
        avatar: channel.snippet?.thumbnails?.default?.url,
        subscribers: !channel.statistics?.hiddenSubscriberCount && /^\d+$/.test(count ?? '') ? Number(count) : null,
      } }
    }

    if (action === 'youtube-connect') {
      const state = crypto.randomUUID()
      const { error } = await db.from('youtube_oauth_states').upsert({
        telegram_user_id: userId, state, expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      })
      if (error) throw error
      const link = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      link.search = new URLSearchParams({
        client_id: cfg.clientId, redirect_uri: cfg.redirect, response_type: 'code',
        scope, state, access_type: 'offline', prompt: 'consent select_account',
      }).toString()
      return { data: { url: link.href } }
    }

    if (action === 'youtube-disconnect') {
      for (const table of ['youtube_oauth_states', 'youtube_uploads', 'youtube_connections']) {
        const { error } = await db.from(table).delete().eq('telegram_user_id', userId)
        if (error) throw error
      }
      return { data: { connected: false } }
    }

    if (typeof body.uploadId !== 'string' || !uuid.test(body.uploadId)) throw new YoutubeError('Некорректная сессия загрузки.')
    const existing = await db.from('youtube_uploads').select('*')
      .eq('id', body.uploadId).eq('telegram_user_id', userId).maybeSingle()
    if (existing.error) throw existing.error
    const upload = existing.data as (Upload & { expires_at: string }) | null
    if (upload && !upload.video_id && Date.parse(upload.expires_at) <= Date.now()) {
      throw new YoutubeError('Сессия YouTube истекла. Начни новую загрузку.', 410)
    }

    if (action === 'youtube-start') {
      if (upload) return { data: { ready: true } }
      const { beatId, size, mimeType, madeForKids } = body
      // Older clients only offer a private upload.
      const visibility = body.visibility === undefined ? 'private' : body.visibility
      if (visibility !== 'public' && visibility !== 'unlisted' && visibility !== 'private') {
        throw new YoutubeError('Выбери видимость видео.')
      }
      let publishAt: string | null = null
      if (body.publishAt !== undefined) {
        const time = typeof body.publishAt === 'string' ? Date.parse(body.publishAt) : NaN
        if (visibility !== 'public' || !Number.isFinite(time) || time <= Date.now()) {
          throw new YoutubeError('Для запланированного выхода укажи дату и время в будущем.')
        }
        publishAt = new Date(time).toISOString()
      }
      if (typeof beatId !== 'string' || !uuid.test(beatId) || typeof size !== 'number' || !Number.isSafeInteger(size) || size < 1 ||
          size > maxVideoSize || typeof mimeType !== 'string' || !/^(video\/[\w.+-]+|application\/octet-stream)$/.test(mimeType) ||
          typeof madeForKids !== 'boolean') throw new YoutubeError('Проверь файл и выбери аудиторию видео.')
      const { data: beat, error } = await db.from('beats').select('title,youtube_description,youtube_keywords,youtube_link')
        .eq('id', beatId).eq('telegram_user_id', userId).maybeSingle()
      if (error) throw error
      if (!beat) throw new YoutubeError('Для загрузки выбери бит из облачной библиотеки.', 404)
      if (beat.youtube_link?.trim() && body.republish !== true) {
        throw new YoutubeError('Бит уже загружен на YouTube. Подтверди «Опубликовать заново».', 409)
      }
      if (!beat.title.trim() || beat.title.length > 100 || /[<>]/.test(beat.title) ||
          new TextEncoder().encode(beat.youtube_description).length > 5000 || /[<>]/.test(beat.youtube_description)) {
        throw new YoutubeError('YouTube принимает заголовок до 100 символов и описание до 5000 байт без знаков < и >.')
      }
      const tags = beat.youtube_keywords.split(',').map((tag: string) => tag.trim()).filter(Boolean)
      if (tags.join(',').length + tags.filter((tag: string) => tag.includes(' ')).length * 2 > 500) {
        throw new YoutubeError('Сократи ключевые слова YouTube до 500 символов.')
      }
      const access = await accessToken(db, userId, cfg)
      const started = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': mimeType },
        body: JSON.stringify({
          snippet: { title: beat.title, description: beat.youtube_description, tags, categoryId: '10' },
          status: {
            privacyStatus: publishAt ? 'private' : visibility,
            ...(publishAt ? { publishAt } : {}),
            selfDeclaredMadeForKids: madeForKids,
          },
        }),
        signal: AbortSignal.timeout(25_000),
      })
      const location = started.headers.get('Location')
      if (!started.ok || !location) {
        throw new YoutubeError('YouTube не начал загрузку. Проверь доступ к каналу, данные ролика и квоту API.', 502)
      }
      const inserted = await db.from('youtube_uploads').insert({
        id: body.uploadId, telegram_user_id: userId, beat_id: beatId, session_url: uploadUrl(location).href,
        access_token: await encrypt(access, cfg.key, userId), expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        file_size: size, mime_type: mimeType, publish_at: publishAt,
      })
      if (inserted.error) throw inserted.error
      return { data: { ready: true } }
    }

    if (action !== 'youtube-chunk' && action !== 'youtube-resume') throw new YoutubeError('Неизвестное действие.')
    if (!upload) throw new YoutubeError('Сессия загрузки не найдена. Выбери файл заново.', 404)
    if (upload.video_id) return finishUpload(db, userId, upload, upload.video_id)
    const size = Number(upload.file_size)
    let range = 'bytes */' + size
    let bytes: Uint8Array<ArrayBuffer> | undefined
    if (action === 'youtube-chunk') {
      const { offset, chunk } = body
      if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0 || offset >= size ||
          typeof chunk !== 'string' || chunk.length > Math.ceil(chunkSize / 3) * 4) throw new YoutubeError('Некорректный фрагмент видео.')
      try { bytes = Uint8Array.from(atob(chunk), (char) => char.charCodeAt(0)) }
      catch { throw new YoutubeError('Некорректный фрагмент видео.') }
      if (bytes.length !== Math.min(chunkSize, size - offset)) throw new YoutubeError('Неполный фрагмент видео.')
      range = 'bytes ' + offset + '-' + (offset + bytes.length - 1) + '/' + size
    }
    const send = (access: string) => fetch(uploadUrl(upload.session_url), {
      method: 'PUT', redirect: 'manual',
      headers: { Authorization: 'Bearer ' + access, 'Content-Type': upload.mime_type, 'Content-Range': range },
      body: bytes ?? new Uint8Array(0), signal: AbortSignal.timeout(45_000),
    })
    let response = await send(await decrypt(upload.access_token, cfg.key, userId))
    if (response.status === 401) {
      const access = await accessToken(db, userId, cfg)
      const updated = await db.from('youtube_uploads').update({ access_token: await encrypt(access, cfg.key, userId) })
        .eq('id', upload.id).eq('telegram_user_id', userId)
      if (updated.error) throw updated.error
      response = await send(access)
    }
    if (response.status === 308) {
      const last = Number(/^bytes=0-(\d+)$/.exec(response.headers.get('Range') ?? '')?.[1] ?? -1)
      return { data: { next: last + 1 } }
    }
    if (response.ok) {
      const video = await response.json()
      return finishUpload(db, userId, upload, video.id)
    }
    if (response.status === 404 || response.status === 410) {
      throw new YoutubeError('Сессия YouTube истекла. Выбери видео заново.', 410)
    }
    throw new YoutubeError('YouTube не принял фрагмент. Можно продолжить загрузку.', 502)
  } catch (error) {
    if (error instanceof YoutubeError) return { data: { error: error.message }, status: error.status }
    return { data: { error: 'Связь с YouTube прервалась. Проверь статус и продолжи загрузку.' }, status: 502 }
  }
}
