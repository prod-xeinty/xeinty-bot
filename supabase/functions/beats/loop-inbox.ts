import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { parseChannelPost } from './telegram-import.ts'
import { telegramBotRequest } from './telegram-publish.ts'

const uuid = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}'
export const inboxId = new RegExp('^' + uuid + '$', 'i')
const startLink = new RegExp('^/start(?:@xeintybot)?(?:\\s+loop_(' + uuid + '))?$', 'i')
const maxAudioBytes = 15 * 1024 * 1024

type Media = { file_id?: string; file_name?: string; title?: string; mime_type?: string }
type User = { id?: number; username?: string; first_name?: string; last_name?: string; is_bot?: boolean }
type PrivateMessage = {
  chat?: { id?: number; type?: string }
  from?: User
  message_id?: number
  text?: string
  caption?: string
  audio?: Media
  document?: Media
  forward_origin?: { type?: string; sender_user?: User; sender_user_name?: string; chat?: { id?: number; username?: string }; message_id?: number }
}
const bounded = (value: unknown, limit: number) =>
  typeof value === 'string' ? Array.from(value.replaceAll('\0', '').trim()).slice(0, limit).join('') : ''

function mediaInfo(message: PrivateMessage) {
  const media = message.audio ?? message.document
  const filename = bounded(media?.file_name, 255)
  if (!media?.file_id || (!message.audio && !/^audio\//i.test(media.mime_type ?? '') && !/\.(mp3|wav|m4a|flac|ogg|aac|opus)$/i.test(filename))) return null
  return { fileId: bounded(media.file_id, 500), filename: filename || 'Аудио из Telegram', title: bounded(media.title, 120) || filename.replace(/\.[^.]+$/, '') }
}

function releaseLink(message: PrivateMessage) {
  const origin = message.forward_origin
  if (origin?.type === 'channel' && origin.message_id && origin.chat?.id) {
    const internal = -1_000_000_000_000 - origin.chat.id
    const channel = origin.chat.username?.toLowerCase() || (internal > 0 ? 'c/' + internal : '')
    if (channel) return 'https://t.me/' + channel + '/' + origin.message_id
  }
  const link = (message.text ?? '').match(/https:\/\/t\.me\/[^\s]+/i)?.[0]
  const post = parseChannelPost(link)
  return post ? 'https://t.me/' + (/^\d+$/.test(post.channel) ? 'c/' : '') + post.channel + '/' + post.id : null
}

function authorHint(message: PrivateMessage, media: ReturnType<typeof mediaInfo>) {
  const origin = message.forward_origin
  const user = origin ? origin.sender_user : media ? message.from : undefined
  if (user?.username) return bounded('@' + user.username, 80)
  if (user?.first_name) return bounded([user.first_name, user.last_name].filter(Boolean).join(' '), 80)
  return origin?.type === 'hidden_user' ? bounded(origin.sender_user_name, 80) : ''
}

async function replyTo(sender: number, text: string) {
  await telegramBotRequest('sendMessage', { chat_id: sender, text }).catch(() => {})
}

export async function processLoopInboxUpdate(db: SupabaseClient, update: unknown) {
  if (!update || typeof update !== 'object') return
  const message = (update as { message?: PrivateMessage }).message
  if (!message || message.chat?.type !== 'private' || message.from?.is_bot) return
  const sender = message.from?.id
  if (typeof sender !== 'number' || !Number.isSafeInteger(sender) || sender < 1 || sender !== message.chat.id) return
  const match = startLink.exec(message.text?.trim() ?? '')
  if (match) {
    const id = match[1]
    if (id) {
      const { data: loop, error } = await db.from('beats').select('id,title,telegram_user_id')
        .eq('id', id).eq('is_loop_source', true).maybeSingle()
      if (error) throw error
      const settings = loop ? await db.from('loop_inbox_settings').select('telegram_user_id').eq('telegram_user_id', loop.telegram_user_id).maybeSingle() : null
      if (settings?.error) throw settings.error
      if (!loop || !settings?.data) {
        const removed = await db.from('loop_inbox_routes').delete().eq('sender_id', sender)
        if (removed.error) throw removed.error
        await replyTo(sender, 'Ссылка на луп сейчас недоступна.')
        return
      }
      const { error: routeError } = await db.from('loop_inbox_routes').upsert({
        sender_id: sender, loop_id: loop.id, expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      if (routeError) throw routeError
      await replyTo(sender, 'Пришли аудиофайл или ссылку на пост с битом для лупа «' + loop.title + '».')
    } else {
      const { error } = await db.from('loop_inbox_routes').delete().eq('sender_id', sender)
      if (error) throw error
      await replyTo(sender, 'Чтобы добавить бит в XEINTY, подключи «Входящие» в режиме «Лупмейкер» и перешли сюда аудио или пост. Если тебе прислали ссылку на луп, открой её перед отправкой бита.')
    }
    return
  }

  const id = message.message_id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) return
  const media = mediaInfo(message)
  const release = releaseLink(message)
  if (!media && !release) return
  const title = bounded(media?.title || message.caption?.split('\n')[0], 120) || 'Бит из Telegram'
  const { data: added, error } = await db.rpc('record_loop_inbox', {
    p_sender: sender, p_message: id, p_title: title, p_author: authorHint(message, media) || null,
    p_release: release, p_audio_name: media?.filename ?? null, p_audio_file_id: media?.fileId || null,
  })
  if (error) throw error
  if (added) await replyTo(sender, 'Бит добавлен во «Входящие» XEINTY. Лупмейкер сможет подтвердить данные в мини-приложении.')
}

export async function enableLoopInbox(db: SupabaseClient, owner: number) {
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  const base = Deno.env.get('SUPABASE_URL')
  if (!secret || !base) return { error: 'У бота пока не настроены входящие сообщения.', status: 503 }
  const url = base.replace(/\/$/, '') + '/functions/v1/beats/telegram-webhook'
  const settings = await telegramBotRequest<{ url: string; allowed_updates?: string[] }>('getWebhookInfo', {})
  if (settings.url && settings.url !== url) return { error: 'Бот подключён к другому обработчику сообщений.', status: 409 }
  if (!settings.url || settings.allowed_updates?.length && !settings.allowed_updates.includes('message')) {
    const allowedUpdates = [...new Set([...(settings.allowed_updates ?? []), 'message', 'channel_post'])]
    await telegramBotRequest('setWebhook', { url, secret_token: secret, allowed_updates: allowedUpdates })
  }
  const { error } = await db.from('loop_inbox_settings').upsert({ telegram_user_id: owner })
  if (error) throw error
  return { enabled: true }
}

export async function loopInboxAudio(db: SupabaseClient, owner: number, id: string) {
  const { data, error } = await db.from('loop_inbox').select('audio_file_id,audio_name')
    .eq('telegram_user_id', owner).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data?.audio_file_id) return { error: 'У этого бита нет аудиофайла.', status: 404 }
  const { file_path, file_size } = await telegramBotRequest<{ file_path?: string; file_size?: number }>('getFile', { file_id: data.audio_file_id })
  if (!file_path || !/^[a-z0-9_/-]+\.[a-z0-9]+$/i.test(file_path) || !Number.isSafeInteger(file_size) ||
    file_size! < 1 || file_size! > maxAudioBytes) return { error: 'В XEINTY можно прослушивать файлы до 15 МБ.', status: 413 }
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  const response = await fetch('https://api.telegram.org/file/bot' + token + '/' + file_path, { signal: AbortSignal.timeout(25_000) })
    .catch(() => undefined)
  if (!response?.ok || !response.body) return { error: 'Не удалось загрузить аудио из Telegram.', status: 502 }
  const sourceType = response.headers.get('content-type') ?? ''
  const name = data.audio_name || file_path
  const mime = /^audio\/[a-z0-9.+-]+$/i.test(sourceType) ? sourceType
    : /\.(?:wav)$/i.test(name) ? 'audio/wav'
    : /\.(?:m4a|aac)$/i.test(name) ? 'audio/mp4'
    : /\.flac$/i.test(name) ? 'audio/flac'
    : /\.(?:ogg|opus)$/i.test(name) ? 'audio/ogg' : 'audio/mpeg'
  return { body: response.body, mime }
}
