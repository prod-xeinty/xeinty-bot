import type { StoredBeat } from './beat-store'

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export type CloudBeat = StoredBeat & { cloud: true; audioUrl?: string; coverUrl?: string }

type UploadPlan = {
  id: string
  audioPath: string
  audioToken: string
  coverPath: string | null
  coverToken: string | null
}

export function cloudConfigured(): boolean {
  return Boolean(projectUrl && publishableKey)
}

async function requestBeatAction(initData: string, action: string, payload: Record<string, unknown>, signal?: AbortSignal) {
  if (!projectUrl || !publishableKey) throw new Error('Облако ещё не подключено')
  const response = await fetch(`${projectUrl}/functions/v1/beats`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', apikey: publishableKey },
    body: JSON.stringify({ initData, action, ...payload }),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string }
    throw Object.assign(new Error(result.error || `Ошибка облака (${response.status})`), { status: response.status })
  }
  return response
}

async function call<T>(initData: string, action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  const response = await requestBeatAction(initData, action, payload, signal)
  return response.json().catch(() => ({})) as Promise<T>
}

export async function loadTelegramAudioUrl(initData: string, beatId: string, signal: AbortSignal) {
  const { grant } = await call<{ grant: string }>(initData, 'telegram-audio-grant', { beatId }, signal)
  return projectUrl + '/functions/v1/beats/telegram-audio?' + new URLSearchParams({ grant })
}

export async function loadTelegramImportFile(initData: string, beatId: string, kind: 'audio' | 'cover') {
  try {
    const response = await requestBeatAction(initData, 'telegram-import-file', { beatId, kind }, AbortSignal.timeout(45_000))
    const blob = await response.blob()
    const name = kind === 'cover' ? 'telegram-cover.jpg' : blob.type === 'audio/wav' ? 'telegram-audio.wav' : 'telegram-audio.mp3'
    return new File([blob], name, { type: blob.type })
  } catch (failure) {
    if (failure instanceof TypeError || (failure instanceof DOMException && failure.name === 'TimeoutError')) {
      throw new Error('Не удалось получить файл из Telegram. Повтори попытку или выбери файл с устройства.')
    }
    throw failure
  }
}

async function signedUpload(path: string, token: string, file: File): Promise<void> {
  if (!projectUrl) throw new Error('Облако ещё не подключено')
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${projectUrl}/storage/v1/object/upload/sign/beat-previews/${encodedPath}?token=${encodeURIComponent(token)}`, {
    method: 'PUT',
    headers: { 'content-type': file.type },
    body: file,
  })
  if (!response.ok) throw new Error(`Не удалось загрузить ${file.name}`)
}

export type BeatCursor = { id: string; createdAt: string }

export async function loadCloudBeats(initData: string, signal?: AbortSignal, cursor?: BeatCursor) {
  const result = await call<{ beats: CloudBeat[]; next?: BeatCursor | null }>(initData, 'list', { cursor }, signal)
  return { beats: result.beats.map((beat) => ({ ...beat, cloud: true as const })), next: result.next ?? null }
}

export type TelegramImportSuggestion = { channel: string; lastId: number; count: number }

export function importPendingTelegramAudio(initData: string, channel: string, through: number, asLoops: boolean, after?: number) {
  return call<{ added: number; unavailable: number; next: number | null }>(
    initData, 'telegram-import-pending', { channel, through, after, asLoops }, AbortSignal.timeout(45_000),
  )
}

export function loadTelegramImportSuggestions(initData: string, signal?: AbortSignal) {
  return call<{ suggestions: TelegramImportSuggestion[] }>(initData, 'telegram-import-suggestions', {}, signal)
}

export type TelegramImportTrack = { id: number; name: string; title: string; date: string; url: string; group: string | null; exists: boolean; bpm?: string; key?: string }
export type TelegramImportPreview = { tracks: TelegramImportTrack[]; next: number | null; scanned: number; total: number }

export function previewTelegramImport(initData: string, channel: string, first: string, last: string, cursor?: number) {
  return call<TelegramImportPreview>(initData, 'telegram-import-preview', { channel, first, last, cursor })
}

export function saveTelegramImport(initData: string, channel: string, ids: number[], asLoops = false) {
  return call<{ added: number; skipped: number; savedIds: number[] }>(initData, 'telegram-import-save', { channel, ids, asLoops })
}

export async function createCloudBeat(initData: string, beat: StoredBeat, audio: File, cover?: File): Promise<string> {
  const plan = await call<UploadPlan>(initData, 'prepare', {
    audioName: audio.name, audioSize: audio.size,
    coverType: cover?.type, coverSize: cover?.size,
  })
  await signedUpload(plan.audioPath, plan.audioToken, audio)
  if (cover && plan.coverPath && plan.coverToken) await signedUpload(plan.coverPath, plan.coverToken, cover)
  await call(initData, 'create', {
    id: plan.id, beat, audioName: audio.name, audioSize: audio.size,
    audioPath: plan.audioPath, coverPath: plan.coverPath,
  })
  return plan.id
}

export type PublicationLinks = Partial<Pick<StoredBeat, 'telegramLink' | 'youtubeLink'>>

export async function updateCloudBeat(initData: string, beat: StoredBeat, publicationLinks?: PublicationLinks): Promise<void> {
  await call(initData, 'update', { id: beat.id, beat, publicationLinks })
}

export async function replaceCloudCover(initData: string, id: string, file: File): Promise<void> {
  const plan = await call<{ path: string; token: string }>(initData, 'prepare-cover', { id, type: file.type, size: file.size })
  await signedUpload(plan.path, plan.token, file)
  await call(initData, 'commit-cover', { id, path: plan.path })
}

export async function deleteCloudBeat(initData: string, id: string): Promise<void> {
  await call(initData, 'delete', { id })
}

export async function remoteFile(url: string, name: string): Promise<File> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Не удалось загрузить файл из облака')
  const blob = await response.blob()
  return new File([blob], name, { type: blob.type })
}

export type TelegramPublication = { url: string; saved: boolean; warnings: string[]; beatIds?: string[] }
export type TelegramAttempt = { id: string; channel: string; beatIds: string[]; coverSent: boolean; retryAfter: number;
  stage: 'cover_ready' | 'cover_sending' | 'audio_ready' | 'audio_sending' | 'audio_sent' | 'done' }

export function activeTelegramPublication(initData: string) {
  return call<{ attempt: TelegramAttempt | null; trackCreditsSupported?: boolean }>(initData, 'telegram-publication-active')
}

export function resumeTelegramPublication(initData: string, attemptId: string) {
  return call<TelegramPublication>(initData, 'telegram-publication-resume', { attemptId })
}

export function resetTelegramPublication(initData: string, attemptId: string) {
  return call<{ reset: boolean }>(initData, 'telegram-publication-reset', { attemptId })
}

export async function publishCloudTelegram(initData: string, payload: {
  channel: string
  beatIds: string[]
  trackCredits?: string[]
  attemptId: string
  caption: string
  useSavedCover?: boolean
  coverCaption?: string
  republish?: boolean
  cover?: string
}): Promise<TelegramPublication> {
  return call(initData, 'publish-telegram', payload)
}

export type ChannelProfile = { title?: string; username?: string | null; avatar?: string | null; subscribers?: number | null; needsAccess?: boolean; canManageSchedule?: boolean }

export function loadTelegramChannelProfile(initData: string, channel: string) {
  return call<ChannelProfile>(initData, 'telegram-channel-profile', { channel })
}

export type StatsPlatform = 'youtube' | 'telegram'
export type PostMetrics = { views: number | null; likes?: number | null; reactions?: number | null; comments?: number | null; forwards?: number | null }
export type PlatformStats = {
  entries: (PostMetrics & { beatId: string; link: string; restricted?: boolean; mediaKey?: string | null; channel?: string; visibility?: string })[]
  totals: PostMetrics
  videosWithViews: number
  linkedVideos: number
  unsupported?: boolean
  restricted?: boolean
  fetchedAt: string
  series?: { day: string; views: number }[] | null
}

export type SaleCurrency = 'RUB' | 'USD' | 'EUR'
export type SaleType = 'lease' | 'exclusive' | 'custom' | 'other'
export type ProducerDeal = {
  id: string; title: string; contact: string; chat_url: string | null; amount_minor: number | null; currency: SaleCurrency
  notes: string; created_at: string; updated_at: string; completed_at: string | null
  beat_id: string | null; sale_type: SaleType | null; follow_up_on: string | null; follow_up_action: string | null
}
export type DealInput = {
  id: string; expectedUpdatedAt?: string; title: string; contact: string; chat: string; amountMinor: number | null
  currency: SaleCurrency; notes: string; completed: boolean
  beatId: string | null; saleType: SaleType | null; followUpOn: string | null; followUpAction: string | null
}
export function loadProducerDeals(initData: string, signal: AbortSignal, beatId?: string) {
  return call<{ deals: ProducerDeal[] }>(initData, 'sales-list', { beatId }, signal)
}
export function saveProducerDeal(initData: string, deal: DealInput) {
  return call<{ deal: ProducerDeal }>(initData, 'sales-save', deal)
}
export function deleteProducerDeal(initData: string, deal: ProducerDeal) {
  return call<{ ok: boolean }>(initData, 'sales-delete', { id: deal.id, expectedUpdatedAt: deal.updated_at })
}

export type LoopSource = { id: string; title: string; bpm: string; musical_key: string; telegram_source_url: string | null }
export type LoopProducer = { id: string; name: string; channel: string | null }
export type LoopWork = { id: string; title: string; loop_ids: string[]; producer_ids: string[]; release_url: string | null; audio_inbox_id?: string | null }
export type LoopIncoming = {
  id: string; title: string; loop_id: string | null; author_hint: string | null; release_url: string | null; audio_name: string | null
}
export type LoopWorkspaceData = {
  loops: LoopSource[]; producers: LoopProducer[]; works: LoopWork[]; inboxEnabled: boolean; incoming: LoopIncoming[]
}

export function enableLoopInbox(initData: string) {
  return call<{ enabled: boolean }>(initData, 'loop-inbox-enable')
}
export function dismissLoopIncoming(initData: string, id: string) {
  return call<{ ok: boolean }>(initData, 'loop-inbox-dismiss', { id })
}
export async function loadLoopInboxAudio(initData: string, id: string, signal: AbortSignal) {
  const response = await requestBeatAction(initData, 'loop-inbox-audio', { id }, signal)
  return response.blob()
}

export function loadLoopWorkspace(initData: string, signal: AbortSignal) {
  return call<LoopWorkspaceData>(initData, 'loop-workspace', {}, signal)
}
export function addLoopSource(initData: string, id: string) {
  return call<{ loop: LoopSource }>(initData, 'loop-source-add', { id })
}
export function saveLoopProducer(initData: string, producer: { id?: string; name: string; channel: string }) {
  return call<{ producer: LoopProducer }>(initData, 'loop-producer-save', producer)
}
export function saveLoopWork(initData: string, work: { id?: string; inboxId?: string; title: string; loopIds: string[]; producerIds: string[]; releaseUrl: string }) {
  return call<{ work: LoopWork }>(initData, 'loop-work-save', work)
}
export function deleteLoopWork(initData: string, id: string) {
  return call<{ ok: boolean }>(initData, 'loop-work-delete', { id })
}
export function loadLoopChannelStats(initData: string, channel?: string) {
  return call<PlatformStats>(initData, 'loop-channel-stats', { channel })
}

export function loadPlatformStats(initData: string, platform: StatsPlatform, signal: AbortSignal, beatId?: string) {
  return call<PlatformStats>(initData, platform + '-stats', { beatId }, signal)
}

export function loadYoutubeChannelProfile(initData: string) {
  return call<ChannelProfile>(initData, 'youtube-profile')
}

export type TelegramChannel = { id: string; title: string; username: string | null }

export async function loadTelegramChannels(initData: string): Promise<TelegramChannel[]> {
  const result = await call<{ channels: TelegramChannel[] }>(initData, 'list-telegram-channels')
  return result.channels
}

export async function connectTelegramChannel(initData: string, channel: string): Promise<TelegramChannel> {
  const result = await call<{ channel: TelegramChannel }>(initData, 'connect-telegram-channel', { channel })
  return result.channel
}

export async function disconnectTelegramChannel(initData: string, channel: string): Promise<void> {
  await call(initData, 'disconnect-telegram-channel', { channel })
}

export type YoutubeConnection = { configured: boolean; connected: boolean }
export type YoutubeVisibility = 'public' | 'private' | 'unlisted'
export type YoutubeUploadResult = { url: string; saved: boolean; publishAt?: string | null }
export type YoutubeUploadStep = { next: number } | YoutubeUploadResult

export function youtubeConnection(initData: string) {
  return call<YoutubeConnection>(initData, 'youtube-status')
}

export function createYoutubeConnection(initData: string, manageSchedule = false) {
  return call<{ url: string }>(initData, 'youtube-connect', { manageSchedule })
}

export type YoutubeScheduleRefresh = { entries: { url: string; publishAt: string | null }[]; unavailable: number }

export function refreshYoutubeSchedule(initData: string, links: string[]) {
  return call<YoutubeScheduleRefresh>(initData, 'youtube-schedule-refresh', { links })
}

export type YoutubeScheduleResult = { publishAt: string | null; changed: boolean; saved: boolean }

export function changeYoutubeSchedule(initData: string, payload: {
  beatId: string; url: string; expectedPublishAt: string; publishAt: string | null
}) {
  return call<YoutubeScheduleResult>(initData, 'youtube-schedule', payload)
}

export function disconnectYoutube(initData: string) {
  return call<{ connected: boolean }>(initData, 'youtube-disconnect')
}

export function startYoutubeUpload(initData: string, payload: {
  uploadId: string; beatId: string; size: number; mimeType: string; madeForKids: boolean; republish?: boolean
  visibility: YoutubeVisibility; publishAt?: string
}) {
  return call<{ ready: boolean }>(initData, 'youtube-start', payload)
}

export function resumeYoutubeUpload(initData: string, uploadId: string, signal: AbortSignal) {
  return call<YoutubeUploadStep>(initData, 'youtube-resume', { uploadId }, signal)
}

export function sendYoutubeChunk(initData: string, uploadId: string, offset: number, chunk: string, signal: AbortSignal) {
  return call<YoutubeUploadStep>(initData, 'youtube-chunk', { uploadId, offset, chunk }, signal)
}
