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

async function call<T>(initData: string, action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  if (!projectUrl || !publishableKey) throw new Error('Облако ещё не подключено')
  const response = await fetch(`${projectUrl}/functions/v1/beats`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', apikey: publishableKey },
    body: JSON.stringify({ initData, action, ...payload }),
  })
  const result = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw Object.assign(new Error(result.error || `Ошибка облака (${response.status})`), { status: response.status })
  return result as T
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

export async function loadCloudBeats(initData: string, signal?: AbortSignal): Promise<CloudBeat[]> {
  const result = await call<{ beats: CloudBeat[] }>(initData, 'list', {}, signal)
  return result.beats.map((beat) => ({ ...beat, cloud: true }))
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
  return call<{ attempt: TelegramAttempt | null }>(initData, 'telegram-publication-active')
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
export type PostMetrics = { views: number | null; likes?: number | null; reactions?: number | null; comments?: number | null; forwards?: number | null; saves?: number | null }
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

export function loadPlatformStats(initData: string, platform: StatsPlatform, signal: AbortSignal) {
  return call<PlatformStats>(initData, platform + '-stats', {}, signal)
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
