import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { Api, TelegramClient } from 'npm:telegram@2.26.22'
import { StringSession } from 'npm:telegram@2.26.22/sessions/index.js'
import { LogLevel } from 'npm:telegram@2.26.22/extensions/Logger.js'

type PostStats = { views: number | null; reactions: number | null; comments: number | null; forwards: number | null }
let connection: Promise<TelegramClient> | undefined

async function connectBot() {
  const apiId = Number(Deno.env.get('TELEGRAM_API_ID'))
  const apiHash = Deno.env.get('TELEGRAM_API_HASH')
  const botAuthToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!Number.isSafeInteger(apiId) || apiId < 1 || !apiHash || !botAuthToken) throw new Error('Missing Telegram API configuration')
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 1, requestRetries: 4, floodSleepThreshold: 0, autoReconnect: false })
  client.setLogLevel(LogLevel.NONE)
  try {
    await client.connect()
    await client.invoke(new Api.auth.ImportBotAuthorization({ apiId, apiHash: apiHash.trim(), botAuthToken: botAuthToken.trim() }))
    return client
  } catch {
    await client.disconnect().catch(() => {})
    throw new Error('Telegram bot authorization failed')
  }
}

async function getBot() {
  connection ??= connectBot().catch((error) => { connection = undefined; throw error })
  const client = await connection
  if (!client.connected) {
    connection = undefined
    return getBot()
  }
  return client
}

function publicPost(link: string) {
  const match = /^https?:\/\/t\.me\/(?:s\/)?([a-z][a-z0-9_]{3,31})\/([1-9]\d{0,9})\/?(?:[?#].*)?$/i.exec(link.trim())
  if (!match || Number(match[2]) > 2147483647) return null
  return { channel: match[1].toLowerCase(), id: Number(match[2]) }
}

export async function telegramStats(db: SupabaseClient, userId: number) {
  const { data, error } = await db.from('beats').select('id,telegram_link')
    .eq('telegram_user_id', userId).order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  const rows = (data ?? []).filter((beat) => beat.telegram_link?.trim()).map((beat) => ({
    beatId: beat.id as string, link: beat.telegram_link as string, post: publicPost(beat.telegram_link),
  }))
  const groups = new Map<string, Set<number>>()
  for (const { post } of rows) {
    if (!post) continue
    if (!groups.has(post.channel)) groups.set(post.channel, new Set())
    groups.get(post.channel)!.add(post.id)
  }
  const metrics = new Map<string, PostStats>()
  if (groups.size) {
    const client = await getBot()
    const batches = [...groups].flatMap(([channel, set]) => {
      const ids = [...set]
      return Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ({ channel, ids: ids.slice(i * 50, i * 50 + 50) }))
    })
    for (let i = 0; i < batches.length; i += 4) {
      await Promise.all(batches.slice(i, i + 4).map(async ({ channel, ids }) => {
        try {
          const posts = await client.getMessages(channel, { ids })
          for (const post of posts) {
            if (!(post instanceof Api.Message) || !ids.includes(post.id)) continue
            metrics.set(channel + '/' + post.id, {
              views: post.views ?? null,
              reactions: post.reactions?.results.reduce((total, item) => total + item.count, 0) ?? 0,
              comments: post.replies?.comments ? post.replies.replies : null,
              forwards: post.forwards ?? null,
            })
          }
        } catch { /* Other channels can still contribute data. */ }
      }))
    }
  }
  const values = [...metrics.values()]
  const sum = (key: keyof PostStats) => {
    const counts = values.flatMap((value) => value[key] === null ? [] : [value[key]])
    return counts.length ? counts.reduce((total, count) => total + count, 0) : null
  }
  const totalViews = sum('views')
  return {
    entries: rows.map(({ beatId, link, post }) => ({ beatId, link, views: null, ...metrics.get(post ? post.channel + '/' + post.id : '') })),
    totalViews: totalViews ?? 0,
    totals: { views: totalViews, reactions: sum('reactions'), comments: sum('comments'), forwards: sum('forwards') },
    videosWithViews: values.filter(({ views }) => views !== null).length,
    linkedVideos: [...groups.values()].reduce((total, group) => total + group.size, 0),
    unsupported: rows.some(({ post }) => post === null),
    fetchedAt: new Date().toISOString(),
  }
}
