import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export type Platform = 'youtube' | 'telegram'

export async function publicationLinks(db: SupabaseClient, userId: number, platform: Platform, beatId?: string) {
  const query = db.from('beats')
    .select('id,telegram_link,youtube_link,beat_publications(platform,url)')
    .eq('telegram_user_id', userId)
  const { data, error } = await (beatId ? query.eq('id', beatId) : query.eq('is_loop_source', false).order('created_at', { ascending: false }).limit(200))
  if (error) throw error
  return (data ?? []).flatMap((beat) => {
    const latest = platform === 'youtube' ? beat.youtube_link : beat.telegram_link
    const links = new Set<string>([latest, ...beat.beat_publications.filter((post) => post.platform === platform).map((post) => post.url)]
      .map((link) => link.trim()).filter(Boolean))
    return [...links].map((link) => ({ beatId: beat.id, link }))
  })
}

type Snapshot = { fetchedAt: string; totals: { views: number | null }; videosWithViews: number; linkedVideos: number; restricted?: boolean; unsupported?: boolean }

export async function dailyViews(db: SupabaseClient, userId: number, platform: Platform, stats: Snapshot) {
  const timestamp = Date.parse(stats.fetchedAt)
  const day = stats.fetchedAt.slice(0, 10)
  const from = new Date(timestamp - 29 * 86_400_000).toISOString().slice(0, 10)
  if (stats.totals.views !== null && stats.linkedVideos > 0 && stats.videosWithViews === stats.linkedVideos && !stats.restricted && !stats.unsupported) {
    const saved = await db.from('platform_daily_views').upsert({ telegram_user_id: userId, platform, day, views: stats.totals.views })
    if (saved.error) throw saved.error
  }
  const { data, error } = await db.from('platform_daily_views').select('day,views')
    .eq('telegram_user_id', userId).eq('platform', platform).gte('day', from).lte('day', day).order('day')
  if (error) throw error
  return data
}
