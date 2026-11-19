import { YoutubeChannelSettings, YoutubeUpload } from './youtube-upload'
import { getBeatPublications, PublicationHistory, rememberPublication } from './publication-history'
import { usePlatformStats, StatsOverview } from './platform-stats'
import xeintyLogo from './assets/xeinty-logo.png'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, AudioLines, Check, ChevronRight, CircleHelp, Clipboard, Download, ExternalLink, FileAudio2, ImagePlus, Link2, ListMusic, Music2, Ellipsis, Plus, Radio, Send, Trash2, UploadCloud } from 'lucide-react'
import { AudioDock, PlayPauseIcon, useAudioPlayer } from './audio-player'
import { getTelegramWebApp } from './telegram'
import { makeStaticVideo, videoProfileLabel, type VideoStage } from './video'
import { saveVideoFile } from './save-video'
import { deleteStoredBeat, loadStoredBeats, saveBeatCover, saveBeatMetadata, saveNewBeat, type StoredBeat } from './beat-store'
import { cloudConfigured, connectTelegramChannel, disconnectTelegramChannel, loadTelegramChannels, type TelegramChannel, type PublicationLinks, createCloudBeat, deleteCloudBeat, loadCloudBeats, publishCloudTelegram, remoteFile, replaceCloudCover, updateCloudBeat } from './cloud-beats'
import { normalizeMusicKey } from './music-key'
import { Dropdown, KeyPicker } from './choice-menu'
import { parseAudioName } from './filename'
import { DirectTelegramPublication, readPublicationCover, OwnYoutubeVideo } from './publication'

import { CaptionTemplates, CaptionTools, readCaptionPreferences, TelegramChannels, } from './telegram-settings'

type Screen = 'library' | 'create' | 'publish' | 'channels' | 'more' | 'templates' | 'overview' | 'detail'
type DetailTab = 'data' | 'publications'
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

function Waveform() {
  const heights = waveHeights.filter((_, index) => index % 2 === 0)
  return <div className="waveform waveform--compact" aria-hidden="true">{heights.map((height, index) => <i key={index} style={{ height: Math.max(7, height * .55) }} />)}</div>
}

function staggerStyle(index: number): CSSProperties {
  return { '--stagger': index } as CSSProperties
}

function App({ onStartupReady }: { onStartupReady: () => void }) {
  const [webApp, setWebApp] = useState(getTelegramWebApp)
  const [telegramChecked, setTelegramChecked] = useState(Boolean(webApp))
  const [localReady, setLocalReady] = useState(false)
  const [cloudReady, setCloudReady] = useState(false)
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
  const [publicationPlatform, setPublicationPlatform] = useState<'telegram' | 'youtube'>('telegram')
  const [videoSource, setVideoSource] = useState<'generated' | 'own'>('generated')
  const [videoStage, setVideoStage] = useState<VideoStage | null>(null)
  const [videoError, setVideoError] = useState('')
  const [videoFileHintId, setVideoFileHintId] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingBeat, setSavingBeat] = useState(false)
  const [ownVideo, setOwnVideo] = useState<{ beatId: string; file: File }>()
  const [videoResult, setVideoResult] = useState<{ beatId: string; url: string; blob: Blob; size: number; seconds: number } | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const videoUrlRef = useRef<string | null>(null)
  const fileUrlsRef = useRef<string[]>([])
  const cloudSaveTimersRef = useRef(new Map<string, number>())
  const pendingCloudWrites = useRef(new Map<string, Promise<void>>())
  const selected = beats.find((beat) => beat.id === selectedId) ?? beats[0]
  const latest = beats[0]
  const hasVideoAudio = Boolean(selected.audioFile || selected.audioUrl)
  const hasVideoCover = Boolean(selected.coverFile || selected.coverUrl)
  const missingVideoFiles = !hasVideoAudio && !hasVideoCover ? 'обложки и аудиофайла' : !hasVideoCover ? 'обложки' : !hasVideoAudio ? 'аудиофайла' : ''
  const selectedOwnVideo = ownVideo?.beatId === selected.id ? ownVideo.file : undefined
  const youtubeVideo = videoSource === 'own' ? selectedOwnVideo : videoResult?.beatId === selected.id ? videoResult.blob : undefined
  const youtubeFileKey = videoSource === 'own'
    ? selectedOwnVideo ? [selectedOwnVideo.name, selectedOwnVideo.size, selectedOwnVideo.lastModified].join(':') : 'own'
    : videoResult?.beatId === selected.id ? videoResult.url : 'generated'
  const audioPlayer = useAudioPlayer(notify)
  const playingTrack = beats.find((beat) => beat.id === audioPlayer.trackId && beat.audioUrl)

  function trackPlayButton(beat: Beat) {
    const playing = audioPlayer.trackId === beat.id && audioPlayer.playing
    return <button type="button" className="player-play" onClick={() => audioPlayer.toggle(beat)}
      aria-label={(playing ? 'Пауза: ' : 'Воспроизвести: ') + beat.title}>
      <PlayPauseIcon playing={playing} />
    </button>
  }
  const savedAudioBeats = beats.filter((beat) => !beat.isDemo && (beat.audioFile || beat.audioUrl))
  const batchBeats = batchSelectedIds.flatMap((id) => savedAudioBeats.filter((beat) => beat.id === id))
  const cloudAvailable = cloudConfigured() && Boolean(webApp?.initData)
  const [statsPlatform, setStatsPlatform] = useState<'youtube' | 'telegram'>('youtube')
  const statsView = (platform: typeof statsPlatform) => {
    const hasPublication = (beat: Beat) => beat.cloud && getBeatPublications(beat).some((post) => post.platform === platform)
    if (screen === 'overview' && statsPlatform === platform && beats.some(hasPublication)) return 'overview'
    if (screen === 'detail' && tab === 'publications' && hasPublication(selected)) return selected.id
  }
  const statsSession = cloudAvailable ? webApp?.initData : undefined
  const youtubeStats = usePlatformStats('youtube', statsSession, statsView('youtube'))
  const telegramStats = usePlatformStats('telegram', statsSession, statsView('telegram'))

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

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    let frame = 0
    const syncGradient = () => {
      frame = 0
      const maxScroll = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0)
      const progress = maxScroll > 0 ? Math.min(Math.max(window.scrollY / maxScroll, 0), 1) : 0
      shell.style.setProperty('--scroll-p', progress.toFixed(4))
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(syncGradient)
    }
    syncGradient()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [screen, publishMode, tab])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const rand = (min: number, max: number) => min + Math.random() * (max - min)
    const sign = () => (Math.random() < 0.5 ? -1 : 1)
    const shapes = [
      '62% 38% 46% 54% / 58% 44% 56% 42%',
      '48% 52% 64% 36% / 44% 62% 38% 56%',
      '56% 44% 38% 62% / 60% 42% 58% 40%',
      '42% 58% 54% 46% / 52% 38% 62% 48%',
    ]
    const tones = [
      ['#727278', '#333337', '#5d5d64', '#2a2a2e'],
      ['#6b6d75', '#2f3137', '#595b63', '#27292e'],
      ['#706e6b', '#343230', '#5e5c59', '#2b2928'],
    ]
    const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]
    const palette = pick(tones)
    shell.style.setProperty('--f1-c1', palette[0])
    shell.style.setProperty('--f1-c2', palette[1])
    shell.style.setProperty('--f2-c1', palette[2])
    shell.style.setProperty('--f2-c2', palette[3])

    shell.style.setProperty('--f1-rad', pick(shapes))
    shell.style.setProperty('--f2-rad', pick(shapes))

    shell.style.setProperty('--f1-x0', `${rand(-8, 12).toFixed(1)}vw`)
    shell.style.setProperty('--f1-y0', `${rand(-4, 6).toFixed(1)}vh`)
    shell.style.setProperty('--f1-dx', `${(sign() * rand(18, 28)).toFixed(1)}vw`)
    shell.style.setProperty('--f1-dy', `${rand(22, 34).toFixed(1)}vh`)
    shell.style.setProperty('--f1-r0', `${rand(-16, 16).toFixed(1)}deg`)
    shell.style.setProperty('--f1-dr', `${(sign() * rand(22, 38)).toFixed(1)}deg`)

    shell.style.setProperty('--f2-x0', `${rand(-10, 10).toFixed(1)}vw`)
    shell.style.setProperty('--f2-y0', `${rand(-6, 6).toFixed(1)}vh`)
    shell.style.setProperty('--f2-dx', `${(sign() * rand(16, 26)).toFixed(1)}vw`)
    shell.style.setProperty('--f2-dy', `${(-rand(20, 32)).toFixed(1)}vh`)
    shell.style.setProperty('--f2-r0', `${rand(-18, 18).toFixed(1)}deg`)
    shell.style.setProperty('--f2-dr', `${(sign() * rand(24, 42)).toFixed(1)}deg`)
  }, [])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const glassSelector = '.form-panel, .data-card, .publication-card, .links-panel, .tools-section, .list-section, .video-tool, .publish-empty, .overview-hero, .future-grid > div, .audio-dock'
    let activeCard: HTMLElement | null = null
    let frame = 0
    let pending: { card: HTMLElement | null; x: number; y: number } | null = null

    const clearActive = () => {
      pending = null
      if (!activeCard) return
      activeCard.removeAttribute('data-glass')
      activeCard = null
    }

    const flush = () => {
      frame = 0
      if (!pending) return
      const { card, x, y } = pending
      pending = null
      if (activeCard && activeCard !== card) activeCard.removeAttribute('data-glass')
      activeCard = card
      if (!card) return
      const rect = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${(x - rect.left).toFixed(1)}px`)
      card.style.setProperty('--my', `${(y - rect.top).toFixed(1)}px`)
      card.setAttribute('data-glass', 'on')
    }

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(glassSelector) : null
      pending = { card, x: event.clientX, y: event.clientY }
      if (!frame) frame = window.requestAnimationFrame(flush)
    }

    shell.addEventListener('pointermove', onPointerMove, { passive: true })
    shell.addEventListener('pointerleave', clearActive)
    window.addEventListener('blur', clearActive)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      clearActive()
      shell.removeEventListener('pointermove', onPointerMove)
      shell.removeEventListener('pointerleave', clearActive)
      window.removeEventListener('blur', clearActive)
    }
  }, [])

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
    function checkTelegram() {
      setWebApp(getTelegramWebApp())
      setTelegramChecked(true)
    }
    const timer = window.setTimeout(() => setTelegramChecked(true), 3500)
    script.onload = checkTelegram
    script.onerror = () => setTelegramChecked(true)
    document.head.appendChild(script)
    return () => { window.clearTimeout(timer); script.onload = null; script.onerror = null; script.remove() }
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
    }).catch(() => { if (!cancelled) notify('Не удалось открыть хранилище на этом устройстве') })
      .finally(() => { if (!cancelled) setLocalReady(true) })
    return () => { cancelled = true; fileUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)) }
  }, [])

  useEffect(() => {
    if (!webApp?.initData || !cloudConfigured()) return
    let cancelled = false
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 9000)
    void loadCloudBeats(webApp.initData, controller.signal).then((saved) => {
      if (!cancelled) setBeats((current) => [
        ...saved.map((beat) => ({ ...beat, key: normalizeMusicKey(beat.key) ?? beat.key, cover: 0 })),
        ...current.filter((beat) => !saved.some((remote) => remote.id === beat.id)),
      ])
    }).catch((error) => {
      if (!cancelled) notify(controller.signal.aborted ? 'Облако не ответило. Открой XEINTY заново для повторной загрузки.' : error instanceof Error ? error.message : 'Не удалось загрузить биты из облака')
    }).finally(() => {
      window.clearTimeout(timer)
      if (!cancelled) setCloudReady(true)
    })
    return () => { cancelled = true; window.clearTimeout(timer); controller.abort() }
  }, [webApp])

  useEffect(() => {
    if (screen === 'publish' && selected.isDemo) {
      const firstOwnBeat = beats.find((beat) => !beat.isDemo)
      if (firstOwnBeat) setSelectedId(firstOwnBeat.id)
    }
  }, [beats, screen, selected])

  useEffect(() => {
    if (localReady && telegramChecked && (!cloudAvailable || cloudReady)) onStartupReady()
  }, [localReady, telegramChecked, cloudAvailable, cloudReady, onStartupReady])

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3500) }
  function navigate(next: Screen) {
    if (next === 'publish' && selected.isDemo) {
      const firstOwnBeat = beats.find((beat) => !beat.isDemo)
      if (firstOwnBeat) setSelectedId(firstOwnBeat.id)
    }
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function openBeat(beat: Beat, nextTab: DetailTab = 'data') { setSelectedId(beat.id); setTab(nextTab); setConfirmDelete(false); navigate('detail') }
  function openPublish(beat?: Beat, mode: 'single' | 'batch' = 'single') { if (beat && !beat.isDemo) setSelectedId(beat.id); setPublishMode(mode); setPublicationPlatform('telegram'); navigate('publish') }
  async function persistBeat(beat: Beat, publicationLinks?: PublicationLinks) {
    if (!beat.cloud) return saveBeatMetadata(storedBeat(beat))
    if (!webApp?.initData) throw new Error('Telegram session required')
    const initData = webApp.initData
    const pending = pendingCloudWrites.current.get(beat.id)
    const write = (pending?.catch(() => {}) ?? Promise.resolve()).then(() => updateCloudBeat(initData, storedBeat(beat), publicationLinks))
    pendingCloudWrites.current.set(beat.id, write)
    try { await write } finally {
      if (pendingCloudWrites.current.get(beat.id) === write) pendingCloudWrites.current.delete(beat.id)
    }
  }

  async function publishTelegram(channel: string, targets: Beat[], caption: string, cover?: File, useSavedCover = false, coverCaption = '', republish = false) {
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
      channel, beatIds, caption, useSavedCover, coverCaption, republish, cover: cover ? await readPublicationCover(cover) : undefined,
    })
    rememberHashtags(caption, coverCaption)
    if (result.saved) setBeats((all) => all.map((beat) => beatIds.includes(beat.id) ? rememberPublication(beat, 'telegram', result.url) : beat))
    return result
  }

  async function savePublicationLink(platform: 'telegram' | 'youtube', url: string) {
    const id = selected.id
    const updated = rememberPublication(selected, platform, url)
    window.clearTimeout(cloudSaveTimersRef.current.get(id))
    cloudSaveTimersRef.current.delete(id)
    const links = platform === 'telegram' ? { telegramLink: url } : { youtubeLink: url }
    await persistBeat(updated, links)
    setBeats((all) => all.map((beat) => beat.id === id ? rememberPublication(beat, platform, url) : beat))
    if (platform === 'telegram') telegramStats.refresh()
    else youtubeStats.refresh()
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
  async function createVideo() {
    if (videoStage) return
    if (missingVideoFiles) {
      setVideoError('')
      setVideoFileHintId(selected.id)
      return
    }
    setVideoFileHintId(undefined)
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
      if (result === 'unsupported') {
        const link = document.createElement('a')
        link.href = videoResult.url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
    } catch (error) {
      console.error('Video save failed:', error)
      setVideoError('Не удалось открыть меню сохранения. Попробуй открыть XEINTY в браузере.')
    }
  }
  async function deleteBeat() {
    if (selected.isDemo || deleting) return
    setDeleting(true)
    try {
      if (selected.cloud && webApp?.initData) await deleteCloudBeat(webApp.initData, selected.id)
      else await deleteStoredBeat(selected.id)
      if (audioPlayer.trackId === selected.id) audioPlayer.close()
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

  const activeScreen = screen === 'detail' ? 'library' : screen === 'templates' ? 'more' : screen
  const mobileNav = nav.filter(({ id }) => id !== 'overview')
  const activeNavIndex = nav.findIndex(({ id }) => id === activeScreen)
  const activeMobileIndex = mobileNav.findIndex(({ id }) => id === activeScreen)

  return <div className={'app-shell' + (playingTrack ? ' has-audio-dock' : '')} ref={shellRef}>
    <div className="ambient-stage" aria-hidden="true">
      <div className="ambient-form ambient-form--a" />
      <div className="ambient-form ambient-form--b" />
    </div>
    <div className="app-frame">
      <header className="topbar"><button className="topbar-action topbar-create" onClick={() => navigate('create')} aria-label="Добавить новый бит"><Plus size={20} /></button><button className="wordmark" onClick={() => navigate('library')} aria-label="XEINTY — к библиотеке"><img src={xeintyLogo} alt="" width={48} height={48} /></button><span className="topbar-badge">Демо-версия</span><button className="topbar-action topbar-overview" onClick={() => navigate('overview')} aria-label="Открыть статистику"><AudioLines size={19} /></button></header>
      <div className="workspace">
        <aside className="desktop-rail" aria-label="Навигация"><div className="rail-head"><strong>Рабочее пространство</strong><span>Биты и публикации</span></div><nav style={{ '--nav-i': activeNavIndex } as CSSProperties}>{nav.map(({ id, label, Icon }) => <button key={id} className={activeScreen === id ? 'is-active' : ''} onClick={() => navigate(id)}><Icon size={19} />{label}<ChevronRight size={16} /></button>)}</nav><div className="rail-footer"><AudioLines size={18} /><span>Один бит — все материалы для его публикации.</span></div></aside>
        <main className="main-content" key={screen}>
          {screen === 'library' && <>
            <div className="library-context"><span>Текущий проект</span><span>{projectCount(beats.length)}</span></div>
            <section className="feature-section" aria-label="Текущий бит">
              <div className="feature-card">
                <div className="player-top"><Cover beat={latest} className="feature-cover" /><div className="feature-content"><span className="feature-status">{latest.isDemo ? 'Демо-проект' : latest.status}</span><h2>{latest.title}</h2><p>{latest.bpm} BPM <span>·</span> {latest.key}</p></div><button className="player-open" onClick={() => openBeat(latest)} aria-label={`Открыть ${latest.title}`}><ChevronRight size={19} /></button></div>
                <div className="player-footer"><span>{latest.audioUrl ? latest.audioName : 'Аудио не загружено'}</span><div className="player-controls">{latest.audioUrl ? trackPlayButton(latest) : <button className="player-publish" onClick={() => openPublish(latest)} aria-label="Подготовить публикацию"><Send size={16} /><span>Публикация</span></button>}<button className="player-next" onClick={() => openBeat(latest)}>Открыть бит <ArrowRight size={16} /></button></div></div>
              </div>
            </section>
            <section className="tools-section"><div className="section-heading"><h2>Рабочие шаги</h2></div><div className="tool-grid"><button style={staggerStyle(0)} onClick={() => openBeat(latest, 'data')}><ListMusic size={20} /><span>Параметры</span></button><button style={staggerStyle(1)} onClick={() => openPublish(latest)}><Clipboard size={20} /><span>Публикация</span></button><button style={staggerStyle(2)} onClick={() => openBeat(latest, 'publications')}><Link2 size={20} /><span>Публикации</span></button></div></section>
            <button className="upload-banner" onClick={() => navigate('create')}><span className="upload-banner-icon"><UploadCloud size={23} /></span><span><strong>Добавить свой бит</strong><small>Обложка, аудио, BPM и теги</small></span><span className="upload-banner-arrow"><ArrowRight size={18} /></span></button>
            <section className="list-section"><div className="list-header"><div><h2>Недавние проекты</h2></div><span className="demo-pill">{beats.every((beat) => beat.isDemo) ? 'Демо' : 'Демо и черновики'}</span></div><div className="beat-list">{beats.map((beat, index) => <button className="beat-row" key={beat.id} style={staggerStyle(index)} onClick={() => openBeat(beat)}>{beat.isDemo ? <span className="row-wave"><Waveform /></span> : <Cover beat={beat} className="row-cover" />}<span className="row-main"><strong>{beat.title}</strong><small>{beat.bpm} BPM · {beat.key}</small></span><span className="row-meta">{beat.cloud ? 'Облако' : beat.isDemo ? beat.status : 'На устройстве'}</span><ArrowRight className="row-arrow" size={18} /></button>)}</div><p className="demo-note"><CircleHelp size={15} /> {cloudAvailable ? 'Облачные биты доступны в Telegram на других устройствах. Локальные записи можно перенести из карточки бита.' : 'Примеры показывают интерфейс. Пока свои биты хранятся только на этом устройстве.'}</p></section>
          </>}
          {screen === 'create' && <>
            <div className="page-heading"><div><h1>Новый бит</h1><p>Добавь параметры, обложку и аудио для предпросмотра.</p></div></div>
            <form className="create-layout" onSubmit={addBeat}><div className="form-panel"><div className="panel-title"><span>01</span><div><h2>Основное</h2><p>Название и музыкальные параметры</p></div></div><label className="field"><span>Название бита *</span><input required maxLength={40} placeholder="Например, NO SIGNAL" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><div className="field-grid"><label className="field"><span>BPM</span><input type="number" min="1" max="300" placeholder="138" value={form.bpm} onChange={(e) => setForm({ ...form, bpm: e.target.value })} /></label><div className="field"><span>Тональность</span><KeyPicker value={form.key} onChange={(key) => setForm((current) => ({ ...current, key }))} onCommit={(value) => { const key = normalizeMusicKey(value); if (key !== null) setForm((current) => ({ ...current, key })) }} /></div></div><label className="field"><span>Теги и настроение</span><input placeholder="dark trap, ambient, type beat" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label></div>
              <div className="form-panel"><div className="panel-title"><span>02</span><div><h2>Файлы</h2><p>Обложка и аудио для предпросмотра</p></div></div><div className="upload-grid"><label className="upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} /><ImagePlus size={25} /><strong>{coverFile ? coverFile.name : 'Обложка'}</strong><span>PNG, JPG или WEBP</span></label><label className="upload-zone"><input type="file" accept={cloudAvailable ? '.mp3,audio/mpeg' : 'audio/*,.mp3,.wav'} onChange={(e) => chooseAudio(e.target.files?.[0] ?? null)} /><UploadCloud size={26} /><strong>{audioFile ? audioFile.name : 'Аудиофайл'}</strong><span>{cloudAvailable ? 'MP3 до 15 МБ' : 'MP3 или WAV'}</span></label></div><p className="form-hint">{cloudAvailable ? 'MP3 и обложка сохранятся в облаке. WAV и MP4 останутся на твоём устройстве.' : 'Файлы пока сохранятся на этом устройстве. Облако работает при запуске через Telegram после подключения проекта.'}</p></div>
              <div className="create-submit"><button type="submit" className="primary-button" disabled={savingBeat}>{savingBeat ? 'Сохраняем…' : 'Создать черновик'} {!savingBeat && <ArrowRight size={19} />}</button><span>{cloudAvailable ? 'Черновик будет доступен в Telegram на других устройствах.' : 'Черновик сохранится в этом браузере.'}</span></div></form>
          </>}
          {screen === 'publish' && <>
            <div className="page-heading"><div><h1>Публикация</h1><p>Выбери один бит или подготовь пачку для Telegram.</p></div></div>
            <div className="publish-mode" role="tablist" aria-label="Тип публикации" style={{ '--tab-i': publishMode === 'batch' ? 1 : 0 } as CSSProperties}><button role="tab" aria-selected={publishMode === 'single'} className={publishMode === 'single' ? 'is-active' : ''} onClick={() => setPublishMode('single')}>Один бит</button><button role="tab" aria-selected={publishMode === 'batch'} className={publishMode === 'batch' ? 'is-active' : ''} onClick={() => setPublishMode('batch')}>Пачка битов</button></div>
            {publishMode === 'single' && <div className="publish-stage" key="single">
              {beats.some((beat) => !beat.isDemo) ? <div className="publish-beats" role="group" aria-label="Выбрать бит">{beats.filter((beat) => !beat.isDemo).map((beat, index) => <button style={staggerStyle(index)} key={beat.id} className={selected.id === beat.id ? 'is-active' : ''} onClick={() => { setSelectedId(beat.id); setVideoError('') }}><Cover beat={beat} className="publish-beat-cover" /><span><strong>{beat.title}</strong><small>{beat.bpm} BPM · {beat.key}</small></span><Check size={16} className="publish-beat-check" /></button>)}</div> : <div className="publish-empty"><FileAudio2 size={25} /><strong>Пока нет своих битов</strong><p>Сначала добавь аудиофайл — затем здесь появятся тексты и сборка видео.</p><button className="outline-button" onClick={() => navigate('create')}>Добавить бит <ArrowRight size={17} /></button></div>}
              {!selected.isDemo && <div className="detail-section">
              <div className="section-intro"><h2>Для площадок</h2><p>Подстрой тексты и подготовь видео для выбранного бита.</p></div>
                <div className="platform-switch" role="tablist" aria-label="Площадка" style={{ '--tab-i': publicationPlatform === 'youtube' ? 1 : 0 } as CSSProperties}><button role="tab" aria-selected={publicationPlatform === 'telegram'} className={publicationPlatform === 'telegram' ? 'is-active' : ''} onClick={() => setPublicationPlatform('telegram')}>Telegram</button><button role="tab" aria-selected={publicationPlatform === 'youtube'} className={publicationPlatform === 'youtube' ? 'is-active' : ''} onClick={() => setPublicationPlatform('youtube')}>YouTube</button></div>
              <div className="publication-grid">
                <div className={`publication-card ${publicationPlatform === 'telegram' ? 'is-current' : ''}`}><div className="publication-card-head"><div className="platform-icon telegram-icon"><Send size={20} /></div><div><span>TELEGRAM</span><h3>Подпись к посту</h3></div></div><textarea aria-label="Подпись для Telegram" placeholder="Добавить подпись (необязательно)" value={selected.telegramCaption} maxLength={1024} onBlur={(e) => rememberHashtags(e.currentTarget.value)} onChange={(e) => updateBeat({ telegramCaption: e.target.value })} />{captionTools(selected.telegramCaption, (telegramCaption) => updateBeat({ telegramCaption }))}<label className="batch-cover-toggle"><input type="checkbox" checked={includeTelegramCover} onChange={(event) => toggleTelegramCover(event.target.checked)} /><span>Прикладывать обложку к посту</span></label>{cloudAvailable && selected.cloud && <DirectTelegramPublication channels={channels} key={selected.id} publishedCount={selected.telegramLink.trim() ? 1 : 0} publish={(channel, republish) => publishTelegram(channel, [selected], selected.telegramCaption, undefined, includeTelegramCover, '', republish)} />}
                </div>
                <div className={`publication-card ${publicationPlatform === 'youtube' ? 'is-current' : ''}`}><div className="publication-card-head"><div className="platform-icon youtube-icon">▶</div><div><span>YOUTUBE</span><h3>Описание видео</h3></div></div><textarea aria-label="Описание для YouTube" placeholder="Описание (необязательно)" maxLength={5000} value={selected.youtubeDescription} onChange={(e) => updateBeat({ youtubeDescription: e.target.value })} />{captionTools(selected.youtubeDescription, (youtubeDescription) => updateBeat({ youtubeDescription }), true)}<label className="keywords-field"><span>КЛЮЧЕВЫЕ СЛОВА</span><input aria-label="Ключевые слова YouTube" value={selected.youtubeKeywords} onChange={(e) => updateBeat({ youtubeKeywords: e.target.value })} /></label>

              <div className="video-tool"><Dropdown label="Видео для YouTube" value={videoSource} onChange={(value) => setVideoSource(value === 'own' ? 'own' : 'generated')}
                  options={[{ value: 'generated', label: 'Собрать видео в XEINTY' }, { value: 'own', label: 'Приложить своё видео' }]} />
                {videoSource === 'own' ? <OwnYoutubeVideo key={selected.id} file={selectedOwnVideo} onChange={(file) => setOwnVideo(file ? { beatId: selected.id, file } : undefined)} /> : <>
                  <button className="primary-button video-action" type="button" onClick={createVideo} disabled={videoStage !== null}>{videoStage ? 'Сборка идёт…' : 'Собрать MP4'} {!videoStage && <ArrowRight size={18} />}</button>
                  {videoStage && <p className="video-status" role="status">{videoStage === 'loading' ? 'Загружаем видеодвижок — около 31 МБ…' : videoStage === 'preparing' ? 'Подготавливаем файлы…' : 'Собираем видео. Не закрывай Telegram…'}</p>}
                  <p className="video-hint">{videoProfileLabel}</p>
                  {videoFileHintId === selected.id && missingVideoFiles && <div className="video-file-hint">
                    <p className="video-error" role="alert">Для сборки MP4 не хватает {missingVideoFiles}.</p>
                    <button type="button" className="outline-button" onClick={() => openBeat(selected)}>Открыть карточку бита <ArrowRight size={16} /></button>
                  </div>}
                  {videoError && <p className="video-error" role="alert">{videoError}</p>}
                  {videoResult?.beatId === selected.id && <div className="video-result"><video src={videoResult.url} controls playsInline preload="metadata" aria-label={`Готовое видео ${selected.title}`} /><p>MP4 · {(videoResult.size / 1024 / 1024).toFixed(1)} МБ · сборка {videoResult.seconds} с</p><div className="video-save-actions"><button className="video-download" onClick={saveVideo}><Download size={17} /> Сохранить MP4</button><a className="video-download" href="https://studio.youtube.com/" target="_blank" rel="noreferrer">Открыть YouTube Studio <ExternalLink size={16} /></a></div><p>Загрузи сохранённый MP4 в Studio. Studio откроется отдельно от XEINTY.</p></div>}
                </>}
              </div>
              {cloudAvailable && selected.cloud && webApp?.initData && <YoutubeUpload
                key={selected.id + ':' + youtubeFileKey} initData={webApp.initData} beatId={selected.id}
                video={youtubeVideo} fileKey={youtubeFileKey} existingLink={selected.youtubeLink} existingPublishAt={selected.youtubePublishAt}
                beforeStart={async () => {
                  window.clearTimeout(cloudSaveTimersRef.current.get(selected.id))
                  cloudSaveTimersRef.current.delete(selected.id)
                  await persistBeat(selected)
                }}
                onNotice={notify}
                onSaved={({ url, publishAt }) => setBeats((all) => all.map((beat) => beat.id === selected.id ? rememberPublication(beat, 'youtube', url, publishAt) : beat))} />}
              {cloudAvailable && !selected.cloud && <p className="form-hint">Чтобы загрузить видео напрямую, перенеси бит в облако из карточки бита.</p>}
                </div>
              </div>

            </div>}
            </div>}
            {publishMode === 'batch' && <>
              <div className="section-intro"><h2>Пачка битов</h2><p>Несколько аудиофайлов для одного альбома Telegram.</p></div>
            <div className="form-panel batch-panel">
              <div className="batch-library"><div className="batch-library-head"><strong>Выбрать из библиотеки</strong><span>{batchSelectedIds.length + batchFiles.length} / 10</span></div>
                {savedAudioBeats.length ? <div className="batch-beat-list">{savedAudioBeats.map((beat, index) => <button style={staggerStyle(index)} type="button" key={beat.id} className={batchSelectedIds.includes(beat.id) ? 'is-active' : ''} aria-pressed={batchSelectedIds.includes(beat.id)} onClick={() => toggleBatchBeat(beat.id)}><Cover beat={beat} className="publish-beat-cover" /><span><strong>{beat.title}</strong><small>{beat.bpm} BPM · {beat.key}</small></span><Check size={17} /></button>)}</div> : <div className="batch-library-empty"><p>В библиотеке пока нет битов с аудиофайлом.</p><button type="button" onClick={() => navigate('create')}>Добавить бит <ArrowRight size={15} /></button></div>}
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
                <DirectTelegramPublication channels={channels} key={batchBeats.map((beat) => beat.id).join(',')} publishedCount={batchBeats.filter((beat) => beat.telegramLink.trim()).length} publish={(channel, republish) => publishTelegram(channel, batchBeats, batchCaption, includeTelegramCover ? batchCoverFile ?? undefined : undefined, false, includeTelegramCover && batchCoverFile ? batchCoverCaption : '', republish)} />}
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
            <h2 className="channel-section-title">Telegram</h2>
            <TelegramChannels available={cloudAvailable} initData={webApp?.initData} channels={channels} loadError={channelLoadError} onConnect={addChannel} onDisconnect={removeChannel} />
            <YoutubeChannelSettings initData={cloudAvailable ? webApp?.initData : undefined}
              openLink={webApp?.openLink ? (url) => webApp.openLink?.(url) : undefined} />
          </>}
          {screen === 'overview' && <>
            <div className="page-heading"><div><h1>Статистика</h1><p>Показатели публикаций из библиотеки битов.</p></div></div>
            <StatsOverview beats={beats} platform={statsPlatform} setPlatform={setStatsPlatform} state={statsPlatform === 'youtube' ? youtubeStats : telegramStats} openChannels={() => navigate('channels')}
              openPublication={() => openPublish()} openBeat={(id) => {
                const beat = beats.find((item) => item.id === id)
                if (beat) openBeat(beat, 'publications')
              }} />
          </>}
          {screen === 'detail' && selected && <>
            <button className="back-link" onClick={() => navigate('library')}><ArrowLeft size={17} /> Все биты</button><section className="detail-hero"><Cover beat={selected} className="detail-cover" /><div className="detail-identity"><div className="eyebrow">{selected.isDemo ? 'Демо-проект' : 'Черновик'}</div><h1>{selected.title}</h1><p>{selected.tags}</p><div className="meta-row"><span>{selected.bpm} BPM</span><i /><span>{selected.key}</span></div><div className="detail-audio">{selected.audioUrl ? <><FileAudio2 size={17} /><span>{selected.audioName}</span>{trackPlayButton(selected)}</> : <><Music2 size={18} /><span>{selected.isDemo ? 'Аудио для этого демо-бита не загружено' : 'Аудиофайл не добавлен'}</span></>}</div></div></section>
            <div className="detail-tabs" role="tablist" aria-label="Разделы бита">{([['data', 'Данные'], ['publications', 'Публикации']] as [DetailTab, string][]).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
            {tab === 'data' && <div className="detail-section" key="data"><div className="section-intro"><h2>Данные бита</h2><p>Изменения сохраняются автоматически.</p></div><div className="data-card data-card--editable"><label className="field"><span>НАЗВАНИЕ</span><input aria-label="Название бита" maxLength={120} value={selected.title} onChange={(event) => updateBeat({ title: event.target.value })} /></label><label className="field"><span>ТЕМП (BPM)</span><input aria-label="Темп BPM" type="number" min="1" max="300" value={selected.bpm === '—' ? '' : selected.bpm} onChange={(event) => updateBeat({ bpm: event.target.value || '—' })} /></label><div className="field"><span>ТОНАЛЬНОСТЬ</span><KeyPicker value={selected.key} label="Тональность бита" onChange={(key) => updateBeat({ key })} onCommit={(value) => { const key = normalizeMusicKey(value); if (key !== null) updateBeat({ key: key || "—" }); else { updateBeat({ key: "—" }); notify("Не распознал тональность; выбери вариант из списка.") } }} /></div><label className="field"><span>ТЕГИ</span><input aria-label="Теги бита" value={selected.tags} onChange={(event) => updateBeat({ tags: event.target.value })} /></label></div>{!selected.isDemo && <label className="upload-zone cover-edit"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void changeCover(event.target.files?.[0])} /><ImagePlus size={22} /><strong>Изменить обложку</strong><span>JPG, PNG или WEBP до 2 МБ</span></label>}<p className="detail-footnote">Подписи для площадок редактируются в разделе «Публикация». {selected.cloud ? 'MP3 и обложка хранятся в облаке.' : ''}</p>{!selected.isDemo && <div className="delete-beat">{cloudAvailable && !selected.cloud && <button onClick={migrateBeat} disabled={savingBeat}><UploadCloud size={16} /> {savingBeat ? 'Переносим…' : 'Перенести в облако'}</button>}{confirmDelete ? <><p>Удалить «{selected.title}» вместе с аудио и обложкой {selected.cloud ? 'из облака' : 'с этого устройства'}?</p><div><button onClick={() => setConfirmDelete(false)}>Отмена</button><button className="delete-beat-confirm" onClick={deleteBeat} disabled={deleting}>Подтвердить удаление</button></div></> : <button onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Удалить бит</button>}</div>}</div>}
            {tab === 'publications' && <PublicationHistory key={selected.id} beat={selected} channels={channels}
              stats={{ youtube: youtubeStats.stats, telegram: telegramStats.stats }} save={savePublicationLink}
              openPublication={() => openPublish(selected)} />}
          </>}
        </main>
      </div>
      {audioPlayer.element}
      {playingTrack && <AudioDock player={audioPlayer} track={playingTrack} cover={<Cover beat={playingTrack} className="audio-dock-cover" />} />}
      <nav className="bottom-nav" aria-label="Главная навигация" data-has-active={activeMobileIndex >= 0} style={{ '--nav-i': Math.max(0, activeMobileIndex), '--nav-count': mobileNav.length } as CSSProperties}>{mobileNav.map(({ id, label, Icon }) => <button key={id} className={activeScreen === id ? 'is-active' : ''} onClick={() => navigate(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>
      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    </div>
  </div>
}

export default App
