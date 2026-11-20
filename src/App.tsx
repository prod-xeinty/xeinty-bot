import { YoutubeChannelSettings, YoutubeUpload } from './youtube-upload'
import { getBeatPublications, postUrl, PublicationHistory, rememberPublication } from './publication-history'
import { PlannedReleases } from './planned-releases'
import { usePlatformStats, StatsOverview, type StatsRanking } from './platform-stats'
import xeintyLogo from './assets/xeinty-logo.png'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, AudioLines, Check, ChevronDown, ChevronRight, ChevronUp, CircleHelp, Clipboard, Download, ExternalLink, FileAudio2, ImagePlus, Link2, ListMusic, Music2, Ellipsis, Plus, Radio, Send, Sun, Moon, Trash2, UploadCloud, X } from 'lucide-react'
import { AudioDock, PlayPauseIcon, useAudioPlayer, type Track } from './audio-player'
import { joinTrackCaption, telegramCaptionLimit } from '../supabase/functions/beats/telegram-caption'
import { RecordMenu } from './record-menu'
import { TelegramImport } from './telegram-import'
import { BatchPreview } from './batch-preview'
import { BatchTrackCredits } from './batch-credits'
import { emptyBatchDraft, useBatchDraft } from './batch-draft'
import { BeatSearch, defaultLibraryFilters, LibraryControls, matchBeats, refineLibrary } from './beat-library'
import { getTelegramWebApp } from './telegram'
import { makeStaticVideo, videoProfileLabel, type VideoStage } from './video'
import { saveVideoFile } from './save-video'
import { deleteStoredBeat, loadStoredBeats, saveBeatCover, saveBeatMetadata, saveNewBeat, type StoredBeat } from './beat-store'
import { changeYoutubeSchedule, refreshYoutubeSchedule, cloudConfigured, connectTelegramChannel, disconnectTelegramChannel, loadTelegramAudioUrl, loadTelegramChannels, loadTelegramImportFile, loadTelegramImportSuggestions, type TelegramImportSuggestion, type BeatCursor, type TelegramChannel, type TelegramPublication, type PublicationLinks, createCloudBeat, deleteCloudBeat, loadCloudBeats, publishCloudTelegram, remoteFile, replaceCloudCover, updateCloudBeat } from './cloud-beats'
import { normalizeMusicKey } from './music-key'
import { detectTelegramAudioMetadata } from '../supabase/functions/beats/audio-metadata'
import { Dropdown, KeyPicker } from './choice-menu'
import { parseAudioName, telegramLine } from './filename'
import { DirectTelegramPublication, readPublicationCover, OwnYoutubeVideo } from './publication'

import { beatCaptionValues, CaptionTemplates, CaptionTools, readCaptionPreferences, TelegramChannels } from './telegram-settings'

type Screen = 'library' | 'create' | 'publish' | 'channels' | 'more' | 'templates' | 'overview' | 'detail' | 'import'
type DetailTab = 'data' | 'publications'
type PublishMode = 'single' | 'batch' | 'planned'
const telegramPublishingEnabled = false
const publishModes: { id: PublishMode; label: string }[] = [
  { id: 'single', label: 'На YouTube' }, ...(telegramPublishingEnabled ? [{ id: 'batch' as const, label: 'Пачка битов' }] : []),
  { id: 'planned', label: 'Запланировано' },
]
type Beat = Omit<StoredBeat, 'createdAt'> & {
  createdAt?: number; cover: number; coverUrl?: string; audioUrl?: string; audioFile?: File; coverFile?: File; isDemo?: boolean; cloud?: boolean
}

function recordMetadata(beat: Beat) {
  return [beat.bpm && beat.bpm !== '—' ? beat.bpm + ' BPM' : '', beat.key !== '—' ? beat.key : ''].filter(Boolean)
}

function missingImportedMetadata(beat: Beat) {
  if (!beat.telegramSourceUrl || !beat.audioName || recordMetadata(beat).length === 2) return undefined
  const detected = detectTelegramAudioMetadata(beat.audioName)
  const patch: Partial<Pick<Beat, 'bpm' | 'key'>> = {}
  if ((!beat.bpm.trim() || beat.bpm === '—') && detected.bpm !== '—') patch.bpm = detected.bpm
  if ((!beat.key.trim() || beat.key === '—') && detected.key !== '—') patch.key = detected.key
  return patch.bpm || patch.key ? patch : undefined
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

type Theme = 'dark' | 'light'

function App({ onStartupReady }: { onStartupReady: () => void }) {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  const [webApp, setWebApp] = useState(getTelegramWebApp)
  const [telegramChecked, setTelegramChecked] = useState(Boolean(webApp))
  const [localReady, setLocalReady] = useState(false)
  const [cloudReady, setCloudReady] = useState(false)
  const [cloudNext, setCloudNext] = useState<BeatCursor | null>(null)
  const [cloudPageBusy, setCloudPageBusy] = useState(false)
  const cloudPageRequest = useRef(false)
  const importPromptKey = 'xeinty-telegram-import-seen:' + (webApp?.initDataUnsafe.user?.id ?? 'telegram')
  const [dismissedImport, setDismissedImport] = useState('')
  const [importSuggestions, setImportSuggestions] = useState<TelegramImportSuggestion[]>([])
  const [importSuggestion, setImportSuggestion] = useState<TelegramImportSuggestion>()
  const [importRevision, setImportRevision] = useState(0)
  const [screen, setScreen] = useState<Screen>('library')
  const [tab, setTab] = useState<DetailTab>('data')
  const [detailFromStats, setDetailFromStats] = useState(false)
  const [statsRanking, setStatsRanking] = useState<StatsRanking>({ query: '', metrics: { youtube: 'views', telegram: 'views' } })
  const [focusedPublication, setFocusedPublication] = useState<string>()
  const [publishMode, setPublishMode] = useState<PublishMode>('single')
  const [beats, setBeats] = useState<Beat[]>(demoBeats)
  const [selectedId, setSelectedId] = useState('no-signal')
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ title: '', bpm: '', key: '', tags: '' })
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [libraryFilters, setLibraryFilters] = useState(defaultLibraryFilters)
  const [publishQuery, setPublishQuery] = useState('')
  const [batchQuery, setBatchQuery] = useState('')
  const telegramUserId = webApp?.initDataUnsafe.user?.id
  const draftScope = telegramChecked ? telegramUserId ? 'telegram:' + telegramUserId : 'browser' : undefined
  const batchDraft = useBatchDraft(draftScope)
  const { selectedIds: batchSelectedIds, files: batchFiles, caption: batchCaption, coverCaption: batchCoverCaption, cover: batchCoverFile, credits: batchCredits } = batchDraft.draft
  const [confirmBatchReset, setConfirmBatchReset] = useState(false)
  const [channels, setChannels] = useState<TelegramChannel[]>([])
  const [channelLoadError, setChannelLoadError] = useState('')
  const [captionPreferences, setCaptionPreferences] = useState(readCaptionPreferences)
  const [includeTelegramCover, setIncludeTelegramCover] = useState(() => localStorage.getItem('xeinty-telegram-cover') !== 'false')
  const batchIncludeCover = batchDraft.draft.includeCover ?? includeTelegramCover
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [publicationPlatform, setPublicationPlatform] = useState<'telegram' | 'youtube'>('youtube')
  const [videoSource, setVideoSource] = useState<'generated' | 'own'>('generated')
  const [videoStage, setVideoStage] = useState<VideoStage | null>(null)
  const [videoError, setVideoError] = useState('')
  const [videoFileHintId, setVideoFileHintId] = useState<string>()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savingBeat, setSavingBeat] = useState(false)
  const [videoInputs, setVideoInputs] = useState<{ beatId: string; audio?: File; cover?: File }>()
  const [ownVideo, setOwnVideo] = useState<{ beatId: string; file: File }>()
  const [videoResult, setVideoResult] = useState<{ beatId: string; url: string; blob: Blob; size: number; seconds: number } | null>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const videoUrlRef = useRef<string | null>(null)
  const fileUrlsRef = useRef<string[]>([])
  const cloudSaveTimersRef = useRef(new Map<string, number>())
  const pendingCloudWrites = useRef(new Map<string, Promise<void>>())
  const selected = beats.find((beat) => beat.id === selectedId) ?? beats[0]
  const latest = beats[0]
  const temporaryVideoInputs = videoInputs?.beatId === selected.id ? videoInputs : undefined
  const telegramVideoSession = selected.cloud && selected.telegramSourceUrl ? webApp?.initData : undefined
  const needsVideoAudio = !selected.audioFile && !selected.audioUrl
  const needsVideoCover = !selected.coverFile && !selected.coverUrl
  const hasVideoAudio = !needsVideoAudio || Boolean(temporaryVideoInputs?.audio)
  const hasVideoCover = !needsVideoCover || Boolean(temporaryVideoInputs?.cover)
  const missingVideoFiles = !hasVideoAudio && !hasVideoCover ? 'обложки и аудиофайла' : !hasVideoCover ? 'обложки' : !hasVideoAudio ? 'аудиофайла' : ''
  const selectedOwnVideo = ownVideo?.beatId === selected.id ? ownVideo.file : undefined
  const youtubeVideo = videoSource === 'own' ? selectedOwnVideo : videoResult?.beatId === selected.id ? videoResult.blob : undefined
  const youtubeFileKey = videoSource === 'own'
    ? selectedOwnVideo ? [selectedOwnVideo.name, selectedOwnVideo.size, selectedOwnVideo.lastModified].join(':') : 'own'
    : videoResult?.beatId === selected.id ? videoResult.url : 'generated'
  const audioPlayer = useAudioPlayer(notify)
  const playingTrack = beats.find((beat) => beat.id === audioPlayer.trackId)

  function sourcePostLink(url: string) {
    return <a className="player-next" href={url} target="_blank" rel="noreferrer"
      onClick={(event) => { if (webApp?.openTelegramLink) { event.preventDefault(); webApp.openTelegramLink(url) } }}>
      <ExternalLink size={16} /> Открыть в Telegram
    </a>
  }

  function canPlay(beat: Beat) {
    return Boolean(beat.audioUrl || (beat.cloud && beat.telegramSourceUrl && webApp?.initData))
  }

  function audioTrack(beat: Beat): Track {
    const source = beat.telegramSourceUrl
    const session = webApp?.initData
    return {
      id: beat.id, title: beat.title, audioUrl: beat.audioUrl,
      loadAudio: beat.cloud && source && session ? (signal) => loadTelegramAudioUrl(session, beat.id, signal) : undefined,
      openSource: source ? () => {
        if (webApp?.openTelegramLink) webApp.openTelegramLink(source)
        else window.open(source, '_blank', 'noopener,noreferrer')
      } : undefined,
    }
  }

  function trackPlayButton(beat: Beat) {
    const active = audioPlayer.trackId === beat.id
    const playing = active && audioPlayer.playing
    const loading = active && audioPlayer.loading
    return <button type="button" className="player-play" onClick={() => audioPlayer.toggle(audioTrack(beat))}
      disabled={loading} aria-busy={loading} aria-label={(loading ? 'Загружаем: ' : playing ? 'Пауза: ' : 'Воспроизвести: ') + beat.title}>
      <PlayPauseIcon playing={playing} loading={loading} />
    </button>
  }
  const savedAudioBeats = beats.filter((beat) => !beat.isDemo && (beat.audioFile || beat.audioUrl))
  const batchBeats = batchSelectedIds.flatMap((id) => savedAudioBeats.filter((beat) => beat.id === id))
  const unavailableBatchBeats = batchSelectedIds.length - batchBeats.length
  const trackCredits = batchBeats.map((beat) => batchCredits[beat.id] ?? '')
  const hasTrackCredits = trackCredits.some((credit) => Boolean(credit.trim()))
  const lastBatchCaptionLength = joinTrackCaption(batchFiles.length ? '' : trackCredits.at(-1) ?? '', batchCaption).length
  const lastCaptionTooLong = lastBatchCaptionLength > telegramCaptionLimit
  const libraryBeats = screen === 'library' ? refineLibrary(beats, libraryFilters) : []
  const publicationBeats = beats.filter((beat) => !beat.isDemo)
  const matchingPublicationBeats = matchBeats(publicationBeats, publishQuery)
  const matchingBatchBeats = matchBeats(savedAudioBeats, batchQuery)
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

  function captionTools(caption: string, onChange: (value: string) => void, platform: 'telegram' | 'youtube' | 'batch' = 'telegram') {
    const values = platform === 'batch' ? { биты: [...batchBeats, ...batchFiles.map((file) => parseAudioName(file.name))].map((beat, index) => {
      const fields = beatCaptionValues(beat)
      const line = telegramLine({ title: fields.название || 'Без названия', bpm: fields.bpm ?? '', key: fields.тональность ?? '', tags: '' })
      return (index + 1) + '. ' + line
    }).join('\n') } : beatCaptionValues(selected)
    return <CaptionTools caption={caption} onChange={onChange} preferences={captionPreferences} values={values} youtube={platform === "youtube"} />
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
    batchDraft.update((draft) => ({ ...draft, selectedIds: next }))
  }

  function moveBatchBeat(id: string, offset: number) {
    batchDraft.update((draft) => {
      const items = draft.selectedIds
      const index = items.indexOf(id)
      const destination = index + offset
      if (index < 0 || destination < 0 || destination >= items.length) return draft
      const next = [...items]
      next.splice(index, 1)
      next.splice(destination, 0, id)
      return { ...draft, selectedIds: next }
    })
  }

  function chooseBatch(files: File[]) {
    if (batchSelectedIds.length + files.length > 10) { notify('В одну пачку можно добавить не больше 10 аудиофайлов'); return }
    batchDraft.update((draft) => ({ ...draft, files }))
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
    if (webApp.requestFullscreen) webApp.requestFullscreen()
    else webApp.expand()
    webApp.ready()
  }, [webApp])

  useEffect(() => {
    const surface = theme === 'light' ? '#f1f1ef' : '#0d0d0e'
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", surface)
    try { localStorage.setItem('xeinty-theme', theme) } catch { /* The choice still applies to this session. */ }
    if (!webApp) return
    for (const method of ['setHeaderColor', 'setBackgroundColor', 'setBottomBarColor'] as const) {
      try { webApp[method]?.(surface) } catch { /* Older Telegram clients can reject custom colors. */ }
    }
  }, [theme, webApp])

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
    void loadCloudBeats(webApp.initData, controller.signal).then(({ beats: saved, next }) => {
      if (cancelled) return
      setCloudNext(next)
      setBeats((current) => [
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

  useEffect(() => {
    if (!statsSession || !channels.length) return
    let request: AbortController | undefined
    function refresh() {
      if (document.visibilityState === 'hidden' || request || !statsSession) return
      const current = new AbortController()
      request = current
      const timeout = window.setTimeout(() => current.abort(), 10000)
      void loadTelegramImportSuggestions(statsSession, current.signal).then(({ suggestions }) => {
        if (!current.signal.aborted) setImportSuggestions(suggestions ?? [])
      }).catch(() => {}).finally(() => { window.clearTimeout(timeout); request = undefined })
    }
    refresh()
    const timer = window.setInterval(refresh, 60000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); request?.abort() }
  }, [statsSession, channels.length, importRevision])

  function dismissImportPrompt() {
    setDismissedImport(importPromptKey)
    try { localStorage.setItem(importPromptKey, 'true') } catch { /* The prompt remains hidden in this session. */ }
  }

  function importPromptVisible() {
    if (!cloudAvailable || dismissedImport === importPromptKey) return false
    try { return !localStorage.getItem(importPromptKey) } catch { return true }
  }

  function openImport(suggestion?: TelegramImportSuggestion) { dismissImportPrompt(); setImportSuggestion(suggestion); navigate('import') }

  async function loadLibraryPage(cursor?: BeatCursor) {
    if (!webApp?.initData || cloudPageRequest.current) return
    cloudPageRequest.current = true
    setCloudPageBusy(true)
    try {
      const { beats: saved, next } = await loadCloudBeats(webApp.initData, AbortSignal.timeout(12000), cursor)
      const page = saved.map((beat) => ({ ...beat, key: normalizeMusicKey(beat.key) ?? beat.key, cover: 0 }))
      const ids = new Set(page.map((beat) => beat.id))
      setBeats((current) => cursor ? [...current, ...page.filter((beat) => !current.some((item) => item.id === beat.id))]
        : [...page, ...current.filter((beat) => !ids.has(beat.id))])
      setCloudNext(next)
    } catch (failure) {
      notify(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : 'Не удалось загрузить библиотеку. Попробуй ещё раз.')
    } finally { cloudPageRequest.current = false; setCloudPageBusy(false) }
  }

  function moreCloudBeats() {
    return cloudNext && <button type="button" className="outline-button library-more" disabled={cloudPageBusy} onClick={() => void loadLibraryPage(cloudNext)}>
      {cloudPageBusy ? "Загружаем…" : "Загрузить ещё записи"}
    </button>
  }

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3500) }
  function navigate(next: Screen) {
    if (next === 'publish' && selected.isDemo) {
      const firstOwnBeat = beats.find((beat) => !beat.isDemo)
      if (firstOwnBeat) setSelectedId(firstOwnBeat.id)
    }
    setConfirmBatchReset(false)
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function openBeat(beat: Beat, nextTab: DetailTab = 'data', publication?: string) {
    setSelectedId(beat.id)
    setTab(nextTab)
    setFocusedPublication(publication)
    setDetailFromStats(screen === 'overview')
    setConfirmDelete(false)
    navigate('detail')
  }
  function openPublish(beat?: Beat, mode: 'single' | 'batch' = 'single') { if (beat && !beat.isDemo) { setSelectedId(beat.id); setPublishQuery('') } setPublishMode(mode); setPublicationPlatform('youtube'); navigate('publish') }
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

  async function publishTelegram(attemptId: string, channel: string, targets: Beat[], caption: string, options: { cover?: File; useSavedCover?: boolean; coverCaption?: string; republish?: boolean; trackCredits?: string[] }) {
    const { cover, useSavedCover, coverCaption = '', republish, trackCredits } = options
    if (!webApp?.initData) throw new Error('Открой XEINTY через Telegram.')
    if (joinTrackCaption(trackCredits?.at(-1) ?? '', caption).length > telegramCaptionLimit) throw new Error('Сократи подпись до 1024 символов.')
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
      attemptId, channel, beatIds, caption, trackCredits, useSavedCover, coverCaption, republish, cover: cover ? await readPublicationCover(cover) : undefined,
    })
    rememberHashtags(caption, coverCaption)
    applyTelegramResult(result, beatIds)
    return result
  }

  function applyTelegramResult(result: TelegramPublication, beatIds = result.beatIds ?? []) {
    if (result.saved) setBeats((all) => all.map((beat) => beatIds.includes(beat.id) ? rememberPublication(beat, 'telegram', result.url) : beat))
  }

  function applyYoutubeSchedule(entries: { url: string; publishAt: string | null; previous?: string }[]) {
    const changes = new Map(entries.map((entry) => [entry.url, entry]))
    setBeats((all) => all.map((beat) => {
      const publications = getBeatPublications(beat)
      const matched = publications.filter((post) => {
        const change = changes.get(post.url)
        return post.platform === 'youtube' && change && (change.previous === undefined || Date.parse(change.previous) === Date.parse(post.publishAt ?? ''))
      })
      if (!matched.length) return beat
      const dates = new Map(matched.map((post) => [post.url, changes.get(post.url)!.publishAt]))
      return { ...beat,
        youtubePublishAt: dates.has(beat.youtubeLink) ? dates.get(beat.youtubeLink) : beat.youtubePublishAt,
        publications: publications.map((post) => post.platform === 'youtube' && dates.has(post.url) ? { ...post, publishAt: dates.get(post.url) } : post),
      }
    }))
  }

  async function reconcileYoutubeSchedule(current: { url: string; publishAt: string }[]) {
    if (!webApp?.initData) throw new Error('Открой XEINTY через Telegram.')
    const results = await Promise.all(Array.from({length: Math.ceil(current.length / 200)}, (_, index) =>
      refreshYoutubeSchedule(webApp.initData, current.slice(index * 200, index * 200 + 200).map(({url}) => url))))
    const previous = new Map(current.map((entry) => [entry.url, entry.publishAt]))
    const changes = results.flatMap(({entries}) => entries.filter((entry) => entry.publishAt === null ||
      Date.parse(entry.publishAt) !== Date.parse(previous.get(entry.url) ?? '')).map((entry) => ({...entry, previous: previous.get(entry.url)})))
    if (changes.length) applyYoutubeSchedule(changes)
    return { changed: changes.length, unavailable: results.reduce((sum, result) => sum + result.unavailable, 0) }
  }

  async function manageYoutubeSchedule(url: string, expectedPublishAt: string, publishAt: string | null) {
    if (!webApp?.initData) throw new Error('Открой XEINTY через Telegram.')
    const result = await changeYoutubeSchedule(webApp.initData, { beatId: selected.id, url, expectedPublishAt, publishAt })
    if (result.saved) {
      applyYoutubeSchedule([{url, publishAt: result.publishAt}])
      youtubeStats.refresh()
      notify(result.changed ? (result.publishAt ? 'Выход перенесён' : 'Выход отменён') : 'Расписание сверено с YouTube. Проверь статус видео.')
    }
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
  function chooseVideoInput(kind: 'audio' | 'cover', file: File | undefined) {
    if (!file || videoStage) return
    const supported = kind === 'audio' ? /\.(mp3|wav)$/i : /\.(jpe?g|png|webp)$/i
    if (!supported.test(file.name)) {
      setVideoError(kind === 'audio' ? 'Выбери аудиофайл MP3 или WAV.' : 'Выбери обложку JPG, PNG или WEBP.')
      return
    }
    setVideoError('')
    setVideoInputs({ ...temporaryVideoInputs, beatId: selected.id, [kind]: file })
    if (videoResult?.beatId === selected.id) {
      URL.revokeObjectURL(videoResult.url)
      videoUrlRef.current = null
      setVideoResult(null)
    }
  }

  async function createVideo() {
    if (videoStage) return
    if (missingVideoFiles && !telegramVideoSession) {
      setVideoError('')
      setVideoFileHintId(selected.id)
      return
    }
    setVideoFileHintId(undefined)
    setVideoError('')
    setVideoStage('preparing')
    const started = performance.now()
    try {
      async function resolveVideoFile(kind: 'audio' | 'cover', local: File | undefined, url: string | undefined, name: string) {
        if (local) return local
        if (url) return remoteFile(url, name)
        if (temporaryVideoInputs?.[kind]) return temporaryVideoInputs[kind]
        if (telegramVideoSession) return loadTelegramImportFile(telegramVideoSession, selected.id, kind)
        throw new Error('Выбери недостающие файлы с устройства.')
      }
      const cover = await resolveVideoFile('cover', selected.coverFile, selected.coverUrl, 'cover.jpg')
      const audio = await resolveVideoFile('audio', selected.audioFile, selected.audioUrl, selected.audioName ?? 'preview.mp3')
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
  async function deleteBeat(beat: Beat): Promise<boolean> {
    if (beat.isDemo || deleting) return false
    if (beat.cloud && !webApp?.initData) { notify('Открой XEINTY в Telegram, чтобы удалить запись'); return false }
    setDeleting(true)
    try {
      if (beat.cloud && webApp?.initData) await deleteCloudBeat(webApp.initData, beat.id)
      else await deleteStoredBeat(beat.id)
      if (audioPlayer.trackId === beat.id) audioPlayer.close()
      if (beat.coverUrl?.startsWith('blob:')) URL.revokeObjectURL(beat.coverUrl)
      if (beat.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(beat.audioUrl)
      if (videoResult?.beatId === beat.id) {
        URL.revokeObjectURL(videoResult.url)
        setVideoResult(null)
      }
      setVideoInputs((inputs) => inputs?.beatId === beat.id ? undefined : inputs)
      setBeats((all) => all.filter((item) => item.id !== beat.id))
      setConfirmDelete(false)
      if (screen === 'detail') navigate('library')
      notify(beat.cloud ? 'Запись удалена из облака' : 'Запись удалена с этого устройства')
      return true
    } catch {
      notify(beat.cloud ? 'Не удалось удалить запись из облака' : 'Не удалось удалить запись с устройства')
      return false
    } finally {
      setDeleting(false)
    }
  }

  function recordPost(beat: Beat) {
    const source = beat.telegramSourceUrl && postUrl(beat.telegramSourceUrl, 'telegram')
    if (source) return { url: source, platform: 'telegram' as const }
    for (const post of getBeatPublications(beat)) {
      const url = postUrl(post.url, post.platform)
      if (url) return { url, platform: post.platform }
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
    { id: 'library' as Screen, label: 'Библиотека', Icon: ListMusic },
    { id: 'publish' as Screen, label: 'Публикация', Icon: Send },
    { id: 'channels' as Screen, label: 'Каналы', Icon: Radio },
    { id: 'overview' as Screen, label: 'Статистика', Icon: AudioLines },
    { id: 'more' as Screen, label: 'Ещё', Icon: Ellipsis },
  ]

  const activeScreen = screen === 'detail' || screen === 'create' ? 'library' : screen === 'templates' ? 'more' : screen === 'import' ? 'channels' : screen
  const showImportPrompt = screen === 'library' && importPromptVisible()
  const importedMetadata = screen === 'detail' && tab === 'data' ? missingImportedMetadata(selected) : undefined
  const latestMetadata = screen === 'library' ? recordMetadata(latest).join(' · ') : ''
  const detailMetadata = screen === 'detail' ? recordMetadata(selected) : []
  const mobileNav = nav.filter(({ id }) => id !== 'overview')
  const activeNavIndex = nav.findIndex(({ id }) => id === activeScreen)
  const activeMobileIndex = mobileNav.findIndex(({ id }) => id === activeScreen)

  return <div className={'app-shell' + (playingTrack ? ' has-audio-dock' : '')} ref={shellRef}>
    <div className="ambient-stage" aria-hidden="true">
      <div className="ambient-form ambient-form--a" />
      <div className="ambient-form ambient-form--b" />
    </div>
    <div className="app-frame">
      <header className="topbar"><button className="topbar-action topbar-create" onClick={() => cloudAvailable ? openImport() : navigate("create")} aria-label={cloudAvailable ? "Импортировать аудио" : "Добавить аудио"}><Plus size={20} /></button><button className="wordmark" onClick={() => navigate('library')} aria-label="XEINTY — к библиотеке"><img src={xeintyLogo} alt="" width={48} height={48} /></button><span className="topbar-badge">Демо-версия</span><button className="topbar-action topbar-overview" onClick={() => navigate('overview')} aria-label="Открыть статистику"><AudioLines size={19} /></button></header>
      <div className="workspace">
        <aside className="desktop-rail" aria-label="Навигация"><div className="rail-head"><strong>Рабочее пространство</strong><span>Аудио и публикации</span></div><nav style={{ '--nav-i': activeNavIndex } as CSSProperties}>{nav.map(({ id, label, Icon }) => <button key={id} className={activeScreen === id ? 'is-active' : ''} onClick={() => navigate(id)}><Icon size={19} />{label}<ChevronRight size={16} /></button>)}</nav><div className="rail-footer"><AudioLines size={18} /><span>Аудио, исходные посты и статистика.</span></div></aside>
        <main className="main-content" key={screen}>
          {screen === 'library' && <>
            {showImportPrompt && <section className="form-panel import-invite" aria-label="Импорт библиотеки">
              <div className="section-intro"><h2>Уже публикуешь музыку в Telegram?</h2><p>Перенеси каталог из своего канала.</p></div>
              <div className="import-actions"><button type="button" className="primary-button" onClick={() => openImport()}>Импортировать из Telegram</button>
                <button type="button" className="outline-button" onClick={dismissImportPrompt}>Позже</button></div>
            </section>}
            {importSuggestions.some((item) => channels.some(({ id }) => id === item.channel)) && <section className="form-panel import-invite" aria-label="Новое аудио в Telegram">
              <div className="section-intro"><h2>Новое аудио в Telegram</h2></div>
              <ul className="channel-suggestions">{importSuggestions.map((item) => {
                const channel = channels.find(({ id }) => id === item.channel)
                return channel && <li className="channel-row" key={item.channel}>
                  <div><strong>{channel.title}</strong><small>Новых аудио: {item.count}</small></div>
                  <button type="button" className="outline-button" onClick={() => openImport(item)}>Посмотреть <ArrowRight size={15} /></button>
                </li>
              })}</ul>
            </section>}
            <div className="library-context"><span>Последняя запись</span><span>{projectCount(beats.length)}</span></div>
            <section className="feature-section" aria-label="Последняя запись">
              <div className="feature-card">
                <div className="player-top"><Cover beat={latest} className="feature-cover" /><div className="feature-content"><span className="feature-status">{latest.isDemo ? 'Демо-проект' : latest.status}</span><h2>{latest.title}</h2>{latestMetadata && <p>{latestMetadata}</p>}</div><button className="player-open" onClick={() => openBeat(latest)} aria-label={`Открыть ${latest.title}`}><ChevronRight size={19} /></button></div>
                <div className="player-footer"><span>{latest.audioUrl ? latest.audioName : latest.telegramSourceUrl ? 'Аудио в исходном посте' : 'Аудио не загружено'}</span><div className="player-controls">{canPlay(latest) ? trackPlayButton(latest) : latest.telegramSourceUrl ? sourcePostLink(latest.telegramSourceUrl) : <button className="player-publish" onClick={() => openPublish(latest)} aria-label="Подготовить публикацию"><Send size={16} /><span>Публикация</span></button>}<button className="player-next" onClick={() => openBeat(latest)}>Открыть запись <ArrowRight size={16} /></button></div></div>
              </div>
            </section>
            <section className="tools-section"><div className="section-heading"><h2>Рабочие шаги</h2></div><div className="tool-grid"><button style={staggerStyle(0)} onClick={() => openBeat(latest, 'data')}><ListMusic size={20} /><span>Параметры</span></button><button style={staggerStyle(1)} onClick={() => openPublish(latest)}><Clipboard size={20} /><span>Публикация</span></button><button style={staggerStyle(2)} onClick={() => openBeat(latest, 'publications')}><Link2 size={20} /><span>Публикации</span></button></div></section>
            <div className="library-add">
              {cloudAvailable && !showImportPrompt && <button type="button" className="primary-button" onClick={() => openImport()}><Send size={17} /> Импортировать из Telegram</button>}
              <button type="button" className="outline-button" onClick={() => navigate("create")}><UploadCloud size={17} /> Добавить файл с устройства</button>
            </div>
            <section className="list-section"><div className="list-header"><h2>Аудиобиблиотека</h2></div><LibraryControls filters={libraryFilters} onChange={setLibraryFilters} count={libraryBeats.length} total={beats.length} /><div className="beat-list">
              {libraryBeats.map((beat, index) => {
                const metadata = recordMetadata(beat).join(' · ')
                return <div className="beat-entry" key={beat.id} style={staggerStyle(index)}>
                  <button className="beat-row" type="button" onClick={() => openBeat(beat)}>
                    {beat.isDemo ? <span className="row-wave"><Waveform /></span> : <Cover beat={beat} className="row-cover" />}
                    <span className="row-main"><strong>{beat.title}</strong>{metadata && <small>{metadata}</small>}</span>
                    <span className="row-meta">{beat.telegramSourceUrl ? "Telegram" : beat.cloud ? "Облако" : beat.isDemo ? beat.status : "На устройстве"}</span>
                  </button>
                  <div className="record-actions">
                  {canPlay(beat) && trackPlayButton(beat)}
                  <RecordMenu title={beat.title} openRecord={() => openBeat(beat)} post={recordPost(beat)}
                    openTelegram={webApp?.openTelegramLink ? (url) => webApp.openTelegramLink?.(url) : undefined}
                    remove={!beat.isDemo ? () => deleteBeat(beat) : undefined} deleting={deleting} />
                  </div>
                </div>
              })}
            </div>{!libraryBeats.length && <p className="form-hint library-empty">По этому запросу ничего не найдено.</p>}{moreCloudBeats()}<p className="demo-note"><CircleHelp size={15} /> {cloudAvailable ? 'Облачная библиотека доступна в Telegram на других устройствах.' : 'Примеры показывают интерфейс. Свои файлы здесь сохраняются на этом устройстве.'}</p></section>
          </>}
          {screen === 'create' && <>
            <div className="page-heading"><div><h1>Добавить аудио</h1><p>Добавь параметры, обложку и аудио для предпросмотра.</p></div></div>
            <form className="create-layout" onSubmit={addBeat}><div className="form-panel"><div className="panel-title"><span>01</span><div><h2>Основное</h2><p>Название и музыкальные параметры</p></div></div><label className="field"><span>Название записи *</span><input required maxLength={40} placeholder="Например, NO SIGNAL" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><div className="field-grid"><label className="field"><span>BPM</span><input type="number" min="1" max="300" placeholder="138" value={form.bpm} onChange={(e) => setForm({ ...form, bpm: e.target.value })} /></label><div className="field"><span>Тональность</span><KeyPicker value={form.key} onChange={(key) => setForm((current) => ({ ...current, key }))} onCommit={(value) => { const key = normalizeMusicKey(value); if (key !== null) setForm((current) => ({ ...current, key })) }} /></div></div><label className="field"><span>Теги и настроение</span><input placeholder="dark trap, ambient, type beat" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label></div>
              <div className="form-panel"><div className="panel-title"><span>02</span><div><h2>Файлы</h2><p>Обложка и аудио для предпросмотра</p></div></div><div className="upload-grid"><label className="upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} /><ImagePlus size={25} /><strong>{coverFile ? coverFile.name : 'Обложка'}</strong><span>PNG, JPG или WEBP</span></label><label className="upload-zone"><input type="file" accept={cloudAvailable ? '.mp3,audio/mpeg' : 'audio/*,.mp3,.wav'} onChange={(e) => chooseAudio(e.target.files?.[0] ?? null)} /><UploadCloud size={26} /><strong>{audioFile ? audioFile.name : 'Аудиофайл'}</strong><span>{cloudAvailable ? 'MP3 до 15 МБ' : 'MP3 или WAV'}</span></label></div><p className="form-hint">{cloudAvailable ? 'MP3 и обложка сохранятся в облаке. WAV и MP4 останутся на твоём устройстве.' : 'Файлы пока сохранятся на этом устройстве. Облако работает при запуске через Telegram после подключения проекта.'}</p></div>
              <div className="create-submit"><button type="submit" className="primary-button" disabled={savingBeat}>{savingBeat ? 'Сохраняем…' : 'Создать черновик'} {!savingBeat && <ArrowRight size={19} />}</button><span>{cloudAvailable ? 'Черновик будет доступен в Telegram на других устройствах.' : 'Черновик сохранится в этом браузере.'}</span></div></form>
          </>}
          {screen === 'publish' && <>
            <div className="page-heading"><div><h1>Публикация</h1><p>Подготовь публикацию или проверь расписание YouTube.</p></div></div>
            <div className={telegramPublishingEnabled ? "publish-mode publish-mode--three" : "publish-mode"} role="tablist" aria-label="Разделы публикации"
              style={{ '--tab-i': publishModes.findIndex(({id}) => id === publishMode) } as CSSProperties}>
              {publishModes.map(({id, label}) => <button key={id} role="tab" aria-selected={publishMode === id}
                className={publishMode === id ? 'is-active' : undefined} onClick={() => setPublishMode(id)}>{label}</button>)}
            </div>
            {publishMode === 'planned' && <PlannedReleases beats={beats} refresh={cloudAvailable ? reconcileYoutubeSchedule : undefined}
              openRelease={(id, url) => {
                const beat = beats.find((item) => item.id === id)
                if (beat) openBeat(beat, 'publications', url)
              }}
              openComposer={() => { setPublishMode('single'); setPublicationPlatform('youtube') }} />}
            {publishMode === 'single' && <div className="publish-stage" key="single">
              {publicationBeats.length ? <>
                <div className="publish-beat-search"><BeatSearch label="Поиск аудио для публикации" value={publishQuery} onChange={setPublishQuery} /></div>
                {publishQuery.trim() && (matchingPublicationBeats.length ? <ul className="publish-search-results" aria-label="Результаты поиска аудио">
                  {matchingPublicationBeats.map((beat) => <li key={beat.id}><button type="button" onClick={() => { setSelectedId(beat.id); setPublishQuery(""); setVideoError("") }}>
                    <span>{beat.title}</span><small>{[beat.bpm !== "—" ? beat.bpm + " BPM" : "", beat.key !== "—" ? beat.key : ""].filter(Boolean).join(" · ")}</small>
                    <ArrowRight size={15} aria-hidden="true" />
                  </button></li>)}
                </ul> : <p className="form-hint">По этому запросу ничего не найдено.</p>)}
              </> : <div className="publish-empty"><FileAudio2 size={25} /><strong>В библиотеке пока нет аудио</strong><p>Добавь запись, чтобы подготовить видео для YouTube.</p><button className="outline-button" onClick={() => cloudAvailable ? openImport() : navigate("create")}>{cloudAvailable ? "Импортировать из Telegram" : "Добавить аудио"} <ArrowRight size={17} /></button></div>}
              {moreCloudBeats()}
              {!selected.isDemo && <div className="detail-section">
              <div className="section-intro"><h2>Публикация на YouTube</h2><p>Выбрано · {selected.title}</p></div>
                {telegramPublishingEnabled && <div className="platform-switch" role="tablist" aria-label="Площадка" style={{ '--tab-i': publicationPlatform === 'youtube' ? 1 : 0 } as CSSProperties}><button role="tab" aria-selected={publicationPlatform === 'telegram'} className={publicationPlatform === 'telegram' ? 'is-active' : ''} onClick={() => setPublicationPlatform('telegram')}>Telegram</button><button role="tab" aria-selected={publicationPlatform === 'youtube'} className={publicationPlatform === 'youtube' ? 'is-active' : ''} onClick={() => setPublicationPlatform('youtube')}>YouTube</button></div>}
              <div className={telegramPublishingEnabled ? "publication-grid" : "publication-grid publication-grid--single"}>
                {telegramPublishingEnabled && <div className={`publication-card ${publicationPlatform === 'telegram' ? 'is-current' : ''}`}><div className="publication-card-head"><div className="platform-icon telegram-icon"><Send size={20} /></div><div><span>TELEGRAM</span><h3>Подпись к посту</h3></div></div><textarea aria-label="Подпись для Telegram" placeholder="Добавить подпись (необязательно)" value={selected.telegramCaption} maxLength={1024} onBlur={(e) => rememberHashtags(e.currentTarget.value)} onChange={(e) => updateBeat({ telegramCaption: e.target.value })} />{captionTools(selected.telegramCaption, (telegramCaption) => updateBeat({ telegramCaption }))}<label className="batch-cover-toggle"><input type="checkbox" checked={includeTelegramCover} onChange={(event) => toggleTelegramCover(event.target.checked)} /><span>Прикладывать обложку к посту</span></label>{cloudAvailable && selected.cloud && selected.audioUrl && <DirectTelegramPublication channels={channels} initData={webApp?.initData ?? ''} onRecovered={applyTelegramResult} key={selected.id} publishedCount={selected.telegramLink.trim() ? 1 : 0} publish={(attemptId, channel, republish) => publishTelegram(attemptId, channel, [selected], selected.telegramCaption, { useSavedCover: includeTelegramCover, republish })} />}
                  {selected.telegramSourceUrl && !selected.audioUrl && <p className="form-hint">Аудио этого бита доступно в исходном посте Telegram.</p>}
                </div>}
                <div className={`publication-card ${publicationPlatform === 'youtube' ? 'is-current' : ''}`}><div className="publication-card-head"><div className="platform-icon youtube-icon">▶</div><div><span>YOUTUBE</span><h3>Описание видео</h3></div></div><textarea aria-label="Описание для YouTube" placeholder="Описание (необязательно)" maxLength={5000} value={selected.youtubeDescription} onChange={(e) => updateBeat({ youtubeDescription: e.target.value })} />{captionTools(selected.youtubeDescription, (youtubeDescription) => updateBeat({ youtubeDescription }), 'youtube')}<label className="keywords-field"><span>КЛЮЧЕВЫЕ СЛОВА</span><input aria-label="Ключевые слова YouTube" value={selected.youtubeKeywords} onChange={(e) => updateBeat({ youtubeKeywords: e.target.value })} /></label>

              <div className="video-tool"><Dropdown label="Видео для YouTube" value={videoSource} onChange={(value) => setVideoSource(value === 'own' ? 'own' : 'generated')}
                  options={[{ value: 'generated', label: 'Собрать видео в XEINTY' }, { value: 'own', label: 'Приложить своё видео' }]} />
                {videoSource === 'own' ? <OwnYoutubeVideo key={selected.id} file={selectedOwnVideo} onChange={(file) => setOwnVideo(file ? { beatId: selected.id, file } : undefined)} /> : <>
                  {(needsVideoAudio || needsVideoCover) && <div className="video-file-hint" key={selected.id}>
                    <p className="form-hint">{telegramVideoSession && (!hasVideoAudio || !hasVideoCover)
                      ? 'При сборке XEINTY попробует получить недостающие файлы из Telegram. Можно выбрать их с устройства.'
                      : 'Файлы с устройства используются только для сборки видео.'}</p>
                    {needsVideoAudio && !hasVideoAudio && selected.telegramSourceUrl && sourcePostLink(selected.telegramSourceUrl)}
                    <div className="upload-grid">
                      {needsVideoAudio && <label className="upload-zone">
                        <input type="file" aria-label="Аудио для видео" accept=".mp3,.wav,audio/mpeg,audio/wav" disabled={Boolean(videoStage)}
                          onChange={(event) => { chooseVideoInput('audio', event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
                        <FileAudio2 size={22} aria-hidden="true" />
                        <strong>{temporaryVideoInputs?.audio?.name ?? 'Выбрать аудио'}</strong><span>MP3 или WAV</span>
                      </label>}
                      {needsVideoCover && <label className="upload-zone">
                        <input type="file" aria-label="Обложка для видео" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={Boolean(videoStage)}
                          onChange={(event) => { chooseVideoInput('cover', event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
                        <ImagePlus size={22} aria-hidden="true" />
                        <strong>{temporaryVideoInputs?.cover?.name ?? 'Выбрать обложку'}</strong><span>JPG, PNG или WEBP</span>
                      </label>}
                    </div>
                  </div>}
                  <button className="primary-button video-action" type="button" onClick={createVideo} disabled={videoStage !== null}>{videoStage ? 'Сборка идёт…' : 'Собрать MP4'} {!videoStage && <ArrowRight size={18} />}</button>
                  {videoStage && <p className="video-status" role="status">{videoStage === 'loading' ? 'Загружаем видеодвижок — около 31 МБ…' : videoStage === 'preparing' ? 'Подготавливаем файлы…' : 'Собираем видео. Не закрывай Telegram…'}</p>}
                  <p className="video-hint">{videoProfileLabel}</p>
                  {videoFileHintId === selected.id && missingVideoFiles && <div className="video-file-hint">
                    <p className="video-error" role="alert">Для сборки MP4 не хватает {missingVideoFiles}.</p>
                    {!hasVideoCover && <button type="button" className="outline-button" onClick={() => openBeat(selected)}>Открыть карточку бита <ArrowRight size={16} /></button>}
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
                openSchedule={() => setPublishMode('planned')}
                onSaved={({ url, publishAt }) => setBeats((all) => all.map((beat) => beat.id === selected.id ? rememberPublication(beat, 'youtube', url, publishAt) : beat))} />}
              {cloudAvailable && !selected.cloud && <p className="form-hint">Чтобы загрузить видео напрямую, перенеси бит в облако из карточки бита.</p>}
                </div>
              </div>

            </div>}
            </div>}
            {telegramPublishingEnabled && publishMode === 'batch' && <>
              <div className="section-intro"><h2>Пачка битов</h2><p>Несколько аудиофайлов для одного альбома Telegram.</p></div>
                        {batchDraft.status === "loading" ? <p className="form-hint" role="status">Открываем черновик…</p> : <div className="form-panel batch-panel">
              {(batchDraft.hasContent || batchDraft.status === "error") && <div className="batch-draft-bar">
                {batchDraft.status === "error" ? <>
                  <p className="video-error" role="alert">Не удалось сохранить или открыть черновик на этом устройстве.</p>
                  {batchDraft.canRetry && <button type="button" className="outline-button" onClick={() => batchDraft.update((draft) => draft)}>Сохранить снова</button>}
                </> : <p className="form-hint" role="status">{batchDraft.status === "saving" ? "Сохраняем черновик…" : "Черновик сохранён на этом устройстве"}</p>}
                {batchDraft.hasContent && (confirmBatchReset ? <>
                  <p className="form-hint">Очистить состав, подписи и файлы этой пачки?</p>
                  <button type="button" className="outline-button" onClick={() => { batchDraft.update(() => emptyBatchDraft); setConfirmBatchReset(false) }}>Подтвердить очистку</button>
                  <button type="button" className="outline-button" onClick={() => setConfirmBatchReset(false)}>Отмена</button>
                </> : <button type="button" className="outline-button" onClick={() => setConfirmBatchReset(true)}>Очистить черновик</button>)}
              </div>}
              {unavailableBatchBeats > 0 && <div className="batch-draft-bar">
                <p className="form-hint" role="status">Недоступных битов в черновике: {unavailableBatchBeats}. Проверь библиотеку перед отправкой.</p>
                <button type="button" className="outline-button" onClick={() => batchDraft.update((draft) => ({ ...draft, selectedIds: batchBeats.map((beat) => beat.id) }))}>Убрать недоступные биты</button>
              </div>}
              <div className="batch-library"><div className="batch-library-head"><strong>Выбрать из библиотеки</strong><span>{batchSelectedIds.length + batchFiles.length} / 10</span></div>
                {savedAudioBeats.length ? <>
                  <BeatSearch label="Поиск бита для пачки" value={batchQuery} onChange={setBatchQuery} />
                  {matchingBatchBeats.length ? <div className="batch-beat-list">{matchingBatchBeats.map((beat, index) => <button style={staggerStyle(index)} type="button" key={beat.id} className={batchSelectedIds.includes(beat.id) ? 'is-active' : ''} aria-pressed={batchSelectedIds.includes(beat.id)} onClick={() => toggleBatchBeat(beat.id)}><Cover beat={beat} className="publish-beat-cover" /><span><strong>{beat.title}</strong><small>{beat.bpm} BPM · {beat.key}</small></span><Check size={17} /></button>)}</div> : <p className="form-hint">По этому запросу ничего не найдено.</p>}
                  {batchBeats.length > 0 && <div className="batch-selection">
                    <strong>Порядок отправки</strong>
                    <ol className="batch-selection-list" aria-label="Порядок битов в пачке">
                      {batchBeats.map((beat, index) => <li key={beat.id}>
                        <div className="batch-selection-row">
                          <span>{beat.title}</span>
                          <div className="batch-selection-actions">
                            <button type="button" aria-label={"Поднять " + beat.title} disabled={index === 0} onClick={() => moveBatchBeat(beat.id, -1)}><ChevronUp size={16} /></button>
                            <button type="button" aria-label={"Опустить " + beat.title} disabled={index === batchBeats.length - 1} onClick={() => moveBatchBeat(beat.id, 1)}><ChevronDown size={16} /></button>
                            <button type="button" aria-label={"Убрать " + beat.title} onClick={() => toggleBatchBeat(beat.id)}><X size={16} /></button>
                          </div>
                        </div>
                        <BatchTrackCredits title={beat.title} value={batchCredits[beat.id] ?? ""}
                          onChange={(text) => batchDraft.update((draft) => ({ ...draft, credits: { ...draft.credits, [beat.id]: text } }))} />
                      </li>)}
                    </ol>
                  </div>}
                </> : <div className="batch-library-empty"><p>В библиотеке пока нет битов с аудиофайлом.</p><button type="button" onClick={() => navigate('create')}>Добавить бит <ArrowRight size={15} /></button></div>}
              </div>
              {moreCloudBeats()}
              <div className="batch-import"><span>ИЛИ ДОБАВЬ С УСТРОЙСТВА</span><label className="upload-zone"><input type="file" multiple accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={(event) => { chooseBatch(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '' }} /><FileAudio2 size={26} /><strong>{batchFiles.length ? `${batchFiles.length} аудиофайлов` : 'Выбрать аудиофайлы'}</strong><span>MP3 или WAV</span></label></div>
              {batchFiles.length > 0 && <ol className="batch-file-list">{batchFiles.map((file, index) => <li key={index + "-" + file.name}>
                <span>{file.name}</span><button type="button" className="outline-button" aria-label={"Убрать файл " + file.name}
                  onClick={() => batchDraft.update((draft) => ({ ...draft, files: draft.files.filter((_, item) => item !== index) }))}><X size={16} /></button>
              </li>)}</ol>}
              <label className="batch-cover-toggle"><input type="checkbox" checked={batchIncludeCover} onChange={(event) => {
                const includeCover = event.currentTarget.checked
                toggleTelegramCover(includeCover)
                batchDraft.update((draft) => ({ ...draft, includeCover }))
              }} /><span>Прикладывать обложку к посту</span></label>
              {batchIncludeCover && <label className="upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                const cover = event.currentTarget.files?.[0] ?? null
                event.currentTarget.value = ""
                if (!cover) return
                if (cover.size > 2 * 1024 * 1024) { notify("Обложка должна быть до 2 МБ."); return }
                batchDraft.update((draft) => ({ ...draft, cover }))
              }} /><ImagePlus size={24} /><strong>{batchCoverFile?.name ?? "Общая обложка"}</strong><span>JPG, PNG или WEBP до 2 МБ</span></label>}
              {batchIncludeCover && batchCoverFile && <>
                <button type="button" className="outline-button batch-remove-cover" onClick={() => batchDraft.update((draft) => ({ ...draft, cover: null }))}>Убрать обложку</button>
                <label className="field"><span>Подпись к обложке</span><textarea className="batch-caption" maxLength={1024} value={batchCoverCaption} onBlur={(event) => rememberHashtags(event.currentTarget.value)} onChange={(event) => { const coverCaption = event.currentTarget.value; batchDraft.update((draft) => ({ ...draft, coverCaption })) }} placeholder="Необязательно" /></label>
                {captionTools(batchCoverCaption, (coverCaption) => batchDraft.update((draft) => ({ ...draft, coverCaption })), 'batch')}
              </>}
              <label className="field"><span>Подпись к аудио</span><textarea className="batch-caption" maxLength={1024} value={batchCaption} onBlur={(event) => rememberHashtags(event.currentTarget.value)} onChange={(event) => { const caption = event.currentTarget.value; batchDraft.update((draft) => ({ ...draft, caption })) }} placeholder="Необязательно" /></label>
              {captionTools(batchCaption, (caption) => batchDraft.update((draft) => ({ ...draft, caption })), 'batch')}

              {(batchBeats.length > 0 || batchFiles.length > 0) && <BatchPreview
                tracks={[
                  ...batchBeats.map((beat) => ({ ...beat, credits: batchCredits[beat.id] })),
                  ...batchFiles.map((file, index) => ({ id: "file:" + index, title: file.name })),
                ]}
                cover={batchIncludeCover ? batchCoverFile : null} coverCaption={batchCoverCaption}
                caption={batchCaption} lastCaptionLength={lastBatchCaptionLength} unavailable={unavailableBatchBeats} />}
              {lastCaptionTooLong && <p className="video-error" role="alert">Сократи общую подпись или подпись к последнему треку. Вместе они должны занимать до 1024 символов.</p>}
              {cloudAvailable && batchBeats.length > 0 && !unavailableBatchBeats && batchBeats.every((beat) => beat.cloud) && batchFiles.length === 0 &&
                <DirectTelegramPublication channels={channels} initData={webApp?.initData ?? ""} onRecovered={applyTelegramResult}
                  key={batchBeats.map((beat) => beat.id).sort().join(",")} publishedCount={batchBeats.filter((beat) => beat.telegramLink.trim()).length}
                  hasTrackCredits={hasTrackCredits} blocked={lastCaptionTooLong}
                  publish={(attemptId, channel, republish) => publishTelegram(attemptId, channel, batchBeats, batchCaption, {
                    cover: batchIncludeCover ? batchCoverFile ?? undefined : undefined,
                    coverCaption: batchIncludeCover && batchCoverFile ? batchCoverCaption : "",
                    trackCredits: hasTrackCredits ? trackCredits : undefined, republish,
                  })} />}
              {cloudAvailable && (batchFiles.length > 0 || batchBeats.some((beat) => !beat.cloud)) &&
                <p className="form-hint">Для прямой публикации выбери MP3 из облачной библиотеки. Файлы с устройства можно прикрепить вручную в Telegram.</p>}
              {batchBeats.length > 0 && <p className="form-hint">Ссылка сохранится у всех выбранных битов из библиотеки.</p>}
            </div>}
            </>}
          </>}
          {screen === 'more' && <>
            <div className="page-heading"><div><h1>Ещё</h1></div></div>
            <section className="form-panel theme-panel" aria-labelledby="theme-heading">
              <div className="section-intro"><h2 id="theme-heading">Оформление</h2></div>
              <div className="publish-mode theme-switch" role="group" aria-label="Тема оформления"
                style={{ "--tab-i": theme === "light" ? 1 : 0 } as CSSProperties}>
                <button type="button" className={theme === "dark" ? "is-active" : undefined} aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}><Moon size={16} aria-hidden="true" /> Тёмная</button>
                <button type="button" className={theme === "light" ? "is-active" : undefined} aria-pressed={theme === "light"} onClick={() => setTheme("light")}><Sun size={16} aria-hidden="true" /> Светлая</button>
              </div>
            </section>
            <button type="button" className="outline-button" onClick={() => navigate("templates")}>Шаблоны публикаций <ArrowRight size={17} /></button>
          </>}
          {screen === 'templates' && <>
            <button className="back-link" onClick={() => navigate('more')}><ArrowLeft size={17} /> Ещё</button>
            <div className="page-heading"><div><h1>Шаблоны публикаций</h1></div></div>
            <CaptionTemplates templates={captionPreferences.templates} onChange={(templates) => setCaptionPreferences((current) => ({ ...current, templates }))} />
          </>}
          {screen === 'import' && <>
            <button className="back-link" onClick={() => navigate("channels")}><ArrowLeft size={17} /> Каналы</button>
            <div className="page-heading"><div><h1>Импорт из Telegram</h1><p>Добавь карточки со ссылками на аудио из своего канала.</p></div></div>
            <TelegramImport initData={cloudAvailable ? webApp?.initData : undefined} channels={channels} initialSuggestion={importSuggestion}
              openChannels={() => navigate("channels")} openLibrary={() => navigate("library")} onSaved={() => { void loadLibraryPage(); setImportRevision((value) => value + 1) }} />
          </>}
          {screen === 'channels' && <>
            <div className="page-heading"><div><h1>Каналы</h1><p>Импорт из Telegram и публикация на YouTube.</p></div></div>
            <TelegramChannels available={cloudAvailable} initData={webApp?.initData} channels={channels} loadError={channelLoadError} onConnect={addChannel} onDisconnect={removeChannel} />
            <YoutubeChannelSettings initData={cloudAvailable ? webApp?.initData : undefined}
              openLink={webApp?.openLink ? (url) => webApp.openLink?.(url) : undefined} />
          </>}
          {screen === 'overview' && <>
            <div className="page-heading"><div><h1>Статистика</h1><p>{cloudNext || beats.filter((beat) => beat.cloud).length > 200 ? "Сводка по последним 200 битам. Статистика остальных доступна в карточках." : "Показатели публикаций из библиотеки битов."}</p></div></div>
            <StatsOverview beats={beats} ranking={statsRanking} setRanking={setStatsRanking} platform={statsPlatform} setPlatform={setStatsPlatform} state={statsPlatform === 'youtube' ? youtubeStats : telegramStats} openChannels={() => navigate('channels')}
              openPublication={() => openPublish()} openBeat={(id) => {
                const beat = beats.find((item) => item.id === id)
                if (beat) openBeat(beat, 'publications')
              }} />
          </>}
          {screen === 'detail' && selected && <>
            <button className="back-link" onClick={() => navigate(focusedPublication ? 'publish' : detailFromStats ? 'overview' : 'library')}>
              <ArrowLeft size={17} /> {focusedPublication ? 'К расписанию' : detailFromStats ? 'К статистике' : 'Библиотека'}
            </button><section className="detail-hero"><Cover beat={selected} className="detail-cover" /><div className="detail-identity"><div className="eyebrow">{selected.isDemo ? 'Демо-проект' : selected.status}</div><h1>{selected.title}</h1><p>{selected.tags}</p>{detailMetadata.length > 0 && <div className="meta-row"><span>{detailMetadata[0]}</span>{detailMetadata[1] && <><i aria-hidden="true" /><span>{detailMetadata[1]}</span></>}</div>}<div className="detail-audio">{selected.audioUrl ? <><FileAudio2 size={17} /><span>{selected.audioName}</span>{trackPlayButton(selected)}</> : selected.telegramSourceUrl ? <>{sourcePostLink(selected.telegramSourceUrl)}{canPlay(selected) && trackPlayButton(selected)}</> : <><Music2 size={18} /><span>{selected.isDemo ? 'Аудио для этого демо-бита не загружено' : 'Аудиофайл не добавлен'}</span></>}</div></div></section>
            <div className="detail-tabs" role="tablist" aria-label="Разделы бита">{([['data', 'Данные'], ['publications', 'Публикации']] as [DetailTab, string][]).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
            {tab === 'data' && <div className="detail-section" key="data"><div className="section-intro"><h2>Данные записи</h2><p>Изменения сохраняются автоматически.</p></div><div className="data-card data-card--editable"><label className="field"><span>НАЗВАНИЕ</span><input aria-label="Название записи" maxLength={120} value={selected.title} onChange={(event) => updateBeat({ title: event.target.value })} /></label><label className="field"><span>ТЕМП (BPM)</span><input aria-label="Темп BPM" type="number" min="1" max="300" value={selected.bpm === '—' ? '' : selected.bpm} onChange={(event) => updateBeat({ bpm: event.target.value || '—' })} /></label><div className="field"><span>ТОНАЛЬНОСТЬ</span><KeyPicker value={selected.key} label="Тональность бита" onChange={(key) => updateBeat({ key })} onCommit={(value) => { const key = normalizeMusicKey(value); if (key !== null) updateBeat({ key: key || "—" }); else { updateBeat({ key: "—" }); notify("Не распознал тональность; выбери вариант из списка.") } }} /></div><label className="field"><span>ТЕГИ</span><input aria-label="Теги бита" value={selected.tags} onChange={(event) => updateBeat({ tags: event.target.value })} /></label></div>
              {importedMetadata && <button type="button" className="outline-button cover-edit" onClick={() => updateBeat(importedMetadata)}>
                <FileAudio2 size={16} aria-hidden="true" /> Подставить из имени файла
              </button>}
              {!selected.isDemo && <label className="upload-zone cover-edit"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void changeCover(event.target.files?.[0])} /><ImagePlus size={22} /><strong>Изменить обложку</strong><span>JPG, PNG или WEBP до 2 МБ</span></label>}<p className="detail-footnote">Подписи для площадок редактируются в разделе «Публикация». {selected.telegramSourceUrl ? 'Аудио доступно в исходном посте.' : selected.cloud ? 'MP3 и обложка хранятся в облаке.' : ''}</p>{!selected.isDemo && <div className="delete-beat">{cloudAvailable && !selected.cloud && <button onClick={migrateBeat} disabled={savingBeat}><UploadCloud size={16} /> {savingBeat ? 'Переносим…' : 'Перенести в облако'}</button>}{confirmDelete ? <><p>Удалить «{selected.title}» вместе с аудио и обложкой {selected.cloud ? 'из облака' : 'с этого устройства'}?</p><div><button onClick={() => setConfirmDelete(false)}>Отмена</button><button className="delete-beat-confirm" onClick={() => void deleteBeat(selected)} disabled={deleting}>Подтвердить удаление</button></div></> : <button onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Удалить бит</button>}</div>}</div>}
            {tab === 'publications' && <PublicationHistory key={selected.id} beat={selected} channels={channels} focusedUrl={focusedPublication}
              stats={cloudAvailable && selected.cloud ? { youtube: youtubeStats, telegram: telegramStats } : undefined} save={savePublicationLink}
              manageSchedule={cloudAvailable && selected.cloud ? manageYoutubeSchedule : undefined}
              openChannels={() => navigate('channels')} openPublication={() => openPublish(selected)} />}
          </>}
        </main>
      </div>
      {audioPlayer.element}
      {playingTrack && <AudioDock player={audioPlayer} track={audioTrack(playingTrack)} cover={<Cover beat={playingTrack} className="audio-dock-cover" />} />}
      <nav className="bottom-nav" aria-label="Главная навигация" data-has-active={activeMobileIndex >= 0} style={{ '--nav-i': Math.max(0, activeMobileIndex), '--nav-count': mobileNav.length } as CSSProperties}>{mobileNav.map(({ id, label, Icon }) => <button key={id} className={activeScreen === id ? 'is-active' : ''} onClick={() => navigate(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>
      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    </div>
  </div>
}

export default App
