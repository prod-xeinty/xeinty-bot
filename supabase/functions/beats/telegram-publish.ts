type Chat = { id: number; type: string; title?: string; username?: string }
type Member = { status: string; can_post_messages?: boolean }
type Message = { message_id: number }

export class TelegramPublishError extends Error {}

async function api<T>(method: string, payload: Record<string, unknown> | FormData): Promise<T> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is missing')
  const form = payload instanceof FormData
  let response: Response
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: form ? undefined : { 'content-type': 'application/json' },
      body: form ? payload : JSON.stringify(payload),
      signal: AbortSignal.timeout(40_000),
    })
  } catch {
    // Fetch errors can include the request URL and therefore the bot token.
    throw new TelegramPublishError('Telegram не ответил. Проверь канал перед повторной отправкой.')
  }
  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.ok) {
    if (method === 'getChat' || method === 'getChatMember') {
      throw new TelegramPublishError('Канал недоступен. Проверь его адрес и права бота.')
    }
    throw new TelegramPublishError('Telegram отклонил отправку. Проверь права бота и доступность файлов.')
  }
  return result.result as T
}

export async function channelForPublisher(address: string, userId: number): Promise<Chat> {
  const chat = await api<Chat>('getChat', { chat_id: address })
  if (chat.type !== 'channel') throw new TelegramPublishError('Укажи канал Telegram.')
  const bot = await api<{ id: number }>('getMe', {})
  const [member, botMember] = await Promise.all([
    api<Member>('getChatMember', { chat_id: chat.id, user_id: userId }),
    api<Member>('getChatMember', { chat_id: chat.id, user_id: bot.id }),
  ])
  if (botMember.status !== 'administrator' || !botMember.can_post_messages) {
    throw new TelegramPublishError('Дай боту право публиковать сообщения в канале.')
  }
  if (member.status !== 'creator' && !(member.status === 'administrator' && member.can_post_messages)) {
    throw new TelegramPublishError('У твоего аккаунта нет права публиковать в этом канале.')
  }
  return chat
}

export async function postAudio(chat: Chat, tracks: { audio: string }[], caption: string): Promise<string> {
  let first: Message
  if (tracks.length === 1) {
    first = await api<Message>('sendAudio', { chat_id: chat.id, ...tracks[0], caption })
  } else {
    const media = tracks.map(({ audio }, index) => ({
      type: 'audio', media: audio, caption: index === 0 ? caption : undefined,
    }))
    const messages = await api<Message[]>('sendMediaGroup', { chat_id: chat.id, media })
    first = messages[0]
  }
  const path = chat.username || `c/${String(chat.id).slice(4)}`
  return `https://t.me/${path}/${first.message_id}`
}

export async function postCover(chat: Chat, cover: string | File, caption: string) {
  if (typeof cover === 'string') {
    await api('sendPhoto', { chat_id: chat.id, photo: cover, caption })
    return
  }
  const form = new FormData()
  form.set('chat_id', String(chat.id))
  form.set('photo', cover)
  form.set('caption', caption)
  await api('sendPhoto', form)
}

export function readCover(value: unknown): File | undefined {
  if (value == null) return
  if (typeof value !== 'string' || value.length > 2_800_000) throw new TelegramPublishError('Обложка должна быть до 2 МБ.')
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(value)
  if (!match) throw new TelegramPublishError('Нужна обложка JPG, PNG или WEBP.')
  let bytes: Uint8Array
  try { bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)) }
  catch { throw new TelegramPublishError('Не удалось прочитать обложку.') }
  if (bytes.length > 2 * 1024 * 1024) throw new TelegramPublishError('Обложка должна быть до 2 МБ.')
  return new File([bytes], `cover.${match[1].split('/')[1]}`, { type: match[1] })
}
