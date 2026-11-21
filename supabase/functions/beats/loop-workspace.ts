import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { parseChannelPost } from './telegram-import.ts'

const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
const isId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)
const fail = (error: string, status = 400) => ({ data: { error }, status })
const loopColumns = 'id,title,bpm,musical_key,telegram_source_url'
const producerColumns = 'id,name,channel,telegram_chat'
const workColumns = 'id,title,loop_ids,producer_ids,release_url,audio_inbox_id'
const inboxColumns = 'id,loop_id,title,author_hint,release_url,audio_name'
const ownerColumn = 'telegram_user_id'

function ids(value: unknown) {
  return Array.isArray(value) && value.length >= 1 && value.length <= 20 && value.every(isId)
    ? [...new Set(value.map((id) => id.toLowerCase()))]
    : null
}

function channelUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 150) return undefined
  const text = value.trim()
  if (!text) return null
  const match = /^(?:@|https:\/\/t\.me\/(?:s\/)?)([a-z0-9_]{4,32})\/?$/i.exec(text)
  return match ? 'https://t.me/' + match[1].toLowerCase() : undefined
}

async function allRows<T extends { id: string }>(db: SupabaseClient, table: string, fields: string, owner: number, loopSources = false) {
  const rows: T[] = []
  let after: string | undefined
  while (true) {
    let query = db.from(table).select(fields).eq(ownerColumn, owner)
    if (loopSources) query = query.eq('is_loop_source', true)
    if (after) query = query.gt('id', after)
    const { data, error } = await query.order('id', { ascending: true }).limit(500)
    if (error) throw error
    const page = (data ?? []) as unknown as T[]
    rows.push(...page)
    if (page.length < 500) return rows
    after = page[page.length - 1].id
  }
}

export async function loopWorkspace(db: SupabaseClient, owner: number, body: Record<string, unknown>): Promise<{ data: object; status?: number }> {
  if (body.action === 'loop-contacts') {
    return { data: { contacts: await allRows(db, 'loop_producers', producerColumns, owner) } }
  }

  if (body.action === 'loop-author-save') {
    if (!isId(body.beatId) || (body.contactId !== null && !isId(body.contactId))) return fail('Проверь запись и контакт.')
    if (body.contactId !== null) {
      const { data, error } = await db.from('loop_producers').select('id').eq(ownerColumn, owner).eq('id', body.contactId).maybeSingle()
      if (error) throw error
      if (!data) return fail('Контакт не найден.', 404)
    }
    const { data, error } = await db.from('beats').update({ loop_author_id: body.contactId })
      .eq(ownerColumn, owner).eq('is_loop_source', false).eq('id', body.beatId).select('id').maybeSingle()
    if (error) throw error
    return data ? { data: { ok: true } } : fail('Запись не найдена.', 404)
  }

  if (body.action === 'loop-workspace') {
    const [loops, producers, works, settings, incoming] = await Promise.all([
      allRows(db, 'beats', loopColumns, owner, true),
      allRows(db, 'loop_producers', producerColumns, owner),
      allRows(db, 'loop_works', workColumns, owner),
      db.from('loop_inbox_settings').select(ownerColumn).eq(ownerColumn, owner).maybeSingle(),
      db.from('loop_inbox').select(inboxColumns).eq(ownerColumn, owner).is('handled_at', null)
        .order('created_at', { ascending: false }).limit(200),
    ])
    if (settings.error) throw settings.error
    if (incoming.error) throw incoming.error
    return { data: { loops, producers, works, inboxEnabled: Boolean(settings.data), incoming: incoming.data ?? [] } }
  }

  if (body.action === 'loop-source-add') {
    if (!isId(body.id)) return fail('Выбери запись из библиотеки.')
    const { data, error } = await db.from('beats').update({ is_loop_source: true })
      .eq(ownerColumn, owner).eq('id', body.id).select(loopColumns).maybeSingle()
    if (error) throw error
    return data ? { data: { loop: data } } : fail('Запись не найдена.', 404)
  }

  if (body.action === 'loop-producer-save') {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const channel = channelUrl(body.channel)
    if (!name.replace(/^@+/, '') || name.length > 80 || (body.id != null && !isId(body.id))) return fail('Укажи имя продюсера.')
    if (channel === undefined) return fail('Укажи @канал или ссылку на канал Telegram.')
    const chat = body.chat === undefined ? undefined : channelUrl(body.chat)
    if (body.chat !== undefined && chat === undefined) return fail('Укажи @ник или ссылку на личный чат Telegram.')
    const producer = { name, channel, ...(chat !== undefined ? { telegram_chat: chat } : {}) }
    const query = body.id === undefined
      ? db.from('loop_producers').insert({ ...producer, telegram_user_id: owner })
      : db.from('loop_producers').update(producer).eq(ownerColumn, owner).eq('id', body.id)
    const { data, error } = await query.select(producerColumns).maybeSingle()
    if (error?.code === '23505') return fail('Контакт с таким именем или чатом уже есть.', 409)
    if (error) throw error
    return data ? { data: { producer: data } } : fail('Продюсер не найден.', 404)
  }

  if (body.action === 'loop-inbox-dismiss') {
    if (!isId(body.id)) return fail('Выбери входящий бит.')
    const { error } = await db.from('loop_inbox').update({ handled_at: new Date().toISOString() })
      .eq(ownerColumn, owner).eq('id', body.id).is('handled_at', null)
    if (error) throw error
    return { data: { ok: true } }
  }

  if (body.action === 'loop-work-save') {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const loopIds = ids(body.loopIds)
    const producerIds = ids(body.producerIds)
    if (!title || title.length > 120 || !loopIds || !producerIds || (body.id != null && !isId(body.id)) ||
      (body.inboxId != null && !isId(body.inboxId))) {
      return fail('Укажи название, выбери луп и продюсера.')
    }
    if (typeof body.releaseUrl !== 'string' || body.releaseUrl.length > 500) return fail('Укажи ссылку на пост Telegram.')
    const post = body.releaseUrl.trim() ? parseChannelPost(body.releaseUrl) : null
    if (body.releaseUrl.trim() && !post) return fail('Ссылка на релиз должна вести на конкретный пост Telegram.')
    const releaseUrl = post ? 'https://t.me/' + (/^\d+$/.test(post.channel) ? 'c/' : '') + post.channel + '/' + post.id : null
    const [loops, producers] = await Promise.all([
      db.from('beats').select('id').eq(ownerColumn, owner).eq('is_loop_source', true).in('id', loopIds),
      db.from('loop_producers').select('id').eq(ownerColumn, owner).in('id', producerIds),
    ])
    if (loops.error) throw loops.error
    if (producers.error) throw producers.error
    if (loops.data.length !== loopIds.length || producers.data.length !== producerIds.length) return fail('Один из лупов или продюсеров недоступен.', 404)
    if (body.inboxId) {
      const { data, error } = await db.rpc('save_loop_work_from_inbox', {
        p_owner: owner, p_inbox: body.inboxId, p_work: body.id ?? null, p_title: title,
        p_loops: loopIds, p_producers: producerIds, p_release: releaseUrl,
      }).select(workColumns).maybeSingle()
      if (error?.code === '23505') return fail('Этот пост уже прикреплён к биту. Открой существующую карточку.', 409)
      if (error) throw error
      return data ? { data: { work: data } } : fail('Входящий бит уже обработан или не найден. Обнови список.', 409)
    }
    const work = { title, loop_ids: loopIds, producer_ids: producerIds, release_url: releaseUrl }
    const query = body.id === undefined
      ? db.from('loop_works').insert({ ...work, telegram_user_id: owner })
      : db.from('loop_works').update(work).eq(ownerColumn, owner).eq('id', body.id)
    const { data, error } = await query.select(workColumns).maybeSingle()
    if (error?.code === '23505') return fail('Этот пост уже прикреплён к биту. Открой существующую карточку.', 409)
    if (error) throw error
    return data ? { data: { work: data } } : fail('Бит не найден.', 404)
  }

  if (body.action === 'loop-work-delete') {
    if (!isId(body.id)) return fail('Выбери бит.')
    const { error } = await db.from('loop_works').delete().eq(ownerColumn, owner).eq('id', body.id)
    if (error) throw error
    return { data: { ok: true } }
  }

  return fail('Неизвестное действие.')
}
