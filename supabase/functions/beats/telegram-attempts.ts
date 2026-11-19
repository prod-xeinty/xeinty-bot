import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { channelForPublisher, postAudio, postCover, readCover, TelegramPublishError } from './telegram-publish.ts'

const table = 'telegram_publication_attempts'
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
const retryDelay = 90_000
type Stage = 'cover_ready' | 'cover_sending' | 'audio_ready' | 'audio_sending' | 'audio_sent' | 'done'
type Payload = { caption: string; coverCaption: string; cover?: string | null; useSavedCover: boolean; republish: boolean }
type Attempt = { id: string; channel: string; beat_ids: string[]; payload: Payload; stage: Stage;
  url: string | null; cover_sent: boolean; warnings: string[]; updated_at: string }
type Result = { data: object; status?: number }

function failure(error: string, status = 400): Result { return { data: { error }, status } }
function isSending(stage: Stage) { return stage === 'cover_sending' || stage === 'audio_sending' }
function summary(attempt: Attempt) {
  return { id: attempt.id, channel: attempt.channel, beatIds: attempt.beat_ids, stage: attempt.stage, coverSent: attempt.cover_sent,
    retryAfter: isSending(attempt.stage) ? Date.parse(attempt.updated_at) + retryDelay : 0 }
}

export async function telegramPublication(db: SupabaseClient, userId: number, body: Record<string, unknown>, bucket: string): Promise<Result> {
  const action = body.action
  const owned = () => db.from(table).select('*').eq('telegram_user_id', userId)
  if (action === 'telegram-publication-active') {
    const { data, error } = await owned().neq('stage', 'done').maybeSingle()
    if (error) throw error
    return { data: { attempt: data ? summary(data as Attempt) : null } }
  }

  const attemptId = body.attemptId ?? (action === 'publish-telegram' ? crypto.randomUUID() : undefined)
  if (typeof attemptId !== 'string' || !uuid.test(attemptId)) return failure('Некорректная попытка публикации.')
  const load = async () => {
    const { data, error } = await owned().eq('id', attemptId).maybeSingle()
    if (error) throw error
    return data as Attempt | null
  }
  const advance = async (from: Stage, stage: Stage, changes: Partial<Attempt> = {}) => {
    const {data, error} = await db.from(table).update({ ...changes, stage, updated_at: new Date().toISOString() })
      .eq('id', attemptId).eq('telegram_user_id', userId).eq('stage', from).select('*').maybeSingle()
    if (error) throw error
    return data as Attempt | null
  }
  let attempt = await load()
  if (action === 'telegram-publication-reset') {
    if (!attempt || attempt.stage === 'done') return { data: { reset: true } }
    if (attempt.stage === 'audio_sent') return failure('Аудио уже отправлено. Повтори сохранение ссылки.', 409)
    if (isSending(attempt.stage) && Date.now() < summary(attempt).retryAfter) {
      return failure('Telegram ещё может обрабатывать запрос. Подожди перед завершением попытки.', 409)
    }
    const cancelled = await advance(attempt.stage, 'done', { payload: {} as Payload })
    return cancelled ? { data: { reset: true } } : failure('Состояние изменилось. Обнови статус.', 409)
  }

  const getBeats = async (ids: string[]) => {
    const {data, error} = await db.from('beats').select('id,audio_name,audio_path,cover_path,telegram_link')
      .eq('telegram_user_id', userId).in('id', ids)
    if (error) throw error
    return ids.map((id) => data?.find((beat) => beat.id === id))
  }

  if (!attempt) {
    if (action !== 'publish-telegram') return failure('Попытка публикации не найдена.', 404)
    const { beatIds, caption, channel } = body
    const coverCaption = body.coverCaption ?? ''
    if (!Array.isArray(beatIds) || beatIds.length < 1 || beatIds.length > 10 || new Set(beatIds).size !== beatIds.length ||
        !beatIds.every((id) => typeof id === 'string' && uuid.test(id)) || typeof caption !== 'string' || caption.length > 1024 ||
        typeof coverCaption !== 'string' || coverCaption.length > 1024 || typeof channel !== 'string' || !/^-100[0-9]{5,16}$/.test(channel)) {
      return failure('Выбери канал и до 10 битов. Каждая подпись должна быть до 1024 символов.')
    }
    const connected = await db.from('telegram_channels').select('chat_id').eq('telegram_user_id', userId).eq('chat_id', channel).maybeSingle()
    if (connected.error) throw connected.error
    if (!connected.data) return failure('Подключи канал во вкладке «Каналы».', 403)
    const beats = await getBeats(beatIds)
    if (beats.some((beat) => !beat?.audio_path)) return failure('Для публикации нужны твои биты с MP3 в облаке.', 404)
    if (body.republish !== true && beats.some((beat) => beat?.telegram_link?.trim())) return failure('Подтверди «Опубликовать заново».', 409)
    const cover = readCover(body.cover)
    const payload = { caption, coverCaption, cover: cover ? body.cover : null, useSavedCover: body.useSavedCover === true, republish: body.republish === true }
    const inserted = await db.from(table).insert({ id: attemptId, telegram_user_id: userId, channel, beat_ids: beatIds,
      stage: cover ? 'cover_ready' : 'audio_ready', payload }).select('*').single()
    if (inserted.error?.code === '23505') {
      attempt = await load()
      if (!attempt) return failure('Уже есть незавершённая отправка в Telegram. Открой её статус.', 409)
    } else {
      if (inserted.error) throw inserted.error
      attempt = inserted.data as Attempt
    }
  }

  if (attempt.stage === 'done') {
    return attempt.url ? { data: { url: attempt.url, saved: true, warnings: attempt.warnings, beatIds: attempt.beat_ids } } : failure('Попытка завершена.', 410)
  }
  if (isSending(attempt.stage)) return failure('Telegram ещё не подтвердил шаг. Проверь канал перед новой попыткой.', 409)

  let singleCover: string | undefined
  let chat: Awaited<ReturnType<typeof channelForPublisher>> | undefined
  if (attempt.stage !== 'audio_sent') {
    const beats = await getBeats(attempt.beat_ids)
    if (beats.some((beat) => !beat?.audio_path)) return failure('Файл бита больше недоступен.', 404)
    if (!attempt.payload.republish && beats.some((beat) => beat?.telegram_link?.trim())) {
      if (!attempt.cover_sent) await advance(attempt.stage, 'done', { payload: {} as Payload })
      return failure('У бита уже есть пост. Проверь канал перед новой отправкой.', 409)
    }
    const connected = await db.from('telegram_channels').select('chat_id').eq('telegram_user_id', userId).eq('chat_id', attempt.channel).maybeSingle()
    if (connected.error) throw connected.error
    if (!connected.data) return failure('Подключи канал во вкладке «Каналы».', 403)
    chat = await channelForPublisher(attempt.channel, userId)
    const sign = async (path: string, download?: string) => {
      const {data, error} = await db.storage.from(bucket).createSignedUrl(path, 600, download ? { download } : undefined)
      if (error || !data?.signedUrl) throw new TelegramPublishError('Не удалось получить файл из облака.')
      return data.signedUrl
    }
    const tracks = await Promise.all(beats.map(async (beat) => ({ audio: await sign(beat!.audio_path, beat!.audio_name || 'beat.mp3') })))
    if (attempt.payload.useSavedCover && beats.length === 1 && beats[0]?.cover_path && !attempt.cover_sent) singleCover = await sign(beats[0].cover_path)

    if (attempt.stage === 'cover_ready') {
      const cover = readCover(attempt.payload.cover)
      if (!cover) return failure('Обложка недоступна.')
      if (!await advance('cover_ready', 'cover_sending')) return failure('Отправка уже идёт. Обнови статус.', 409)
      try { await postCover(chat, cover, attempt.payload.coverCaption) }
      catch (error) {
        if (error instanceof TelegramPublishError && !error.deliveryUnknown) await advance('cover_sending', 'cover_ready')
        return failure('Telegram не подтвердил обложку. Проверь статус отправки.', 502)
      }
      const next = await advance('cover_sending', 'audio_ready', { cover_sent: true, payload: { ...attempt.payload, cover: null } })
      if (!next) return failure('Состояние изменилось. Обнови статус.', 409)
      attempt = next
    }

    if (!await advance('audio_ready', 'audio_sending')) return failure('Отправка уже идёт. Обнови статус.', 409)
    let url: string
    try { url = await postAudio(chat, tracks, attempt.payload.caption) }
    catch (error) {
      if (error instanceof TelegramPublishError && !error.deliveryUnknown) await advance('audio_sending', 'audio_ready')
      return failure((attempt.cover_sent ? 'Обложка отправлена. ' : '') + 'Telegram не подтвердил аудио. Проверь статус отправки.', 502)
    }
    const next = await advance('audio_sending', 'audio_sent', { url })
    if (!next) return failure('Аудио отправлено. Обнови статус, чтобы сохранить ссылку.', 409)
    attempt = next
  }

  const url = attempt.url
  if (!url) return failure('Не удалось получить ссылку. Проверь канал.', 502)
  const save = await db.rpc('finish_telegram_publication', { p_attempt: attemptId, p_owner: userId })
  if (save.error || save.data === 'pending') return { data: { url, saved: false, beatIds: attempt.beat_ids, warnings: ['Аудио отправлено. Повтори сохранение ссылки.'] } }
  const warnings: string[] = []
  if (save.data === 'completed' && chat && singleCover) {
    try { await postCover(chat, singleCover, attempt.payload.coverCaption) }
    catch { warnings.push('Аудио опубликовано. Обложку можно отправить отдельно.'); }
    if (warnings.length) await db.from(table).update({warnings}).eq('id', attemptId).eq('telegram_user_id', userId)
  }
  return { data: { url, saved: true, warnings, beatIds: attempt.beat_ids } }
}
