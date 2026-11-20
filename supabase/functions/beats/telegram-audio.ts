import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import bigInteger from 'npm:big-integer@1.6.52'
import { telegramAudioSource } from './telegram-import.ts'

const lifetime = 30 * 60
const chunkSize = 128 * 1024
const encoder = new TextEncoder()
const uuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'
export const audioBeatId = new RegExp('^' + uuid + '$', 'i')
const grantPattern = new RegExp('^(\\d{1,16})\\.(' + uuid + ')\\.(\\d{1,12})\\.([a-f0-9]{64})$', 'i')

function key() {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) throw new Error('Missing Telegram API configuration')
  return crypto.subtle.importKey('raw', encoder.encode('XEINTY Telegram audio v1:' + token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function issueTelegramAudioGrant(userId: number, beatId: string) {
  const payload = [userId, beatId.toLowerCase(), Math.floor(Date.now() / 1000) + lifetime].join('.')
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), encoder.encode(payload)))
  const signature = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return payload + '.' + signature
}

async function readGrant(grant: string | null) {
  const match = grantPattern.exec(grant ?? '')
  if (!match) return null
  const [, user, beatId, expires, signature] = match
  const userId = Number(user)
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(userId) || userId < 1 || Number(expires) <= now || Number(expires) > now + lifetime) return null
  const bytes = Uint8Array.from(signature.match(/../g)!, (value) => parseInt(value, 16))
  const payload = encoder.encode([user, beatId, expires].join('.'))
  return await crypto.subtle.verify('HMAC', await key(), bytes, payload) ? { userId, beatId } : null
}

export function audioByteRange(value: string | null, size: number) {
  if (value === null) return { start: 0, end: size - 1 }
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match || (!match[1] && !match[2])) return null
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  if (!Number.isSafeInteger(start) || start >= size || end < start) return null
  return { start, end }
}

export function audioChunks(chunks: AsyncIterable<Uint8Array>, skip: number, length: number) {
  async function* selected() {
    let left = length
    for await (const chunk of chunks) {
      if (chunk.length <= skip) { skip -= chunk.length; continue }
      const end = Math.min(chunk.length, skip + left)
      const part = chunk.subarray(skip, end)
      left -= part.length
      yield part
      if (!left) return
      skip = 0
    }
    if (left) throw new Error('Incomplete Telegram audio stream')
  }
  return ReadableStream.from(selected())
}

export async function streamTelegramAudio(request: Request, db: () => SupabaseClient, maxBytes: number, headers: Headers) {
  headers.set('cache-control', 'private, no-store, no-transform')
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'no-referrer')
  const access = await readGrant(new URL(request.url).searchParams.get('grant'))
  if (!access) return new Response(null, { status: 401, headers })
  const source = await telegramAudioSource(db(), access.userId, access.beatId, maxBytes)
  if ('data' in source) return new Response(null, { status: source.status ?? 502, headers })
  const range = request.headers.get('range')
  const { size, contentType, post, bot } = source
  const bounds = audioByteRange(range, size)
  headers.set('accept-ranges', 'bytes')
  if (!bounds) {
    headers.set('content-range', 'bytes */' + size)
    return new Response(null, { status: 416, headers })
  }
  const { start, end } = bounds
  const length = end - start + 1
  headers.set('content-length', String(length))
  headers.set('content-type', contentType)
  if (range !== null) headers.set('content-range', 'bytes ' + start + '-' + end + '/' + size)

  let body: ReadableStream<Uint8Array> | null = null
  if (request.method === 'GET') {
    const offset = Math.floor(start / chunkSize) * chunkSize
    const chunks = bot.iterDownload({ file: post.media, requestSize: chunkSize, offset: bigInteger(offset) })
    body = audioChunks(chunks, start - offset, length)
  }
  return new Response(body, { status: range === null ? 200 : 206, headers })
}
