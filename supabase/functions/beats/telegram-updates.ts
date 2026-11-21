import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const secretHeader = 'x-telegram-bot-api-secret-token'
const maxMessageId = 2_147_483_647

type TelegramChannelPost = {
  chat?: { id?: unknown; type?: unknown }
  message_id?: unknown
  date?: unknown
  audio?: { file_name?: unknown }
  document?: { mime_type?: unknown; file_name?: unknown }
}

function audioChannelPost(update: unknown) {
  if (!update || typeof update !== 'object') return null
  const post = (update as { channel_post?: TelegramChannelPost }).channel_post
  if (!post || post.chat?.type !== 'channel') return null
  const { id } = post.chat
  const { message_id: messageId, date, audio, document } = post
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id >= -1_000_000_000_000 ||
      typeof messageId !== 'number' || !Number.isSafeInteger(messageId) || messageId < 1 || messageId > maxMessageId ||
      typeof date !== 'number' || !Number.isSafeInteger(date) || date < 1 || date > 4_294_967_295) return null

  const media = audio ?? document
  if (!media || typeof media !== 'object') return null
  const filename = typeof media.file_name === 'string' ? media.file_name.trim() : ''
  const documentIsAudio = (typeof document?.mime_type === 'string' && /^audio\//i.test(document.mime_type)) ||
    /\.(mp3|wav|flac|m4a|ogg|aac|aiff?|opus)$/i.test(filename)
  if (!audio && !documentIsAudio) return null

  return {
    p_chat_id: String(id),
    p_message_id: messageId,
    p_published_at: new Date(date * 1000).toISOString(),
    p_audio_name: Array.from(filename.replaceAll('\0', '')).slice(0, 255).join('') || null,
  }
}

function validWebhookSecret(provided: string, expected: string) {
  if (provided.length !== expected.length) return false
  let mismatch = 0
  for (let index = 0; index < expected.length; index++) mismatch |= provided.charCodeAt(index) ^ expected.charCodeAt(index)
  return mismatch === 0
}

export async function telegramWebhook(request: Request, client: () => SupabaseClient) {
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (request.method !== 'POST' || !secret || !validWebhookSecret(request.headers.get(secretHeader) ?? '', secret)) {
    return new Response(null, { status: 404 })
  }

  try {
    const update = await request.json().catch(() => null)
    const post = audioChannelPost(update)
    if (post) {
      const { error } = await client().rpc('record_telegram_audio_update', post)
      if (error) return new Response(null, { status: 503 })
    }
    if (update?.message?.chat?.type === 'private') {
      const { processLoopInboxUpdate } = await import('./loop-inbox.ts')
      await processLoopInboxUpdate(client(), update)
    }
    return new Response(null, { status: 204 })
  } catch {
    return new Response(null, { status: 503 })
  }
}

type PendingRange = { channel: string; first_id: number; last_id: number; count: number }

export async function telegramImportSuggestions(db: SupabaseClient, userId: number) {
  const { data, error } = await db.rpc('pending_telegram_audio', { p_owner: userId })
  if (error) throw error
  const suggestions = ((data ?? []) as PendingRange[]).map(({ channel, first_id, last_id, count }) => {
    const internal = String(-1_000_000_000_000 - Number(channel))
    const base = 'https://t.me/c/' + internal + '/'
    return { channel, first: base + first_id, last: base + last_id, count }
  })
  return { suggestions }
}
