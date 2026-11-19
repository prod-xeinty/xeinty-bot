import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { Api, TelegramClient } from 'npm:telegram@2.26.22'
import { StringSession } from 'npm:telegram@2.26.22/sessions/index.js'
import { LogLevel } from 'npm:telegram@2.26.22/extensions/Logger.js'
import bigInteger from 'npm:big-integer@1.6.52'
import { channelForPublisher } from './telegram-publish.ts'
import { dailyViews, publicationLinks } from './publication-history.ts'

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

function telegramPost(link: string) {
  const normal = /^https?:\/\/t\.me\/(?:s\/)?([a-z][a-z0-9_]{3,31})\/([1-9]\d{0,9})\/?(?:[?#].*)?$/i.exec(link.trim())
  if (normal && Number(normal[2]) <= 2147483647) return { channel: normal[1].toLowerCase(), id: Number(normal[2]), private: false }
  const closed = /^https?:\/\/t\.me\/c\/([1-9]\d{0,11})\/([1-9]\d{0,9})\/?(?:[?#].*)?$/i.exec(link.trim())
  if (!closed || Number(closed[1]) > 997852516352 || Number(closed[2]) > 2147483647) return null
  return { channel: closed[1], id: Number(closed[2]), private: true }
}

function botChatId(channel: string) {
  return String(-1_000_000_000_000 - Number(channel))
}

export async function telegramStats(db: SupabaseClient, userId: number) {
  const rows = (await publicationLinks(db, userId, 'telegram')).map((row) => ({ ...row, post: telegramPost(row.link) }))
  const privateChannels = new Set(rows.flatMap(({ post }) => post?.private ? [botChatId(post.channel)] : []))
  const connected = new Set<string>()
  if (privateChannels.size) {
    const { data: channels, error: channelError } = await db.from('telegram_channels').select('chat_id')
      .eq('telegram_user_id', userId).in('chat_id', [...privateChannels])
    if (channelError) throw channelError
    for (const channel of channels ?? []) connected.add(String(channel.chat_id))
  }
  const groups = new Map<string, Set<number>>()
  for (const { post } of rows) {
    if (!post) continue
    if (!groups.has(post.channel)) groups.set(post.channel, new Set())
    groups.get(post.channel)!.add(post.id)
  }
  const metrics = new Map<string, PostStats>()
  const postKeys = new Map<string, string>()
  const refused = new Set<string>()
  const access = new Map<string, Promise<boolean>>()
  function canRead(channel: string) {
    const chatId = botChatId(channel)
    if (!connected.has(chatId)) return Promise.resolve(false)
    const checked = access.get(channel) ?? channelForPublisher(chatId, userId).then(() => true, () => false)
    access.set(channel, checked)
    return checked
  }
  if (groups.size) {
    const client = await getBot()
    const batches = [...groups].flatMap(([channel, set]) => {
      const ids = [...set]
      return Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ({ channel, ids: ids.slice(i * 50, i * 50 + 50) }))
    })
    for (let i = 0; i < batches.length; i += 4) {
      await Promise.all(batches.slice(i, i + 4).map(async ({ channel, ids }) => {
        try {
          const closed = /^\d+$/.test(channel)
          if (closed && !await canRead(channel)) {
            refused.add(channel)
            return
          }
          const peer = closed ? await client.getInputEntity(new Api.PeerChannel({ channelId: bigInteger(channel) })) : channel
          const posts = await client.getMessages(peer, { ids })
          for (const post of posts) {
            if (!(post instanceof Api.Message) || !ids.includes(post.id)) continue
            const requestKey = channel + '/' + post.id
            const key = post.peerId instanceof Api.PeerChannel ? post.peerId.channelId.toString() + '/' + post.id : requestKey
            postKeys.set(requestKey, key)
            metrics.set(key, {
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
  const data = {
    entries: rows.map(({ beatId, link, post }) => {
      const mediaKey = postKeys.get(post ? post.channel + '/' + post.id : '')
      return {
        beatId, link, mediaKey, views: null,
        restricted: Boolean(post?.private && refused.has(post.channel)),
        ...metrics.get(mediaKey ?? ''),
      }
    }),
    totalViews: totalViews ?? 0,
    totals: { views: totalViews, reactions: sum('reactions'), comments: sum('comments'), forwards: sum('forwards') },
    videosWithViews: values.filter(({ views }) => views !== null).length,
    linkedVideos: new Set([...groups].flatMap(([channel, ids]) => [...ids].map((id) => {
      const key = channel + '/' + id
      return postKeys.get(key) ?? key
    }))).size,
    restricted: refused.size > 0,
    unsupported: rows.some(({ post }) => post === null),
    fetchedAt: new Date().toISOString(),
  }
  const series = await dailyViews(db, userId, 'telegram', data).catch(() => null)
  return { ...data, series }
}
