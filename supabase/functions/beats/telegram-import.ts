import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { Api } from 'npm:telegram@2.26.22'
import bigInteger from 'npm:big-integer@1.6.52'
import { channelForReader, TelegramPublishError } from './telegram-publish.ts'
import { getBot } from './telegram-stats.ts'
import { detectTelegramAudioMetadata } from './audio-metadata.ts'

const lastMessageId = 2_147_483_647
const pageSize = 100
const albumNeighbors = 9
const between = (start: number, end: number) => Array.from({ length: end - start + 1 }, (_, index) => start + index)
const validId = (id: unknown): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= lastMessageId

export function parseChannelPost(value: unknown) {
  if (typeof value !== 'string' || value.length > 500) return null
  const match = /^https:\/\/t\.me\/(?:c\/([1-9]\d{0,11})|(?:s\/)?([a-z0-9_]{4,32}))\/([1-9]\d{0,9})\/?(?:[?#].*)?$/i.exec(value.trim())
  if (!match || !validId(Number(match[3]))) return null
  return { channel: match[1] ?? match[2].toLowerCase(), id: Number(match[3]) }
}

type AudioPost = { id: number; name: string; title: string; bpm: string; key: string; date: string; url: string; group: string | null }
type Result = { data: object; status?: number }
const fail = (error: string, status = 400): Result => ({ data: { error }, status })

function describe(post: Api.Message, base: string): AudioPost | null {
  if (!(post.media instanceof Api.MessageMediaDocument) || !(post.media.document instanceof Api.Document)) return null
  const file = post.media.document
  const audio = file.attributes.find((item) => item instanceof Api.DocumentAttributeAudio)
  const filename = file.attributes.find((item) => item instanceof Api.DocumentAttributeFilename)
  const name = filename instanceof Api.DocumentAttributeFilename ? filename.fileName.trim().slice(0, 255) : ''
  if (audio instanceof Api.DocumentAttributeAudio && audio.voice) return null
  if (!file.mimeType.startsWith('audio/') && !/\.(mp3|wav|flac|m4a|ogg|aac|aiff?|opus)$/i.test(name)) return null
  const audioTitle = audio instanceof Api.DocumentAttributeAudio ? audio.title?.trim() : undefined
  const title = audioTitle || name.replace(/\.[^.]+$/, '').trim() || 'Аудио ' + post.id
  const metadata = detectTelegramAudioMetadata(name, audioTitle, post.message)
  return { id: post.id, name, title: title.slice(0, 120), ...metadata, date: new Date(post.date * 1000).toISOString(),
    url: base + '/' + post.id, group: post.groupedId?.toString() ?? null }
}

async function telegramImportDocument(db: SupabaseClient, userId: number, beatId: string) {
  const { data: beat, error } = await db.from('beats').select('telegram_source_chat_id,telegram_source_message_id')
    .eq('id', beatId).eq('telegram_user_id', userId).maybeSingle()
  if (error) throw error
  const channel = beat?.telegram_source_chat_id
  const messageId = beat?.telegram_source_message_id
  if (typeof channel !== 'string' || !/^-100\d{5,16}$/.test(channel) || !validId(messageId)) {
    return fail('У записи нет доступного источника в Telegram.', 404)
  }
  const { data: connected, error: connectionError } = await db.from('telegram_channels').select('chat_id')
    .eq('telegram_user_id', userId).eq('chat_id', channel).maybeSingle()
  if (connectionError) throw connectionError
  if (!connected) return fail('Подключи исходный канал или выбери файл с устройства.', 403)

  try {
    const chat = await channelForReader(channel, userId)
    if (String(chat.id) !== channel) return fail('Исходный канал изменился.', 403)
    const numeric = String(-1_000_000_000_000 - chat.id)
    const bot = await getBot()
    const peer = await bot.getInputEntity(chat.username ?? new Api.PeerChannel({ channelId: bigInteger(numeric) }))
    if (!(peer instanceof Api.InputPeerChannel) || peer.channelId.toString() !== numeric) {
      return fail('Исходный канал изменился.', 403)
    }
    const [post] = await bot.getMessages(peer, { ids: [messageId] })
    if (!(post instanceof Api.Message) || post.id !== messageId || !(post.media instanceof Api.MessageMediaDocument) ||
      !(post.media.document instanceof Api.Document) || !describe(post, '')) {
      return fail('Исходный пост или аудио недоступны. Выбери файл с устройства.', 404)
    }

    return { bot, post, document: post.media.document }
  } catch (failure) {
    return failure instanceof TelegramPublishError
      ? fail(failure.message + ' Можно открыть исходный пост в Telegram.', 403)
      : fail('Не удалось получить доступ к исходному посту Telegram.', 502)
  }
}

function importedAudioType(document: Api.Document) {
  const name = document.attributes.find((attribute) => attribute instanceof Api.DocumentAttributeFilename)?.fileName ?? ''
  if (/\.wav$/i.test(name) || /^audio\/(?:x-)?wav(?:e)?$/i.test(document.mimeType)) return 'audio/wav'
  if (/\.mp3$/i.test(name) || document.mimeType === 'audio/mpeg' || document.mimeType === 'audio/mp3') return 'audio/mpeg'
  return null
}

export async function telegramImportFile(db: SupabaseClient, userId: number, beatId: string, kind: 'audio' | 'cover', maxBytes: number) {
  const source = await telegramImportDocument(db, userId, beatId)
  if ('data' in source) return source
  const { bot, post, document } = source
  try {
    if (kind === 'cover') {
      const thumb = (document.thumbs ?? [])
        .filter((size) => (size instanceof Api.PhotoSize && size.size > 0 && size.size <= maxBytes) ||
          (size instanceof Api.PhotoCachedSize && size.bytes.length > 0 && size.bytes.length <= maxBytes))
        .sort((a, b) => ('w' in b ? b.w : 0) - ('w' in a ? a.w : 0))[0]
      if (!thumb || !('type' in thumb)) return fail('В аудио Telegram нет обложки. Выбери изображение с устройства.', 404)
      const bytes = await bot.downloadMedia(post, { thumb })
      if (typeof bytes === 'string' || !bytes || bytes.length > maxBytes ||
        bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
        return fail('Обложка Telegram недоступна. Выбери изображение с устройства.', 404)
      }
      return { bytes: Uint8Array.from(bytes), contentType: 'image/jpeg' }
    }

    const contentType = importedAudioType(document)
    if (!contentType) return fail('Для сборки выбери аудио MP3 или WAV с устройства.', 415)
    const size = Number(document.size.toString())
    if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) {
      return fail('Аудио из Telegram превышает лимит 15 МБ или недоступно. Выбери файл с устройства.', 413)
    }
    const bytes = await bot.downloadMedia(post)
    if (typeof bytes === 'string' || !bytes || bytes.length !== size) {
      return fail('Не удалось получить аудио целиком. Повтори попытку или выбери файл с устройства.', 502)
    }
    return { bytes: Uint8Array.from(bytes), contentType }
  } catch (failure) {
    return failure instanceof TelegramPublishError
      ? fail(failure.message + ' Можно выбрать файл с устройства.', 403)
      : fail('Не удалось загрузить файл из Telegram. Повтори попытку или выбери файл с устройства.', 502)
  }
}

export async function telegramAudioSource(db: SupabaseClient, userId: number, beatId: string, maxBytes: number) {
  const source = await telegramImportDocument(db, userId, beatId)
  if ('data' in source) return source
  const contentType = importedAudioType(source.document)
  if (!contentType) return fail('Плеер поддерживает MP3 и WAV. Открой исходный пост в Telegram.', 415)
  const size = Number(source.document.size.toString())
  if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) {
    return fail('Этот файл недоступен в плеере. Открой исходный пост в Telegram.', 413)
  }
  return { ...source, contentType, size }
}

export async function telegramImport(db: SupabaseClient, userId: number, body: Record<string, unknown>): Promise<Result> {
  const channel = body.channel
  if (typeof channel !== 'string' || !/^-100\d{5,16}$/.test(channel)) return fail('Выбери подключённый канал.')
  const preview = body.action === 'telegram-import-preview'
  const start = parseChannelPost(body.first)
  const end = parseChannelPost(body.last)
  const selection = body.ids
  if (preview ? !start || !end : !Array.isArray(selection) || !selection.length || selection.length > pageSize || !selection.every(validId)) {
    return fail(preview ? 'Вставь две ссылки на посты Telegram.' : 'Выбери от 1 до 100 треков за раз.')
  }
  const { data: owned, error } = await db.from('telegram_channels').select('chat_id')
    .eq('telegram_user_id', userId).eq('chat_id', channel).maybeSingle()
  if (error) throw error
  if (!owned) return fail('Сначала подключи этот канал в XEINTY.', 403)
  let chat
  try { chat = await channelForReader(channel, userId) }
  catch (failure) {
    return fail(failure instanceof TelegramPublishError ? failure.message : 'Не удалось проверить доступ к каналу.', 403)
  }
  const numeric = String(-1_000_000_000_000 - chat.id)
  const username = chat.username?.toLowerCase()
  if (preview && [start, end].some((anchor) => anchor?.channel !== username && anchor?.channel !== numeric)) {
    return fail('Обе ссылки должны вести на посты выбранного канала.')
  }
  const base = 'https://t.me/' + (username ?? 'c/' + numeric)
  const found = new Map<number, Api.Message>()
  let next: number | null = null
  let scanned = 0
  let total = 0
  let audio: AudioPost[]
  try {
    const bot = await getBot()
    const peer = await bot.getInputEntity(username ?? new Api.PeerChannel({ channelId: bigInteger(numeric) }))
    if (!(peer instanceof Api.InputPeerChannel) || peer.channelId.toString() !== numeric) return fail('Канал изменился. Подключи его заново.', 409)
    async function read(ids: number[]) {
      const unique = [...new Set(ids)]
      for (let i = 0; i < unique.length; i += 50) {
        for (const post of await bot.getMessages(peer, { ids: unique.slice(i, i + 50) })) {
          if (post instanceof Api.Message) found.set(post.id, post)
        }
      }
    }
    if (preview && start && end) {
      const low = Math.min(start.id, end.id)
      const high = Math.max(start.id, end.id)
      const cursor = body.cursor ?? low
      if (!validId(cursor) || cursor < low || cursor > high) return fail('Начни поиск заново.')
      const pageEnd = Math.min(cursor + pageSize - 1, high)
      await read([...between(cursor, pageEnd), low, high])
      if (!found.has(low) || !found.has(high)) return fail('Один из граничных постов недоступен. Проверь ссылки.', 404)
      const firstGroup = cursor === low ? found.get(low)?.groupedId?.toString() : undefined
      const lastGroup = pageEnd === high ? found.get(high)?.groupedId?.toString() : undefined
      if (firstGroup && low > 1) await read(between(Math.max(1, low - albumNeighbors), low - 1))
      if (lastGroup && high < lastMessageId) await read(between(high + 1, Math.min(lastMessageId, high + albumNeighbors)))
      for (const [id, post] of found) {
        const group = post.groupedId?.toString()
        if ((id >= cursor && id <= pageEnd) || (group && (group === firstGroup || group === lastGroup))) continue
        found.delete(id)
      }
      total = high - low + 1
      scanned = pageEnd - low + 1
      next = pageEnd < high ? pageEnd + 1 : null
    } else {
      await read(selection as number[])
    }
    audio = [...found.values()].sort((a, b) => a.id - b.id).flatMap((post) => describe(post, base) ?? [])
  } catch {
    return fail('Не удалось прочитать посты. Проверь доступ бота к каналу и попробуй ещё раз.', 502)
  }

  if (!audio.length) return { data: preview ? { tracks: [], next, scanned, total } : { added: 0, skipped: new Set(selection as number[]).size, savedIds: [] } }
  const { data: imports, error: readError } = await db.from('beats').select('telegram_source_message_id')
    .eq('telegram_user_id', userId).eq('telegram_source_chat_id', channel).in('telegram_source_message_id', audio.map((post) => post.id))
  if (readError) throw readError
  const exists = new Set((imports ?? []).map((row) => row.telegram_source_message_id))
  const links = [...new Set(audio.flatMap(({ id }) => {
    const privateUrl = 'https://t.me/c/' + numeric + '/' + id
    return username ? [base + '/' + id, 'https://t.me/s/' + username + '/' + id, privateUrl] : [privateUrl]
  }))]
  const existingFiles = new Set<string>()
  for (let i = 0; i < links.length; i += 50) {
    const { data, error } = await db.from('beat_publications').select('url,beats!inner(audio_name)')
      .eq('platform', 'telegram').eq('beats.telegram_user_id', userId).in('url', links.slice(i, i + 50))
    if (error) throw error
    for (const row of data ?? []) {
      const beat = row.beats as unknown as { audio_name: string | null }
      if (beat?.audio_name) existingFiles.add(row.url.split('/').at(-1) + ':' + beat.audio_name.trim().toLowerCase())
    }
  }
  const tracks = audio.map((post) => ({ ...post, exists: exists.has(post.id) || existingFiles.has(post.id + ':' + post.name.toLowerCase()) }))
  if (preview) return { data: { tracks, next, scanned, total } }
  const candidates = tracks.filter((post) => !post.exists)
  const savedIds = tracks.map(({ id }) => id)
  if (!candidates.length) return { data: { added: 0, skipped: new Set(selection as number[]).size, savedIds } }
  const { data: added, error: insertError } = await db.from('beats').upsert(candidates.map((post) => ({
    id: crypto.randomUUID(), telegram_user_id: userId, title: post.title, audio_name: post.name || null,
    bpm: post.bpm, musical_key: post.key, status: 'Импортирован',
    telegram_source_chat_id: channel, telegram_source_message_id: post.id, telegram_source_url: post.url,
    telegram_source_date: post.date, telegram_link: post.url,
  })), { onConflict: 'telegram_user_id,telegram_source_chat_id,telegram_source_message_id', ignoreDuplicates: true }).select('id')
  if (insertError) throw insertError
  const addedCount = added?.length ?? 0
  return { data: { added: addedCount, skipped: new Set(selection as number[]).size - addedCount, savedIds } }
}
