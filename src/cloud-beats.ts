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

async function call<T>(initData: string, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!projectUrl || !publishableKey) throw new Error('Облако ещё не подключено')
  const response = await fetch(`${projectUrl}/functions/v1/beats`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: publishableKey },
    body: JSON.stringify({ initData, action, ...payload }),
  })
  const result = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(result.error || `Ошибка облака (${response.status})`)
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

export async function loadCloudBeats(initData: string): Promise<CloudBeat[]> {
  const result = await call<{ beats: CloudBeat[] }>(initData, 'list')
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

export async function updateCloudBeat(initData: string, beat: StoredBeat): Promise<void> {
  await call(initData, 'update', { id: beat.id, beat })
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

export type TelegramPublication = { url: string; saved: boolean; warnings: string[] }

export async function publishCloudTelegram(initData: string, payload: {
  channel: string
  beatIds: string[]
  caption: string
  useSavedCover?: boolean
  coverCaption?: string
  cover?: string
}): Promise<TelegramPublication> {
  return call(initData, 'publish-telegram', payload)
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
