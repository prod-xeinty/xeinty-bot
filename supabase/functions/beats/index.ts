// Deploy with verify_jwt = false: Telegram initData is verified below on every request.
import { createClient } from 'npm:@supabase/supabase-js@2'

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

function reply(data: unknown, status = 200, origin = allowedOrigin): Response {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type, apikey, authorization',
      'vary': 'Origin',
    },
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
  const origin = originFor(request)
  if (!origin) return new Response('Forbidden origin', { status: 403 })
  if (request.method === 'OPTIONS') return reply({}, 204, origin)
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405, origin)

  try {
    const body = await request.json()
    const userId = await telegramUserId(body.initData)
    if (!userId) return reply({ error: 'Открой XEINTY через Telegram заново' }, 401, origin)
    const db = client()
    const action = body.action

    if (action === 'list') {
      const { data, error } = await db.from('beats').select('*').eq('telegram_user_id', userId).order('created_at', { ascending: false }).limit(200)
      if (error) throw error
      const beats = await Promise.all((data ?? []).map(async (beat) => {
        const [audio, cover] = await Promise.all([
          beat.audio_path ? db.storage.from(bucket).createSignedUrl(beat.audio_path, 3600) : Promise.resolve({ data: null, error: null }),
          beat.cover_path ? db.storage.from(bucket).createSignedUrl(beat.cover_path, 3600) : Promise.resolve({ data: null, error: null }),
        ])
        return {
          id: beat.id, createdAt: Date.parse(beat.created_at), title: beat.title,
          bpm: beat.bpm, key: beat.musical_key, tags: beat.tags, status: beat.status,
          audioName: beat.audio_name, audioUrl: audio.data?.signedUrl,
          coverUrl: cover.data?.signedUrl,
          telegramCaption: beat.telegram_caption, youtubeDescription: beat.youtube_description,
          youtubeKeywords: beat.youtube_keywords, telegramLink: beat.telegram_link,
          youtubeLink: beat.youtube_link,
        }
      }))
      return reply({ beats }, 200, origin)
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
      if (audioInfo.error || !audioInfo.data || audioInfo.data.size < 1 || audioInfo.data.size > maxAudioSize) {
        return reply({ error: 'MP3 не загружен или слишком большой' }, 400, origin)
      }
      if (body.coverPath) {
        const coverInfo = await db.storage.from(bucket).info(body.coverPath)
        if (coverInfo.error || !coverInfo.data || coverInfo.data.size < 1 || coverInfo.data.size > maxCoverSize) {
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
      if (info.error || !info.data || info.data.size < 1 || info.data.size > maxCoverSize) return reply({ error: 'Обложка не загружена или слишком большая' }, 400, origin)
      const updated = await db.from('beats').update({ cover_path: body.path, updated_at: new Date().toISOString() }).eq('id', body.id).eq('telegram_user_id', userId)
      if (updated.error) throw updated.error
      if (owned.data.cover_path) await db.storage.from(bucket).remove([owned.data.cover_path])
      return reply({ ok: true }, 200, origin)
    }

    if (action === 'update') {
      const beat = input(body.beat)
      if (!beat || typeof body.id !== 'string') return reply({ error: 'Некорректные данные бита' }, 400, origin)
      const { data, error } = await db.from('beats').update(columns(beat)).eq('id', body.id).eq('telegram_user_id', userId).select('id').maybeSingle()
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
    console.error('XEINTY beats function failed', error)
    return reply({ error: 'Облако временно недоступно' }, 500, origin)
  }
})
