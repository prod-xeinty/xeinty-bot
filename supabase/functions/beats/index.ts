import { telegramPublication } from './telegram-attempts.ts'
import { telegramImportSuggestions, telegramWebhook } from './telegram-updates.ts'
// Deploy with verify_jwt = false: Requests use Telegram initData or an expiring audio grant.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { channelForReader, telegramChannelProfile, TelegramPublishError } from './telegram-publish.ts'

import { youtubeAction, youtubeCallback } from './youtube.ts'

const bucket = 'beat-previews'
const encoder = new TextEncoder()
const allowedOrigin = 'https://prod-xeinty.github.io'
const maxAudioSize = 15 * 1024 * 1024
const maxCoverSize = 2 * 1024 * 1024

type BeatInput = {
  title: string
  bpm: string
  key: string
  tags: string
  status: string
  telegramCaption: string
  youtubeDescription: string
  youtubeKeywords: string
  telegramLink: string
  youtubeLink: string
}

function responseHeaders(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, apikey, authorization, range',
    'vary': 'Origin',
  }
}

function reply(data: unknown, status = 200, origin = allowedOrigin): Response {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: { ...responseHeaders(origin), 'content-type': 'application/json; charset=utf-8' },
  })
}

function originFor(request: Request): string | null {
  const origin = request.headers.get('origin')
  if (!origin) return allowedOrigin
  if (origin === allowedOrigin) return origin
  try {
    const url = new URL(origin)
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return origin
  } catch { /* invalid origin */ }
  return null
}

async function telegramUserId(initData: unknown): Promise<number | null> {
  if (typeof initData !== 'string' || initData.length > 8192) return null
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is missing')
  const fields = new URLSearchParams(initData)
  if (fields.getAll('hash').length !== 1) return null
  const hash = fields.get('hash')!
  if (!/^[a-f0-9]{64}$/i.test(hash)) return null
  const authDate = Number(fields.get('auth_date'))
  if (!Number.isSafeInteger(authDate)) return null
  const age = Math.floor(Date.now() / 1000) - authDate
  if (age < -60 || age > 24 * 60 * 60) return null

  const checkString = [...fields.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  const firstKey = await crypto.subtle.importKey('raw', encoder.encode('WebAppData'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const secret = await crypto.subtle.sign('HMAC', firstKey, encoder.encode(token))
  const secondKey = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const calculated = new Uint8Array(await crypto.subtle.sign('HMAC', secondKey, encoder.encode(checkString)))
  const provided = Uint8Array.from(hash.match(/.{2}/g)!, (part) => parseInt(part, 16))
  let difference = 0
  for (let i = 0; i < calculated.length; i++) difference |= calculated[i] ^ provided[i]
  if (difference !== 0) return null

  try {
    const user = JSON.parse(fields.get('user') ?? '')
    return Number.isSafeInteger(user.id) && user.id > 0 ? user.id : null
  } catch { return null }
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null
}

function input(value: unknown): BeatInput | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const fields = {
    title: text(source.title, 120),
    bpm: text(source.bpm, 20),
    key: text(source.key, 40),
    tags: text(source.tags, 500),
    status: text(source.status, 40),
    telegramCaption: text(source.telegramCaption, 4000),
    youtubeDescription: text(source.youtubeDescription, 5000),
    youtubeKeywords: text(source.youtubeKeywords, 1000),
    telegramLink: text(source.telegramLink, 500),
    youtubeLink: text(source.youtubeLink, 500),
  }
  if (Object.values(fields).some((item) => item === null) || !fields.title?.trim()) return null
  return fields as BeatInput
}

function columns(beat: BeatInput) {
  return {
    title: beat.title.trim(), bpm: beat.bpm, musical_key: beat.key, tags: beat.tags,
    status: beat.status, telegram_caption: beat.telegramCaption,
    youtube_description: beat.youtubeDescription, youtube_keywords: beat.youtubeKeywords,
    telegram_link: beat.telegramLink, youtube_link: beat.youtubeLink,
    updated_at: new Date().toISOString(),
  }
}

function client() {
  const url = Deno.env.get('SUPABASE_URL')
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS')
  const secret = legacy ?? (keys ? JSON.parse(keys).default : undefined)
  if (!url || !secret) throw new Error('Supabase server credentials are missing')
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } })
}

Deno.serve(async (request) => {
  const pathname = new URL(request.url).pathname
  if (pathname.endsWith('/beats/telegram-webhook')) return telegramWebhook(request, client)
  if (request.method === 'GET' && pathname.endsWith('/beats/youtube/callback')) {
    return youtubeCallback(client(), request)
  }
  const origin = originFor(request)
  if (!origin) return new Response('Forbidden origin', { status: 403 })
  if (request.method === 'OPTIONS') return reply({}, 204, origin)
  try {
    if ((request.method === 'GET' || request.method === 'HEAD') && pathname.endsWith('/beats/telegram-audio')) {
      const { streamTelegramAudio } = await import('./telegram-audio.ts')
      return await streamTelegramAudio(request, client, maxAudioSize, new Headers(responseHeaders(origin)))
    }
    if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405, origin)

    const body = await request.json()
    const userId = await telegramUserId(body.initData)
    if (!userId) return reply({ error: 'Открой XEINTY через Telegram заново' }, 401, origin)
    const db = client()
    const action = body.action
    if ((action === 'youtube-stats' || action === 'telegram-stats') && body.beatId != null &&
        (typeof body.beatId !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(body.beatId))) {
      return reply({ error: 'Некорректный ID бита.' }, 400, origin)
    }
    if (typeof action === 'string' && action.startsWith('youtube-')) {
      const result = await youtubeAction(db, userId, body)
      return reply(result.data, result.status ?? 200, origin)
    }

    if (action === 'list') {
      const pageSize = 200
      const cursor = body.cursor
      if (cursor != null && (typeof cursor !== 'object' || typeof cursor.createdAt !== 'string' ||
          !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(cursor.createdAt) ||
          typeof cursor.id !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(cursor.id))) {
        return reply({ error: 'Обнови библиотеку и попробуй ещё раз.' }, 400, origin)
      }
      let query = db.from('beats').select('*,beat_publications(platform,url,saved_at,publish_at)').eq('telegram_user_id', userId)
      if (cursor) query = query.or('created_at.lt.' + cursor.createdAt + ',and(created_at.eq.' + cursor.createdAt + ',id.lt.' + cursor.id + ')')
      const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize + 1)
      if (error) throw error
      const page = (data ?? []).slice(0, pageSize)
      const beats = await Promise.all(page.map(async (beat) => {
        const [audio, cover] = await Promise.all([
          beat.audio_path ? db.storage.from(bucket).createSignedUrl(beat.audio_path, 3600) : Promise.resolve({ data: null, error: null }),
          beat.cover_path ? db.storage.from(bucket).createSignedUrl(beat.cover_path, 3600) : Promise.resolve({ data: null, error: null }),
        ])
        return {
          id: beat.id, createdAt: Date.parse(beat.created_at), title: beat.title,
          bpm: beat.bpm, key: beat.musical_key, tags: beat.tags, status: beat.status,
          audioName: beat.audio_name, audioUrl: audio.data?.signedUrl,
          coverUrl: cover.data?.signedUrl, telegramSourceUrl: beat.telegram_source_url, telegramSourceDate: beat.telegram_source_date,
          telegramCaption: beat.telegram_caption, youtubeDescription: beat.youtube_description,
          youtubeKeywords: beat.youtube_keywords, telegramLink: beat.telegram_link,
          youtubeLink: beat.youtube_link, youtubePublishAt: beat.youtube_publish_at,
          publications: beat.beat_publications.map((post: { platform: string; url: string; saved_at: string | null; publish_at: string | null }) => ({
            platform: post.platform, url: post.url, savedAt: post.saved_at, publishAt: post.publish_at,
          })),
        }
      }))
      const last = data && data.length > pageSize ? page.at(-1) : undefined
      return reply({ beats, next: last ? { id: last.id, createdAt: last.created_at } : null }, 200, origin)
    }

    if (action === 'telegram-import-suggestions') return reply(await telegramImportSuggestions(db, userId), 200, origin)

    if (action === 'telegram-audio-grant') {
      const { audioBeatId, issueTelegramAudioGrant } = await import('./telegram-audio.ts')
      if (typeof body.beatId !== 'string' || !audioBeatId.test(body.beatId)) {
        return reply({ error: 'Некорректный ID записи.' }, 400, origin)
      }
      const response = reply({ grant: await issueTelegramAudioGrant(userId, body.beatId) }, 200, origin)
      response.headers.set('cache-control', 'private, no-store')
      return response
    }

    if (action === 'telegram-import-file') {
      const { beatId, kind } = body
      if (typeof beatId !== 'string' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(beatId) ||
        (kind !== 'audio' && kind !== 'cover')) {
        return reply({ error: 'Некорректный запрос файла.' }, 400, origin)
      }
      const { telegramImportFile } = await import('./telegram-import.ts')
      const file = await telegramImportFile(db, userId, beatId, kind, kind === 'audio' ? maxAudioSize : maxCoverSize)
      if ('data' in file) return reply(file.data, file.status ?? 502, origin)
      return new Response(file.bytes.buffer, { headers: {
        ...responseHeaders(origin),
        'content-type': file.contentType,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      } })
    }

    if (action === 'telegram-import-preview' || action === 'telegram-import-save') {
      const { telegramImport } = await import('./telegram-import.ts')
      const result = await telegramImport(db, userId, body)
      return reply(result.data, result.status ?? 200, origin)
    }

    if (action === 'telegram-stats') {
      try {
        const { telegramStats } = await import('./telegram-stats.ts')
        return reply(await telegramStats(db, userId, body.beatId ?? undefined), 200, origin)
      } catch {
        return reply({ error: 'Не удалось получить статистику Telegram. Попробуй обновить позже.' }, 502, origin)
      }
    }

    if (action === 'telegram-channel-profile') {
      if (typeof body.channel !== 'string' || !/^-100[0-9]{5,16}$/.test(body.channel)) {
        return reply({ error: 'Некорректный канал' }, 400, origin)
      }
      const { data, error } = await db.from('telegram_channels').select('chat_id')
        .eq('telegram_user_id', userId).eq('chat_id', body.channel).maybeSingle()
      if (error) throw error
      if (!data) return reply({ error: 'Канал не подключён' }, 404, origin)
      return reply(await telegramChannelProfile(body.channel, userId), 200, origin)
    }

    if (action === 'list-telegram-channels') {
      const { data, error } = await db.from('telegram_channels').select('chat_id,title,username')
        .eq('telegram_user_id', userId).order('title')
      if (error) throw error
      return reply({ channels: data.map((chat) => ({ id: String(chat.chat_id), title: chat.title, username: chat.username })) }, 200, origin)
    }

    if (action === 'connect-telegram-channel' || action === 'disconnect-telegram-channel') {
      const address = text(body.channel, 40)?.trim()
      if (!address || !/^(@[a-z0-9_]{5,32}|-100[0-9]{5,16})$/i.test(address)) {
        return reply({ error: 'Укажи @имя канала или его ID, начинающийся с -100' }, 400, origin)
      }
      if (action === 'disconnect-telegram-channel') {
        if (!address.startsWith('-100')) return reply({ error: 'Нужен ID канала' }, 400, origin)
        const { error } = await db.from('telegram_channels').delete()
          .eq('telegram_user_id', userId).eq('chat_id', address)
        if (error) throw error
        return reply({ ok: true }, 200, origin)
      }
      const chat = await channelForReader(address, userId)
      const { error } = await db.from('telegram_channels').upsert({
        telegram_user_id: userId, chat_id: chat.id, title: chat.title || chat.username || String(chat.id),
        username: chat.username ?? null,
      })
      if (error) throw error
      return reply({ channel: { id: String(chat.id), title: chat.title || chat.username || String(chat.id), username: chat.username ?? null } }, 200, origin)
    }

    if (action === 'publish-telegram' || (typeof action === 'string' && action.startsWith('telegram-publication-'))) {
      const result = await telegramPublication(db, userId, body, bucket)
      return reply(result.data, result.status ?? 200, origin)
    }

    if (action === 'prepare') {
      if (typeof body.audioName !== 'string' || !/\.mp3$/i.test(body.audioName) ||
          !Number.isInteger(body.audioSize) || body.audioSize < 1 || body.audioSize > maxAudioSize) {
        return reply({ error: 'Нужен MP3 размером до 15 МБ' }, 400, origin)
      }
      const coverTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
      if (body.coverType && (!coverTypes[body.coverType] || !Number.isInteger(body.coverSize) || body.coverSize < 1 || body.coverSize > maxCoverSize)) {
        return reply({ error: 'Обложка должна быть JPG, PNG или WEBP до 2 МБ' }, 400, origin)
      }
      const id = crypto.randomUUID()
      const audioPath = `${userId}/${id}/preview.mp3`
      const coverPath = body.coverType ? `${userId}/${id}/cover.${coverTypes[body.coverType]}` : null
      const audio = await db.storage.from(bucket).createSignedUploadUrl(audioPath)
      if (audio.error) throw audio.error
      const cover = coverPath ? await db.storage.from(bucket).createSignedUploadUrl(coverPath) : null
      if (cover?.error) throw cover.error
      return reply({ id, audioPath, audioToken: audio.data.token, coverPath, coverToken: cover?.data?.token }, 200, origin)
    }

    if (action === 'create') {
      const beat = input(body.beat)
      if (!beat || typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id) ||
          body.audioPath !== `${userId}/${body.id}/preview.mp3` ||
          (body.coverPath !== null && body.coverPath !== undefined && !new RegExp(`^${userId}/${body.id}/cover\\.(jpg|png|webp)$`).test(body.coverPath))) {
        return reply({ error: 'Некорректные данные бита' }, 400, origin)
      }
      const audioInfo = await db.storage.from(bucket).info(body.audioPath)
      if (audioInfo.error || typeof audioInfo.data?.size !== 'number' || audioInfo.data.size < 1 || audioInfo.data.size > maxAudioSize) {
        return reply({ error: 'MP3 не загружен или слишком большой' }, 400, origin)
      }
      if (body.coverPath) {
        const coverInfo = await db.storage.from(bucket).info(body.coverPath)
        if (coverInfo.error || typeof coverInfo.data?.size !== 'number' || coverInfo.data.size < 1 || coverInfo.data.size > maxCoverSize) {
          return reply({ error: 'Обложка не загружена или слишком большая' }, 400, origin)
        }
      }
      const row = {
        id: body.id, telegram_user_id: userId, ...columns(beat),
        audio_name: text(body.audioName, 255), audio_path: body.audioPath,
        audio_size: audioInfo.data.size, cover_path: body.coverPath ?? null,
      }
      const { error } = await db.from('beats').insert(row)
      if (error) throw error
      return reply({ id: body.id }, 201, origin)
    }

    if (action === 'prepare-cover' || action === 'commit-cover') {
      const owned = await db.from('beats').select('id,cover_path').eq('id', body.id).eq('telegram_user_id', userId).maybeSingle()
      if (owned.error) throw owned.error
      if (!owned.data) return reply({ error: 'Бит не найден' }, 404, origin)
      if (action === 'prepare-cover') {
        const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
        if (!extensions[body.type] || !Number.isInteger(body.size) || body.size < 1 || body.size > maxCoverSize) return reply({ error: 'Нужна обложка JPG, PNG или WEBP до 2 МБ' }, 400, origin)
        const path = `${userId}/${owned.data.id}/cover-${crypto.randomUUID()}.${extensions[body.type]}`
        const upload = await db.storage.from(bucket).createSignedUploadUrl(path)
        if (upload.error) throw upload.error
        return reply({ path, token: upload.data.token }, 200, origin)
      }
      if (typeof body.path !== 'string' || !body.path.startsWith(`${userId}/${owned.data.id}/cover-`) || !/^\d+\/[0-9a-f-]+\/cover-[0-9a-f-]+\.(jpg|png|webp)$/.test(body.path)) return reply({ error: 'Некорректный путь обложки' }, 400, origin)
      const info = await db.storage.from(bucket).info(body.path)
      if (info.error || typeof info.data?.size !== 'number' || info.data.size < 1 || info.data.size > maxCoverSize) return reply({ error: 'Обложка не загружена или слишком большая' }, 400, origin)
      const updated = await db.from('beats').update({ cover_path: body.path, updated_at: new Date().toISOString() }).eq('id', body.id).eq('telegram_user_id', userId)
      if (updated.error) throw updated.error
      if (owned.data.cover_path) await db.storage.from(bucket).remove([owned.data.cover_path])
      return reply({ ok: true }, 200, origin)
    }

    if (action === 'update') {
      const beat = input(body.beat)
      if (!beat || typeof body.id !== 'string') return reply({ error: 'Некорректные данные бита' }, 400, origin)
      const { telegram_link, youtube_link, ...metadata } = columns(beat)
      const links = body.publicationLinks
      const { data, error } = await db.from('beats').update({
        ...metadata,
        ...(typeof links?.telegramLink === 'string' ? { telegram_link } : {}),
        ...(typeof links?.youtubeLink === 'string' ? { youtube_link, youtube_publish_at: null } : {}),
      }).eq('id', body.id).eq('telegram_user_id', userId).select('id').maybeSingle()
      if (error) throw error
      return data ? reply({ ok: true }, 200, origin) : reply({ error: 'Бит не найден' }, 404, origin)
    }

    if (action === 'delete') {
      if (typeof body.id !== 'string') return reply({ error: 'Некорректный ID' }, 400, origin)
      const { data, error } = await db.from('beats').select('audio_path,cover_path').eq('id', body.id).eq('telegram_user_id', userId).maybeSingle()
      if (error) throw error
      if (!data) return reply({ error: 'Бит не найден' }, 404, origin)
      const paths = [data.audio_path, data.cover_path].filter((path): path is string => Boolean(path))
      if (paths.length) {
        const removed = await db.storage.from(bucket).remove(paths)
        if (removed.error) throw removed.error
      }
      const deleted = await db.from('beats').delete().eq('id', body.id).eq('telegram_user_id', userId)
      if (deleted.error) throw deleted.error
      return reply({ ok: true }, 200, origin)
    }

    return reply({ error: 'Неизвестное действие' }, 400, origin)
  } catch (error) {
    if (error instanceof TelegramPublishError) return reply({ error: error.message }, 400, origin)
    console.error('XEINTY beats function failed', error)
    return reply({ error: 'Облако временно недоступно' }, 500, origin)
  }
})
