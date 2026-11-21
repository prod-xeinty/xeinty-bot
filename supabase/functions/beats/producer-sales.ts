import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const table = 'producer_deals'
const fields = 'id,title,contact,chat_url,amount_minor,currency,notes,created_at,updated_at,completed_at'
const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
const timestamp = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/
const currencies = new Set(['RUB', 'USD', 'EUR'])
const fail = (error: string, status = 400) => ({ data: { error }, status })

function chatUrl(input: string) {
  if (!input) return null
  const telegram = /^@([a-z0-9_]{4,32})$/i.exec(input)
  if (telegram) return 'https://t.me/' + telegram[1].toLowerCase()
  try {
    const url = new URL(input)
    if (url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 500) return url.href
  } catch { /* Ask for a valid HTTPS link. */ }
}

export async function producerSales(db: SupabaseClient, owner: number, body: Record<string, unknown>): Promise<{ data: object; status?: number }> {
  const ownerDeals = () => db.from(table).select(fields).eq('telegram_user_id', owner)
  if (body.action === 'sales-list') {
    let after: string | undefined
    const deals: object[] = []
    while (true) {
      let query = ownerDeals()
      if (after) query = query.gt('id', after)
      const { data, error } = await query.order('id').limit(500)
      if (error) throw error
      deals.push(...data)
      if (data.length < 500) return { data: { deals } }
      after = data[data.length - 1].id
    }
  }

  if (typeof body.id !== 'string' || !uuid.test(body.id)) return fail('Некорректный ID сделки.')
  const id = body.id.toLowerCase()
  const expected = body.expectedUpdatedAt
  if (expected !== undefined && (typeof expected !== 'string' || !timestamp.test(expected) || !Number.isFinite(Date.parse(expected)))) {
    return fail('Обнови список сделок и попробуй ещё раз.')
  }

  if (body.action === 'sales-delete') {
    if (expected === undefined) return fail('Обнови список сделок и попробуй ещё раз.')
    const { data, error } = await db.from(table).delete().eq('id', id).eq('telegram_user_id', owner)
      .eq('updated_at', expected).select('id').maybeSingle()
    if (error) throw error
    if (!data) {
      const current = await ownerDeals().eq('id', id).maybeSingle()
      if (current.error) throw current.error
      if (current.data) return fail('Сделка изменилась. Обнови список перед удалением.', 409)
    }
    return { data: { ok: true } }
  }

  if (body.action !== 'sales-save') return fail('Неизвестное действие.')
  const { title, contact, chat, amountMinor, currency, notes, completed } = body
  if (typeof title !== 'string' || !title.trim() || title.length > 120 || typeof contact !== 'string' || contact.length > 80 ||
    typeof chat !== 'string' || chat.length > 500 || typeof notes !== 'string' || notes.length > 1000 ||
    typeof currency !== 'string' || !currencies.has(currency) || typeof completed !== 'boolean' ||
    (amountMinor !== null && (typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor > 1_000_000_000))) {
    return fail('Проверь название и сумму сделки.')
  }
  const link = chatUrl(chat.trim())
  if (link === undefined) return fail('Укажи @ник в Telegram или ссылку на чат, начинающуюся с https://.')
  const patch = { title: title.trim(), contact: contact.trim(), chat_url: link, amount_minor: amountMinor, currency, notes: notes.trim() }

  const { data: current, error: readError } = await ownerDeals().eq('id', id).maybeSingle()
  if (readError) throw readError
  const same = current && Object.entries(patch).every(([key, value]) => current[key as keyof typeof current] === value)
    && Boolean(current.completed_at) === completed
  if (same) return { data: { deal: current } }
  if (expected === undefined ? Boolean(current) : (!current || current.updated_at !== expected)) {
    return fail('Сделка изменилась. Обнови список и попробуй ещё раз.', 409)
  }

  const now = new Date(current ? Math.max(Date.now(), Date.parse(current.updated_at) + 1) : Date.now()).toISOString()
  const values = { ...patch, updated_at: now, completed_at: completed ? current?.completed_at ?? now : null }
  const query = current
    ? db.from(table).update(values).eq('id', id).eq('telegram_user_id', owner).eq('updated_at', current.updated_at)
    : db.from(table).insert({ ...values, id, telegram_user_id: owner })
  const { data, error } = await query.select(fields).maybeSingle()
  if (error?.code === '23505' || (!error && !data)) return fail('Сделка изменилась. Обнови список и попробуй ещё раз.', 409)
  if (error) throw error
  return { data: { deal: data } }
}
