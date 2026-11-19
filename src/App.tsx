import xeintyLogo from './assets/xeinty-logo.png'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, AudioLines, Check, ChevronRight, CircleHelp, Clipboard, Disc3, Download, ExternalLink, FileAudio2, ImagePlus, Link2, ListMusic, Music2, Ellipsis, Pause, Play, Plus, Radio, Send, Trash2, UploadCloud } from 'lucide-react'
import { getTelegramWebApp } from './telegram'
import { makeStaticVideo, type VideoStage } from './video'
import { saveVideoFile } from './save-video'
import { deleteStoredBeat, loadStoredBeats, saveBeatCover, saveBeatMetadata, saveNewBeat, type StoredBeat } from './beat-store'
import { cloudConfigured, connectTelegramChannel, disconnectTelegramChannel, loadTelegramChannels, type TelegramChannel, createCloudBeat, deleteCloudBeat, loadCloudBeats, publishCloudTelegram, remoteFile, replaceCloudCover, updateCloudBeat } from './cloud-beats'
import { canonicalKeyOptions, normalizeMusicKey } from './music-key'
import { parseAudioName } from './filename'
import { DirectTelegramPublication, readPublicationCover, OwnYoutubeVideo } from './publication'

import { CaptionTemplates, CaptionTools, readCaptionPreferences, TelegramChannels, } from './telegram-settings'

type Screen = 'library' | 'create' | 'publish' | 'channels' | 'more' | 'templates' | 'overview' | 'detail'
type DetailTab = 'data' | 'stats'
type Beat = Omit<StoredBeat, 'createdAt'> & {
  createdAt?: number; cover: number; coverUrl?: string; audioUrl?: string; audioFile?: File; coverFile?: File; isDemo?: boolean; cloud?: boolean
}

function storedBeat(beat: Beat): StoredBeat {
  const { cover: _cover, coverUrl: _coverUrl, audioUrl: _audioUrl, audioFile: _audioFile, coverFile: _coverFile, isDemo: _isDemo, cloud: _cloud, ...record } = beat
  return { ...record, createdAt: beat.createdAt ?? Date.now() }
}

const demoBeats: Beat[] = [
  { id: 'no-signal', title: 'NO SIGNAL', bpm: '138', key: 'F# minor', tags: 'dark trap · ambient · type beat', status: 'Черновик', cover: 0, telegramCaption: 'NO SIGNAL — 138 BPM / F# minor\n\nDark trap · ambient type beat\n\n#typebeat #darktrap #beats', youtubeDescription: 'NO SIGNAL | Dark Trap Type Beat\n\nBPM: 138 · Key: F# minor\n\nДля связи и покупки бита: @yourname', youtubeKeywords: 'dark trap type beat, ambient trap beat, no signal beat', telegramLink: '', youtubeLink: '', isDemo: true },
  { id: 'silhouette', title: 'SILHOUETTE', bpm: '92', key: 'C minor', tags: 'r&b · nocturnal · type beat', status: 'К публикации', cover: 1, telegramCaption: 'SILHOUETTE — 92 BPM / C minor\n\nR&B · nocturnal type beat\n\n#typebeat #rnb #beats', youtubeDescription: 'SILHOUETTE | R&B Type Beat\n\nBPM: 92 · Key: C minor\n\nДля связи и покупки бита: @yourname', youtubeKeywords: 'rnb type beat, nocturnal rnb beat, silhouette beat', telegramLink: '', youtubeLink: '', isDemo: true },
  { id: 'after-hours', title: 'AFTER HOURS', bpm: '105', key: 'A minor', tags: 'melodic · trap soul · type beat', status: 'Черновик', cover: 2, telegramCaption: 'AFTER HOURS — 105 BPM / A minor\n\nMelodic trap soul type beat\n\n#typebeat #trapsoul #beats', youtubeDescription: 'AFTER HOURS | Melodic Trap Soul Type Beat\n\nBPM: 105 · Key: A minor\n\nДля связи и покупки бита: @yourname', youtubeKeywords: 'melodic trap type beat, trap soul beat, after hours beat', telegramLink: '', youtubeLink: '', isDemo: true },
]

function Cover({ beat, className = '' }: { beat: Beat; className?: string }) {
  const empty = !beat.isDemo && !beat.coverUrl
  return <div className={`cover ${empty ? 'cover--empty' : `cover--${beat.cover}`} ${className}`} style={beat.coverUrl ? { backgroundImage: `url("${beat.coverUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} role="img" aria-label={empty ? `Обложка для ${beat.title} не добавлена` : `Обложка ${beat.title}`}>{empty && <Music2 size={21} />}</div>
}

const waveHeights = [13, 18, 11, 22, 17, 26, 14, 20, 30, 16, 24, 19, 34, 20, 14, 27, 18, 32, 24, 15, 22, 40, 27, 18, 30, 16, 26, 37, 22, 13, 28, 20, 32, 18, 25, 15, 23, 36, 18, 29, 16, 22, 13, 27, 19, 31, 15, 22]

function projectCount(count: number) {
  const form = new Intl.PluralRules('ru').select(count)
  return `${count} ${form === 'one' ? 'проект' : form === 'few' ? 'проекта' : 'проектов'}`
}

function Waveform({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  const heights = compact ? waveHeights.filter((_, index) => index % 2 === 0) : waveHeights
  return <div className={`waveform ${light ? 'waveform--light' : ''} ${compact ? 'waveform--compact' : ''}`} aria-hidden="true">{heights.map((height, index) => <i key={index} style={{ height: compact ? Math.max(7, height * .55) : height }} />)}</div>
}

function KeyPicker({ value, onChange, onCommit, label = 'Тональность' }: { value: string; onChange: (value: string) => void; onCommit?: (value: string) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const filtered = canonicalKeyOptions.filter((key) => key.toLowerCase().includes(value.toLowerCase()))
  return <div className="key-picker">
    <input aria-label={label} role="combobox" aria-expanded={open} aria-controls="key-picker-options" autoComplete="off" placeholder="Например, Cm или До минор" value={value === '—' ? '' : value} onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true) }} onBlur={() => { window.setTimeout(() => setOpen(false), 100); if (onCommit) window.setTimeout(() => onCommit(value), 0) }} />
    {open && <div className="key-picker-menu" id="key-picker-options" role="listbox" onMouseDown={(event) => event.preventDefault()}>
      <div className="key-picker-heading">МАЖОР</div>
      {filtered.filter((key) => key.endsWith('major')).map((key) => <button type="button" role="option" key={key} aria-selected={key === value} onClick={() => { onChange(key); setOpen(false) }}>{key}</button>)}
      <div className="key-picker-heading">МИНОР</div>
      {filtered.filter((key) => key.endsWith('minor')).map((key) => <button type="button" role="option" key={key} aria-selected={key === value} onClick={() => { onChange(key); setOpen(false) }}>{key}</button>)}
      {filtered.length === 0 && <p className="key-picker-empty">Не нашёл. Можно ввести `Cm`, `C#m` или «До минор».</p>}
    </div>}
  </div>
}

function App() {
  const [webApp, setWebApp] = useState(getTelegramWebApp)
  const [screen, setScreen] = useState<Screen>('library')
  const [tab, setTab] = useState<DetailTab>('data')
  const [publishMode, setPublishMode] = useState<'single' | 'batch'>('single')
  const [beats, setBeats] = useState<Beat[]>(demoBeats)
  const [selectedId, setSelectedId] = useState('no-signal')
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ title: '', bpm: '', key: '', tags: '' })
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([])
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [batchCaption, setBatchCaption] = useState('')
  const [batchCoverCaption, setBatchCoverCaption] = useState('')
  const [channels, setChannels] = useState<TelegramChannel[]>([])
  const [channelLoadError, setChannelLoadError] = useState('')
  const [captionPreferences, setCaptionPreferences] = useState(readCaptionPreferences)
  const [batchCoverFile, setBatchCoverFile] = useState<File | null>(null)
  const [includeTelegramCover, setIncludeTelegramCover] = useState(() => localStorage.getItem('xeinty-telegram-cover') !== 'false')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [publicationPlatform, setPublicationPlatform] = useState<'telegram' | 'youtube'>('telegram')
  const [videoSource, setVideoSource] = useState<'generated' | 'own'>('generated')
  const [videoStage, setVideoStage] = useState<VideoStage | null>(null)
  const [videoError, setVideoError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingBeat, setSavingBeat] = useState(false)
  const [videoResult, setVideoResult] = useState<{ beatId: string; url: string; blob: Blob; size: number; seconds: number } | null>(null)
  const videoUrlRef = useRef<string | null>(null)
  const fileUrlsRef = useRef<string[]>([])
  const playerRef = useRef<HTMLAudioElement>(null)
  const cloudSaveTimersRef = useRef(new Map<string, number>())
  const pendingCloudWrites = useRef(new Map<string, Promise<void>>())
  const selected = beats.find((beat) => beat.id === selectedId) ?? beats[0]
  const latest = beats[0]
  const savedAudioBeats = beats.filter((beat) => !beat.isDemo && (beat.audioFile || beat.audioUrl))
  const batchBeats = batchSelectedIds.flatMap((id) => savedAudioBeats.filter((beat) => beat.id === id))
  const cloudAvailable = cloudConfigured() && Boolean(webApp?.initData)

  useEffect(() => {
    if (!cloudAvailable || !webApp?.initData) return
    let active = true
    void loadTelegramChannels(webApp.initData).then((list) => {
      if (active) setChannels(list)
    }).catch(() => {
      if (active) setChannelLoadError('Не удалось загрузить каналы. Открой приложение заново.')
    })
    return () => { active = false }
  }, [cloudAvailable, webApp])

  useEffect(() => {
    try { localStorage.setItem('xeinty-telegram-caption-preferences', JSON.stringify(captionPreferences)) }
    catch { /* Storage can be unavailable inside some WebViews. */ }
  }, [captionPreferences])

  function rememberHashtags(...captions: string[]) {
    const tags = captions.join(' ').match(/#[\p{L}\p{N}_]+/gu) ?? []
    if (!tags.length) return
    setCaptionPreferences((previous) => {
      const hashtags = [...new Map([...previous.hashtags].reverse().concat(tags).map((tag) => [tag.toLowerCase(), tag])).values()].reverse().slice(0, 12)
      // Move tags from the latest caption to the front, including previously used tags.
      const used = new Map(tags.map((tag) => [tag.toLowerCase(), tag]))
      return { ...previous, hashtags: [...used.values(), ...hashtags.filter((tag) => !used.has(tag.toLowerCase()))].slice(0, 12) }
    })
  }

  function captionTools(caption: string, onChange: (value: string) => void, youtube = false) {
    return <CaptionTools caption={caption} onChange={onChange} preferences={captionPreferences} youtube={youtube} />
  }

  async function addChannel(address: string) {
    if (!webApp?.initData) return
    const channel = await connectTelegramChannel(webApp.initData, address)
    setChannels((all) => [...all.filter((item) => item.id !== channel.id), channel].sort((a, b) => a.title.localeCompare(b.title)))
    setChannelLoadError('')
  }

  async function removeChannel(id: string) {
    if (!webApp?.initData) return
    await disconnectTelegramChannel(webApp.initData, id)
    setChannels((all) => all.filter((item) => item.id !== id))
  }

  function toggleTelegramCover(enabled: boolean) {
    setIncludeTelegramCover(enabled)
    localStorage.setItem('xeinty-telegram-cover', String(enabled))
  }

  function chooseAudio(file: File | null) {
    setAudioFile(file)
    if (file) {
      const parsed = parseAudioName(file.name)
      setForm({ title: parsed.title, bpm: parsed.bpm, key: parsed.key, tags: parsed.tags })
    }
  }

  function toggleBatchBeat(id: string) {
    const next = batchSelectedIds.includes(id) ? batchSelectedIds.filter((item) => item !== id) : [...batchSelectedIds, id]
    if (next.length + batchFiles.length > 10) { notify('В одну пачку можно добавить не больше 10 аудиофайлов'); return }
    setBatchSelectedIds(next)
  }

  function chooseBatch(files: File[]) {
    if (batchSelectedIds.length + files.length > 10) { notify('В одну пачку можно добавить не больше 10 аудиофайлов'); return }
    setBatchFiles(files)
  }

  useEffect(() => {
    if (webApp) return
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-web-app.js'
    script.async = true
    script.onload = () => setWebApp(getTelegramWebApp())
    document.head.appendChild(script)
    return () => { script.onload = null; script.remove() }
  }, [webApp])

  useEffect(() => {
    if (!webApp) return
    webApp.setHeaderColor?.('#151520')
    webApp.setBackgroundColor?.('#151520')
    if (webApp.requestFullscreen) webApp.requestFullscreen()
    else webApp.expand()
    webApp.ready()
  }, [webApp])

  useEffect(() => () => { if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current) }, [])

  useEffect(() => {
    let cancelled = false
    void loadStoredBeats().then((saved) => {
      if (cancelled) return
      const restored: Beat[] = saved.map(({ beat, files }) => {
        const coverUrl = files?.coverFile ? URL.createObjectURL(files.coverFile) : undefined
        const audioUrl = files?.audioFile ? URL.createObjectURL(files.audioFile) : undefined
        if (coverUrl) fileUrlsRef.current.push(coverUrl)
        if (audioUrl) fileUrlsRef.current.push(audioUrl)
        return { ...beat, key: normalizeMusicKey(beat.key) ?? beat.key, cover: 0, coverUrl, audioUrl, audioFile: files?.audioFile, coverFile: files?.coverFile }
      })
      setBeats((current) => [...restored.filter((beat) => !current.some((item) => item.id === beat.id)), ...current])
    }).catch(() => notify('Не удалось открыть хранилище на этом устройстве'))
    return () => { cancelled = true; fileUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)) }
  }, [])

  useEffect(() => {
    if (!webApp?.initData || !cloudConfigured()) return
    let cancelled = false
    void loadCloudBeats(webApp.initData).then((saved) => {
      if (!cancelled) setBeats((current) => [
        ...saved.map((beat) => ({ ...beat, key: normalizeMusicKey(beat.key) ?? beat.key, cover: 0 })),
        ...current.filter((beat) => !saved.some((remote) => remote.id === beat.id)),
      ])
    }).catch((error) => { if (!cancelled) notify(error instanceof Error ? error.message : 'Не удалось загрузить биты из облака') })
    return () => { cancelled = true }
  }, [webApp])

  useEffect(() => {
    if (screen === 'publish' && selected.isDemo) {
      const firstOwnBeat = beats.find((beat) => !beat.isDemo)
      if (firstOwnBeat) setSelectedId(firstOwnBeat.id)
    }
  }, [beats, screen, selected])

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3500) }
  function navigate(next: Screen) {
    playerRef.current?.pause()
    setIsPlaying(false)
    if (next === 'publish' && selected.isDemo) {
      const firstOwnBeat = beats.find((beat) => !beat.isDemo)
      if (firstOwnBeat) setSelectedId(firstOwnBeat.id)
    }
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function openBeat(beat: Beat, nextTab: DetailTab = 'data') { setSelectedId(beat.id); setTab(nextTab); setConfirmDelete(false); navigate('detail') }
  function openPublish(beat?: Beat, mode: 'single' | 'batch' = 'single') { if (beat && !beat.isDemo) setSelectedId(beat.id); setPublishMode(mode); setPublicationPlatform('telegram'); navigate('publish') }
  async function persistBeat(beat: Beat) {
    if (!beat.cloud) return saveBeatMetadata(storedBeat(beat))
    if (!webApp?.initData) throw new Error('Telegram session required')
    const initData = webApp.initData
    const pending = pendingCloudWrites.current.get(beat.id)
    const write = (pending?.catch(() => {}) ?? Promise.resolve()).then(() => updateCloudBeat(initData, storedBeat(beat)))
    pendingCloudWrites.current.set(beat.id, write)
    try { await write } finally {
      if (pendingCloudWrites.current.get(beat.id) === write) pendingCloudWrites.current.delete(beat.id)
    }
  }

  async function publishTelegram(channel: string, targets: Beat[], caption: string, cover?: File, useSavedCover = false, coverCaption = '') {
    if (!webApp?.initData) throw new Error('Открой XEINTY через Telegram.')
    if (caption.length > 1024) throw new Error('Сократи подпись до 1024 символов.')
    const beatIds = targets.map((beat) => beat.id)
    for (const beat of targets) {
      const timer = cloudSaveTimersRef.current.get(beat.id)
      if (timer !== undefined) {
        window.clearTimeout(timer)
        cloudSaveTimersRef.current.delete(beat.id)
        await persistBeat(beat)
      } else {
        await pendingCloudWrites.current.get(beat.id)
      }
    }
    const result = await publishCloudTelegram(webApp.initData, {
      channel, beatIds, caption, useSavedCover, coverCaption, cover: cover ? await readPublicationCover(cover) : undefined,
    })
    rememberHashtags(caption, coverCaption)
    if (result.saved) setBeats((all) => all.map((beat) => beatIds.includes(beat.id) ? { ...beat, telegramLink: result.url } : beat))
    return result
  }

  function updateBeat(patch: Partial<Beat>) {
    const updated = { ...selected, ...patch }
    setBeats((all) => all.map((beat) => beat.id === selected.id ? updated : beat))
    if (updated.cloud && webApp?.initData) {
      const existing = cloudSaveTimersRef.current.get(updated.id)
      if (existing) window.clearTimeout(existing)
      const timer = window.setTimeout(() => {
        cloudSaveTimersRef.current.delete(updated.id)
        void persistBeat(updated).catch(() => notify('Изменения не сохранились в облаке'))
      }, 500)
      cloudSaveTimersRef.current.set(updated.id, timer)
    }
    else if (!updated.isDemo) void saveBeatMetadata(storedBeat(updated)).catch(() => notify('Изменения не сохранились на устройстве'))
  }
  function togglePreview() {
    if (!latest.audioUrl || !playerRef.current) return
    if (isPlaying) { playerRef.current.pause(); setIsPlaying(false) }
    else { void playerRef.current.play().then(() => setIsPlaying(true)).catch(() => notify('Не удалось воспроизвести файл')) }
  }
  async function createVideo() {
    if (videoStage || (!selected.audioFile && !selected.audioUrl) || (!selected.coverFile && !selected.coverUrl)) return
    setVideoError('')
    setVideoStage('preparing')
    const started = performance.now()
    try {
      const audio = selected.audioFile ?? await remoteFile(selected.audioUrl!, selected.audioName ?? 'preview.mp3')
      const cover = selected.coverFile ?? await remoteFile(selected.coverUrl!, 'cover.jpg')
      const blob = await makeStaticVideo(audio, cover, setVideoStage)
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
      const url = URL.createObjectURL(blob)
      videoUrlRef.current = url
      setVideoResult({ beatId: selected.id, url, blob, size: blob.size, seconds: Math.round((performance.now() - started) / 1000) })
    } catch (error) {
      console.error('Video export failed:', error)
      setVideoError(error instanceof Error ? error.message : typeof error === 'string' ? error : 'Не удалось собрать видео на этом устройстве')
    } finally {
      setVideoStage(null)
    }
  }
  async function saveVideo() {
    if (!videoResult || videoResult.beatId !== selected.id) return
    setVideoError('')
    const filename = `${selected.title.replace(/[^a-z0-9а-яё-]+/gi, '-').toLowerCase()}.mp4`
    try {
      const result = await saveVideoFile(videoResult.blob, filename)
      if (result === 'saved') notify('MP4 сохранён в выбранную папку')
      if (result === 'shared') notify('В меню выбери «Сохранить в Файлы»')
      if (result === 'unsupported') setVideoError('Сохранение файлов недоступно в этом Telegram. Попробуй «Обычная загрузка» или открой XEINTY в браузере.')
    } catch (error) {
      console.error('Video save failed:', error)
      setVideoError('Не удалось открыть меню сохранения. Попробуй «Обычная загрузка» или открой XEINTY в браузере.')
    }
  }
  async function deleteBeat() {
    if (selected.isDemo || deleting) return
    setDeleting(true)
    try {
      if (selected.cloud && webApp?.initData) await deleteCloudBeat(webApp.initData, selected.id)
      else await deleteStoredBeat(selected.id)
      if (selected.coverUrl?.startsWith('blob:')) URL.revokeObjectURL(selected.coverUrl)
      if (selected.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(selected.audioUrl)
      if (videoResult?.beatId === selected.id) {
        URL.revokeObjectURL(videoResult.url)
        setVideoResult(null)
      }
      setBeats((all) => all.filter((beat) => beat.id !== selected.id))
      setConfirmDelete(false)
      navigate('library')
      notify(selected.cloud ? 'Бит удалён из облака' : 'Бит удалён с этого устройства')
    } catch {
      notify(selected.cloud ? 'Не удалось удалить бит из облака' : 'Не удалось удалить бит с устройства')
    } finally {
      setDeleting(false)
    }
  }
  async function migrateBeat() {
    if (!cloudAvailable || !webApp?.initData || selected.isDemo || selected.cloud || savingBeat) return
    if (!selected.audioFile || !/\.mp3$/i.test(selected.audioFile.name)) {
      notify('Для переноса нужен MP3 этого бита на текущем устройстве')
      return
    }
    setSavingBeat(true)
    try {
      const id = await createCloudBeat(webApp.initData, storedBeat(selected), selected.audioFile, selected.coverFile)
      const audioUrl = URL.createObjectURL(selected.audioFile)
      const coverUrl = selected.coverFile ? URL.createObjectURL(selected.coverFile) : undefined
      fileUrlsRef.current.push(audioUrl)
      if (coverUrl) fileUrlsRef.current.push(coverUrl)
      setBeats((all) => [{ ...selected, id, audioUrl, coverUrl, cloud: true }, ...all])
      notify('Облачная копия создана. Локальный бит сохранён.')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Не удалось перенести бит')
    } finally {
      setSavingBeat(false)
    }
  }
  async function changeCover(file?: File) {
    if (!file || selected.isDemo) return
    const previousUrl = selected.coverUrl
    const coverUrl = URL.createObjectURL(file)
    try {
      if (selected.cloud) { if (!webApp?.initData) throw new Error("Открой приложение в Telegram"); await replaceCloudCover(webApp.initData, selected.id, file) } else await saveBeatCover(selected.id, file)
      setBeats((all) => all.map((beat) => beat.id === selected.id ? { ...beat, coverFile: file, coverUrl } : beat))
      if (previousUrl?.startsWith('blob:')) URL.revokeObjectURL(previousUrl)
      fileUrlsRef.current.push(coverUrl)
      notify('Обложка обновлена')
    } catch {
      URL.revokeObjectURL(coverUrl)
      notify('Не удалось сохранить обложку')
    }
  }
  async function addBeat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.title.trim() || savingBeat) return
    const normalizedKey = normalizeMusicKey(form.key)
    if (form.key.trim() && normalizedKey === null) { notify('Не распознал тональность. Например: Cm, C#m или До минор.'); return }
    if (cloudAvailable && (!audioFile || !/\.mp3$/i.test(audioFile.name))) {
      notify('Для облака выбери MP3. WAV останется у тебя для работы с проектом.')
      return
    }
    setSavingBeat(true)
    const title = form.title.trim().toUpperCase()
    const beat: Beat = {
      id: `beat-${Date.now()}`, createdAt: Date.now(), title, bpm: form.bpm || '—', key: normalizedKey || '—',
      tags: form.tags.trim() || 'без тегов', status: 'Черновик', cover: 0,
      coverUrl: coverFile ? URL.createObjectURL(coverFile) : undefined,
      audioUrl: audioFile ? URL.createObjectURL(audioFile) : undefined, audioName: audioFile?.name, audioFile: audioFile ?? undefined, coverFile: coverFile ?? undefined,
      telegramCaption: '',
      youtubeDescription: '',
      youtubeKeywords: form.tags.trim().replaceAll(' · ', ', '), telegramLink: '', youtubeLink: '',
    }
    try {
      if (cloudAvailable && webApp?.initData && audioFile) {
        beat.id = await createCloudBeat(webApp.initData, storedBeat(beat), audioFile, coverFile ?? undefined)
        beat.cloud = true
      } else {
        await saveNewBeat(storedBeat(beat), { audioFile: audioFile ?? undefined, coverFile: coverFile ?? undefined })
      }
    } catch (error) {
      setSavingBeat(false)
      notify(error instanceof Error ? error.message : 'Не удалось сохранить бит')
      return
    }
    if (beat.coverUrl) fileUrlsRef.current.push(beat.coverUrl)
    if (beat.audioUrl) fileUrlsRef.current.push(beat.audioUrl)
    setBeats((all) => [beat, ...all])
    setForm({ title: '', bpm: '', key: '', tags: '' }); setAudioFile(null); setCoverFile(null)
    setSavingBeat(false)
    openBeat(beat, 'data'); notify(beat.cloud ? 'Бит сохранён в облаке' : 'Черновик сохранён на этом устройстве')
  }
  const nav = [
    { id: 'library' as Screen, label: 'Биты', Icon: ListMusic },
    { id: 'create' as Screen, label: 'Создать', Icon: Plus },
    { id: 'publish' as Screen, label: 'Публикация', Icon: Send },
    { id: 'channels' as Screen, label: 'Каналы', Icon: Radio },
    { id: 'overview' as Screen, label: 'Статистика', Icon: AudioLines },
    { id: 'more' as Screen, label: 'Ещё', Icon: Ellipsis },
  ]

  return <div className="app-shell">
    <div className="app-frame">
      <header className="topbar"><button className="topbar-action topbar-create" onClick={() => navigate('create')} aria-label="Добавить новый бит"><Plus size={20} /></button><button className="wordmark" onClick={() => navigate('library')} aria-label="XEINTY — к библиотеке"><img src={xeintyLogo} alt="" width={48} height={48} /></button><span className="topbar-badge">Демо-версия</span><button className="topbar-action topbar-overview" onClick={() => navigate('overview')} aria-label="Открыть статистику"><AudioLines size={19} /></button></header>
      <div className="workspace">
        <aside className="desktop-rail" aria-label="Навигация"><div className="rail-head"><strong>Рабочее пространство</strong><span>Биты и публикации</span></div><nav>{nav.map(({ id, label, Icon }) => <button key={id} className={screen === id || (screen === 'detail' && id === 'library' || screen === 'templates' && id === 'more') ? 'is-active' : ''} onClick={() => navigate(id)}><Icon size={19} />{label}<ChevronRight size={16} /></button>)}</nav><div className="rail-footer"><AudioLines size={18} /><span>Один бит — все материалы для его публикации.</span></div></aside>
        <main className="main-content" key={screen}>
          {screen === 'library' && <>
            <div className="library-context"><span>Текущий проект</span><span>{projectCount(beats.length)}</span></div>
            <section className="feature-section" aria-label="Текущий бит">
              <div className="feature-card">
                <div className="player-top"><Cover beat={latest} className="feature-cover" /><div className="feature-content"><span className="feature-status">{latest.isDemo ? 'Демо-проект' : latest.status}</span><h2>{latest.title}</h2><p>{latest.bpm} BPM <span>·</span> {latest.key}</p><Waveform light /></div><button className="player-open" onClick={() => openBeat(latest)} aria-label={`Открыть ${latest.title}`}><ChevronRight size={19} /></button></div>
                <div className="player-footer"><span>{latest.audioUrl ? latest.audioName : 'Аудио не загружено'}</span><div className="player-controls">{latest.audioUrl ? <button className="player-play" onClick={togglePreview} aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'} title="Предпрослушать бит">{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button> : <button className="player-publish" onClick={() => openPublish(latest)} aria-label="Подготовить публикацию"><Send size={16} /><span>Публикация</span></button>}<button className="player-next" onClick={() => openBeat(latest)}>Открыть бит <ArrowRight size={16} /></button></div></div>
                {latest.audioUrl && <audio key={latest.id} ref={playerRef} src={latest.audioUrl} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} preload="metadata" />}
              </div>
            </section>
            <section className="tools-section"><div className="section-heading"><h2>Рабочие шаги</h2></div><div className="tool-grid"><button onClick={() => openBeat(latest, 'data')}><ListMusic size={20} /><span>Параметры</span></button><button onClick={() => openPublish(latest)}><Clipboard size={20} /><span>Публикация</span></button><button onClick={() => openBeat(latest, 'stats')}><Link2 size={20} /><span>Статистика</span></button></div></section>
            <button className="upload-banner" onClick={() => navigate('create')}><span className="upload-banner-icon"><UploadCloud size={23} /></span><span><strong>Добавить свой бит</strong><small>Обложка, аудио, BPM и теги</small></span><span className="upload-banner-arrow"><ArrowRight size={18} /></span></button>
            <section className="list-section"><div className="list-header"><div><h2>Недавние проекты</h2></div><span className="demo-pill">{beats.every((beat) => beat.isDemo) ? 'Демо' : 'Демо и черновики'}</span></div><div className="beat-list">{beats.map((beat) => <button className="beat-row" key={beat.id} onClick={() => openBeat(beat)}>{beat.isDemo ? <span className="row-wave"><Waveform compact /></span> : <Cover beat={beat} className="row-cover" />}<span className="row-main"><strong>{beat.title}</strong><small>{beat.bpm} BPM · {beat.key}</small></span><span className="row-meta">{beat.cloud ? 'Облако' : beat.isDemo ? beat.status : 'На устройстве'}</span><ArrowRight className="row-arrow" size={18} /></button>)}</div><p className="demo-note"><CircleHelp size={15} /> {cloudAvailable ? 'Облачные биты доступны в Telegram на других устройствах. Локальные записи можно перенести из карточки бита.' : 'Примеры показывают интерфейс. Пока свои биты хранятся только на этом устройстве.'}</p></section>
          </>}
          {screen === 'create' && <>
            <div className="page-heading"><div><h1>Новый бит</h1><p>Добавь параметры, обложку и аудио для предпросмотра.</p></div></div>
            <form className="create-layout" onSubmit={addBeat}><div className="form-panel"><div className="panel-title"><span>01</span><div><h2>Основное</h2><p>Название и музыкальные параметры</p></div></div><label className="field"><span>Название бита *</span><input required maxLength={40} placeholder="Например, NO SIGNAL" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><div className="field-grid"><label className="field"><span>BPM</span><input type="number" min="1" max="300" placeholder="138" value={form.bpm} onChange={(e) => setForm({ ...form, bpm: e.target.value })} /></label><label className="field"><span>Тональность</span><KeyPicker value={form.key} onChange={(key) => setForm((current) => ({ ...current, key }))} onCommit={(value) => { const key = normalizeMusicKey(value); if (key !== null) setForm((current) => ({ ...current, key })) }} /></label></div><label className="field"><span>Теги и настроение</span><input placeholder="dark trap, ambient, type beat" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label></div>
              <div className="form-panel"><div className="panel-title"><span>02</span><div><h2>Файлы</h2><p>Обложка и аудио для предпросмотра</p></div></div><div className="upload-grid"><label className="upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} /><ImagePlus size={25} /><strong>{coverFile ? coverFile.name : 'Обложка'}</strong><span>PNG, JPG или WEBP</span></label><label className="upload-zone"><input type="file" accept={cloudAvailable ? '.mp3,audio/mpeg' : 'audio/*,.mp3,.wav'} onChange={(e) => chooseAudio(e.target.files?.[0] ?? null)} /><UploadCloud size={26} /><strong>{audioFile ? audioFile.name : 'Аудиофайл'}</strong><span>{cloudAvailable ? 'MP3 до 15 МБ' : 'MP3 или WAV'}</span></label></div><p className="form-hint">{cloudAvailable ? 'MP3 и обложка сохранятся в облаке. WAV и MP4 останутся на твоём устройстве.' : 'Файлы пока сохранятся на этом устройстве. Облако работает при запуске через Telegram после подключения проекта.'}</p></div>
              <div className="create-submit"><button type="submit" className="primary-button" disabled={savingBeat}>{savingBeat ? 'Сохраняем…' : 'Создать черновик'} {!savingBeat && <ArrowRight size={19} />}</button><span>{cloudAvailable ? 'Черновик будет доступен в Telegram на других устройствах.' : 'Черновик сохранится в этом браузере.'}</span></div></form>
          </>}
          {screen === 'publish' && <>
            <div className="page-heading"><div><h1>Публикация</h1><p>Выбери один бит или подготовь пачку для Telegram.</p></div></div>
            <div className="publish-mode" role="tablist" aria-label="Тип публикации"><button role="tab" aria-selected={publishMode === 'single'} className={publishMode === 'single' ? 'is-active' : ''} onClick={() => setPublishMode('single')}>Один бит</button><button role="tab" aria-selected={publishMode === 'batch'} className={publishMode === 'batch' ? 'is-active' : ''} onClick={() => setPublishMode('batch')}>Пачка битов</button></div>
            {publishMode === 'single' && <>
              {beats.some((beat) => !beat.isDemo) ? <div className="publish-beats" role="group" aria-label="Выбрать бит">{beats.filter((beat) => !beat.isDemo).map((beat) => <button key={beat.id} className={selected.id === beat.id ? 'is-active' : ''} onClick={() => setSelectedId(beat.id)}><Cover beat={beat} className="publish-beat-cover" /><span><strong>{beat.title}</strong><small>{beat.bpm} BPM · {beat.key}</small></span><Check size={16} className="publish-beat-check" /></button>)}</div> : <div className="publish-empty"><FileAudio2 size={25} /><strong>Пока нет своих битов</strong><p>Сначала добавь аудиофайл — затем здесь появятся тексты и сборка видео.</p><button className="outline-button" onClick={() => navigate('create')}>Добавить бит <ArrowRight size={17} /></button></div>}
              {!selected.isDemo && <div className="detail-section">
              <div className="section-intro"><h2>Для площадок</h2><p>Подстрой тексты и подготовь видео для выбранного бита.</p></div>
              <div className="platform-switch" role="tablist" aria-label="Площадка"><button role="tab" aria-selected={publicationPlatform === 'telegram'} className={publicationPlatform === 'telegram' ? 'is-active' : ''} onClick={() => setPublicationPlatform('telegram')}>Telegram</button><button role="tab" aria-selected={publicationPlatform === 'youtube'} className={publicationPlatform === 'youtube' ? 'is-active' : ''} onClick={() => setPublicationPlatform('youtube')}>YouTube</button></div>
              <div className="publication-grid">
                <div className={`publication-card ${publicationPlatform === 'telegram' ? 'is-current' : ''}`}><div className="publication-card-head"><div className="platform-icon telegram-icon"><Send size={20} /></div><div><span>TELEGRAM</span><h3>Подпись к посту</h3></div></div><textarea aria-label="Подпись для Telegram" placeholder="Добавить подпись (необязательно)" value={selected.telegramCaption} maxLength={1024} onBlur={(e) => rememberHashtags(e.currentTarget.value)} onChange={(e) => updateBeat({ telegramCaption: e.target.value })} />{captionTools(selected.telegramCaption, (telegramCaption) => updateBeat({ telegramCaption }))}<label className="batch-cover-toggle"><input type="checkbox" checked={includeTelegramCover} onChange={(event) => toggleTelegramCover(event.target.checked)} /><span>Прикладывать обложку к посту</span></label>{cloudAvailable && selected.cloud && <DirectTelegramPublication channels={channels} key={selected.id} publish={(channel) => publishTelegram(channel, [selected], selected.telegramCaption, undefined, includeTelegramCover)} />}
                </div>
                <div className={`publication-card ${publicationPlatform === 'youtube' ? 'is-current' : ''}`}><div className="publication-card-head"><div className="platform-icon youtube-icon">▶</div><div><span>YOUTUBE</span><h3>Описание видео</h3></div></div><textarea aria-label="Описание для YouTube" placeholder="Описание (необязательно)" maxLength={5000} value={selected.youtubeDescription} onChange={(e) => updateBeat({ youtubeDescription: e.target.value })} />{captionTools(selected.youtubeDescription, (youtubeDescription) => updateBeat({ youtubeDescription }), true)}<label className="keywords-field"><span>КЛЮЧЕВЫЕ СЛОВА</span><input aria-label="Ключевые слова YouTube" value={selected.youtubeKeywords} onChange={(e) => updateBeat({ youtubeKeywords: e.target.value })} /></label>

              <div className="video-tool"><label className="field"><span>Видео для YouTube</span><select value={videoSource} onChange={(event) => setVideoSource(event.target.value === 'own' ? 'own' : 'generated')}>
                  <option value="generated">Собрать видео в XEINTY</option>
                  <option value="own">Приложить своё видео</option>
                </select></label>
                {videoSource === 'own' ? <OwnYoutubeVideo key={selected.id} /> : <>
                {(selected.audioFile || selected.audioUrl) && (selected.coverFile || selected.coverUrl) ? <>
                  <button className="primary-button video-action" onClick={createVideo} disabled={videoStage !== null}>{videoStage ? 'Сборка идёт…' : 'Собрать MP4'} {!videoStage && <ArrowRight size={18} />}</button>
                  {videoStage && <p className="video-status" role="status">{videoStage === 'loading' ? 'Загружаем видеодвижок — около 31 МБ…' : videoStage === 'preparing' ? 'Подготавливаем файлы…' : 'Собираем видео. Не закрывай Telegram…'}</p>}
                  {videoError && <p className="video-error" role="alert">{videoError}</p>}
                  {videoResult?.beatId === selected.id && <div className="video-result"><video src={videoResult.url} controls playsInline preload="metadata" aria-label={`Готовое видео ${selected.title}`} /><p>MP4 · {(videoResult.size / 1024 / 1024).toFixed(1)} МБ · сборка {videoResult.seconds} с</p><div className="video-save-actions"><button className="video-download" onClick={saveVideo}><Download size={17} /> Сохранить MP4</button><a className="video-download video-download--secondary" href={videoResult.url} download={`${selected.title.replace(/[^a-z0-9а-яё-]+/gi, '-').toLowerCase()}.mp4`}>Обычная загрузка</a><a className="video-download" href="https://studio.youtube.com/" target="_blank" rel="noreferrer">Открыть YouTube Studio <ExternalLink size={16} /></a></div><p>Загрузи сохранённый MP4 в Studio. Studio откроется отдельно от XEINTY.</p></div>}
                </> : <p className="video-hint">Для сборки MP4 нужны обложка и MP3 или WAV.</p>}
                </>}
              </div>
                </div>
              </div>

            </div>}
            </>}
            {publishMode === 'batch' && <>
              <div className="section-intro"><h2>Пачка битов</h2><p>Несколько аудиофайлов для одного альбома Telegram.</p></div>
            <div className="form-panel batch-panel">
              <div className="batch-library"><div className="batch-library-head"><strong>Выбрать из библиотеки</strong><span>{batchSelectedIds.length + batchFiles.length} / 10</span></div>
                {savedAudioBeats.length ? <div className="batch-beat-list">{savedAudioBeats.map((beat) => <button type="button" key={beat.id} className={batchSelectedIds.includes(beat.id) ? 'is-active' : ''} aria-pressed={batchSelectedIds.includes(beat.id)} onClick={() => toggleBatchBeat(beat.id)}><Cover beat={beat} className="publish-beat-cover" /><span><strong>{beat.title}</strong><small>{beat.bpm} BPM · {beat.key}</small></span><Check size={17} /></button>)}</div> : <div className="batch-library-empty"><p>В библиотеке пока нет битов с аудиофайлом.</p><button type="button" onClick={() => navigate('create')}>Добавить бит <ArrowRight size={15} /></button></div>}
              </div>
              <div className="batch-import"><span>ИЛИ ДОБАВЬ С УСТРОЙСТВА</span><label className="upload-zone"><input type="file" multiple accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={(event) => chooseBatch(Array.from(event.target.files ?? []))} /><FileAudio2 size={26} /><strong>{batchFiles.length ? `${batchFiles.length} аудиофайлов` : 'Выбрать аудиофайлы'}</strong><span>MP3 или WAV</span></label></div>
              {batchFiles.length > 0 && <ol className="batch-file-list">{batchFiles.map((file, index) => <li key={`${index}-${file.name}`}>{file.name}</li>)}</ol>}
              <label className="batch-cover-toggle"><input type="checkbox" checked={includeTelegramCover} onChange={(event) => toggleTelegramCover(event.target.checked)} /><span>Прикладывать обложку к посту</span></label>
              {includeTelegramCover && <label className="upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setBatchCoverFile(event.target.files?.[0] ?? null)} /><ImagePlus size={24} /><strong>{batchCoverFile?.name ?? 'Общая обложка'}</strong><span>Необязательно · JPG, PNG или WEBP</span></label>}
              {includeTelegramCover && batchCoverFile && <>
                <label className="field"><span>Подпись к обложке</span><textarea className="batch-caption" maxLength={1024} value={batchCoverCaption} onBlur={(event) => rememberHashtags(event.currentTarget.value)} onChange={(event) => setBatchCoverCaption(event.target.value)} placeholder="Необязательно" /></label>
                {captionTools(batchCoverCaption, setBatchCoverCaption)}
              </>}
              <label className="field"><span>Подпись к аудио</span><textarea className="batch-caption" maxLength={1024} value={batchCaption} onBlur={(event) => rememberHashtags(event.currentTarget.value)} onChange={(event) => setBatchCaption(event.target.value)} placeholder="Необязательно" /></label>
              {captionTools(batchCaption, setBatchCaption)}

              {cloudAvailable && batchBeats.length > 0 && batchBeats.every((beat) => beat.cloud) && batchFiles.length === 0 &&
                <DirectTelegramPublication channels={channels} key={batchBeats.map((beat) => beat.id).join(',')} publish={(channel) => publishTelegram(channel, batchBeats, batchCaption, includeTelegramCover ? batchCoverFile ?? undefined : undefined, false, includeTelegramCover && batchCoverFile ? batchCoverCaption : '')} />}
              {cloudAvailable && (batchFiles.length > 0 || batchBeats.some((beat) => !beat.cloud)) &&
                <p className="form-hint">Для прямой публикации выбери MP3 из облачной библиотеки. Файлы с устройства можно прикрепить вручную в Telegram.</p>}
              {batchBeats.length > 0 && <p className="form-hint">Ссылка сохранится у всех выбранных битов из библиотеки.</p>}
            </div>
            </>}
          </>}
          {screen === 'more' && <>
            <div className="page-heading"><div><h1>Ещё</h1></div></div>
            <button type="button" className="outline-button" onClick={() => navigate('templates')}>Шаблоны публикаций <ArrowRight size={17} /></button>
          </>}
          {screen === 'templates' && <>
            <button className="back-link" onClick={() => navigate('more')}><ArrowLeft size={17} /> Ещё</button>
            <div className="page-heading"><div><h1>Шаблоны публикаций</h1></div></div>
            <CaptionTemplates templates={captionPreferences.templates} onChange={(templates) => setCaptionPreferences((current) => ({ ...current, templates }))} />
          </>}
          {screen === 'channels' && <>
            <div className="page-heading"><div><h1>Каналы</h1><p>Куда XEINTY может публиковать биты.</p></div></div>
            <TelegramChannels available={cloudAvailable} channels={channels} loadError={channelLoadError} onConnect={addChannel} onDisconnect={removeChannel} />
          </>}
          {screen === 'overview' && <>
            <div className="page-heading"><div><h1>Статистика</h1><p>Статистика всех опубликованных битов.</p></div></div><div className="overview-hero"><div className="overview-symbol"><AudioLines size={28} /></div><h2>Статистика появится позже</h2><p>Просмотры и динамика битов станут доступны после подключения Telegram и YouTube. Сейчас источники не подключены.</p><button className="outline-button" onClick={() => navigate('library')}>Вернуться к битам <ArrowRight size={18} /></button></div><div className="future-grid"><div><Radio size={22} /><strong>Telegram</strong><span>Статистика постов канала</span></div><div><Disc3 size={22} /><strong>YouTube</strong><span>Просмотры и публикации</span></div></div>
          </>}
          {screen === 'detail' && selected && <>
            <button className="back-link" onClick={() => navigate('library')}><ArrowLeft size={17} /> Все биты</button><section className="detail-hero"><Cover beat={selected} className="detail-cover" /><div className="detail-identity"><div className="eyebrow">{selected.isDemo ? 'Демо-проект' : 'Черновик'}</div><h1>{selected.title}</h1><p>{selected.tags}</p><div className="meta-row"><span>{selected.bpm} BPM</span><i /><span>{selected.key}</span></div><div className="detail-audio">{selected.audioUrl ? <><FileAudio2 size={17} /><span>{selected.audioName}</span><audio src={selected.audioUrl} controls preload="metadata" /></> : <><Music2 size={18} /><span>{selected.isDemo ? 'Аудио для этого демо-бита не загружено' : 'Аудиофайл не добавлен'}</span></>}</div></div></section>
            <div className="detail-tabs" role="tablist" aria-label="Разделы бита">{([['data', 'Данные'], ['stats', 'Статистика']] as [DetailTab, string][]).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
            {tab === 'data' && <div className="detail-section"><div className="section-intro"><h2>Данные бита</h2><p>Изменения сохраняются автоматически.</p></div><div className="data-card data-card--editable"><label className="field"><span>НАЗВАНИЕ</span><input aria-label="Название бита" maxLength={120} value={selected.title} onChange={(event) => updateBeat({ title: event.target.value })} /></label><label className="field"><span>ТЕМП (BPM)</span><input aria-label="Темп BPM" type="number" min="1" max="300" value={selected.bpm === '—' ? '' : selected.bpm} onChange={(event) => updateBeat({ bpm: event.target.value || '—' })} /></label><label className="field"><span>ТОНАЛЬНОСТЬ</span><KeyPicker value={selected.key} label="Тональность бита" onChange={(key) => updateBeat({ key })} onCommit={(value) => { const key = normalizeMusicKey(value); if (key !== null) updateBeat({ key: key || "—" }); else { updateBeat({ key: "—" }); notify("Не распознал тональность; выбери вариант из списка.") } }} /></label><label className="field"><span>ТЕГИ</span><input aria-label="Теги бита" value={selected.tags} onChange={(event) => updateBeat({ tags: event.target.value })} /></label></div>{!selected.isDemo && <label className="upload-zone cover-edit"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void changeCover(event.target.files?.[0])} /><ImagePlus size={22} /><strong>Изменить обложку</strong><span>JPG, PNG или WEBP до 2 МБ</span></label>}<p className="detail-footnote">Подписи для площадок редактируются в разделе «Публикация». {selected.cloud ? 'MP3 и обложка хранятся в облаке.' : ''}</p>{!selected.isDemo && <div className="delete-beat">{cloudAvailable && !selected.cloud && <button onClick={migrateBeat} disabled={savingBeat}><UploadCloud size={16} /> {savingBeat ? 'Переносим…' : 'Перенести в облако'}</button>}{confirmDelete ? <><p>Удалить «{selected.title}» вместе с аудио и обложкой {selected.cloud ? 'из облака' : 'с этого устройства'}?</p><div><button onClick={() => setConfirmDelete(false)}>Отмена</button><button className="delete-beat-confirm" onClick={deleteBeat} disabled={deleting}>Подтвердить удаление</button></div></> : <button onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Удалить бит</button>}</div>}</div>}
            {tab === 'stats' && <div className="detail-section"><div className="section-intro"><h2>Статистика</h2><p>Публикации этого бита и их показатели.</p></div><div className="links-panel"><div className="stats-notice"><Radio size={20} /><div><strong>{selected.telegramLink || selected.youtubeLink ? 'Публикации добавлены' : 'Публикаций пока нет'}</strong><p>{selected.telegramLink || selected.youtubeLink ? 'Ссылки сохранены. Подсчёт просмотров появится после подключения Telegram и YouTube.' : 'После публикации добавь ссылку на пост или видео. Просмотры пока не подключены.'}</p></div></div><label className="field"><span>ПОСТ В TELEGRAM</span><div className="link-input"><Link2 size={18} /><input type="url" placeholder="https://t.me/yourchannel/123" value={selected.telegramLink} onChange={(e) => updateBeat({ telegramLink: e.target.value })} />{selected.telegramLink && <a href={selected.telegramLink} target="_blank" rel="noreferrer" aria-label="Открыть Telegram"><ExternalLink size={17} /></a>}</div></label><label className="field"><span>ВИДЕО НА YOUTUBE</span><div className="link-input"><Link2 size={18} /><input type="url" placeholder="https://youtube.com/watch?v=..." value={selected.youtubeLink} onChange={(e) => updateBeat({ youtubeLink: e.target.value })} />{selected.youtubeLink && <a href={selected.youtubeLink} target="_blank" rel="noreferrer" aria-label="Открыть YouTube"><ExternalLink size={17} /></a>}</div></label><p className="form-hint">{selected.cloud ? 'Ссылки сохраняются в облаке.' : 'Ссылки сохраняются на этом устройстве.'}</p></div></div>}
          </>}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Главная навигация">{nav.filter(({ id }) => id !== 'overview').map(({ id, label, Icon }) => <button key={id} className={screen === id || (screen === 'detail' && id === 'library' || screen === 'templates' && id === 'more') ? 'is-active' : ''} onClick={() => navigate(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>
      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    </div>
  </div>
}

export default App
