import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, AudioLines, Check, ChevronRight, CircleHelp, Clipboard, Disc3, Download, ExternalLink, FileAudio2, ImagePlus, Link2, ListMusic, Music2, Pause, Play, Plus, Radio, Send, Trash2, UploadCloud } from 'lucide-react'
import { getTelegramWebApp } from './telegram'
import { makeStaticVideo, type VideoStage } from './video'
import { saveVideoFile } from './save-video'
import { deleteStoredBeat, loadStoredBeats, saveBeatMetadata, saveNewBeat, type StoredBeat } from './beat-store'
import { cloudConfigured, createCloudBeat, deleteCloudBeat, loadCloudBeats, remoteFile, updateCloudBeat } from './cloud-beats'

type Screen = 'library' | 'create' | 'overview' | 'detail'
type DetailTab = 'data' | 'publication' | 'links'
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
  return <div className={`cover cover--${beat.cover} ${className}`} style={beat.coverUrl ? { backgroundImage: `url("${beat.coverUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} role="img" aria-label={`Обложка ${beat.title}`} />
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

function App() {
  const [webApp, setWebApp] = useState(getTelegramWebApp)
  const [screen, setScreen] = useState<Screen>('library')
  const [tab, setTab] = useState<DetailTab>('publication')
  const [beats, setBeats] = useState<Beat[]>(demoBeats)
  const [selectedId, setSelectedId] = useState('no-signal')
  const [toast, setToast] = useState('')
  const [form, setForm] = useState({ title: '', bpm: '', key: '', tags: '' })
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [publicationPlatform, setPublicationPlatform] = useState<'telegram' | 'youtube'>('telegram')
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
  const selected = beats.find((beat) => beat.id === selectedId) ?? beats[0]
  const latest = beats[0]
  const cloudAvailable = cloudConfigured() && Boolean(webApp?.initData)

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
    webApp.expand()
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
        return { ...beat, cover: 0, coverUrl, audioUrl, audioFile: files?.audioFile, coverFile: files?.coverFile }
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
        ...saved.map((beat) => ({ ...beat, cover: 0 })),
        ...current.filter((beat) => !saved.some((remote) => remote.id === beat.id)),
      ])
    }).catch((error) => { if (!cancelled) notify(error instanceof Error ? error.message : 'Не удалось загрузить биты из облака') })
    return () => { cancelled = true }
  }, [webApp])

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3500) }
  function navigate(next: Screen) {
    playerRef.current?.pause()
    setIsPlaying(false)
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function openBeat(beat: Beat, nextTab: DetailTab = 'publication') { setSelectedId(beat.id); setTab(nextTab); setPublicationPlatform('telegram'); setConfirmDelete(false); navigate('detail') }
  function updateBeat(patch: Partial<Beat>) {
    const updated = { ...selected, ...patch }
    setBeats((all) => all.map((beat) => beat.id === selected.id ? updated : beat))
    if (updated.cloud && webApp?.initData) {
      const existing = cloudSaveTimersRef.current.get(updated.id)
      if (existing) window.clearTimeout(existing)
      const initData = webApp.initData
      const timer = window.setTimeout(() => {
        cloudSaveTimersRef.current.delete(updated.id)
        void updateCloudBeat(initData, storedBeat(updated)).catch(() => notify('Изменения не сохранились в облаке'))
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
  async function copyText(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); notify(`${label} скопирован`) }
    catch { notify('Не удалось скопировать. Выдели текст вручную.') }
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
  async function addBeat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.title.trim() || savingBeat) return
    if (cloudAvailable && (!audioFile || !/\.mp3$/i.test(audioFile.name))) {
      notify('Для облака выбери MP3. WAV останется у тебя для работы с проектом.')
      return
    }
    setSavingBeat(true)
    const beat: Beat = {
      id: `beat-${Date.now()}`, createdAt: Date.now(), title: form.title.trim().toUpperCase(), bpm: form.bpm || '—', key: form.key || '—',
      tags: form.tags.trim() || 'без тегов', status: 'Черновик', cover: 0,
      coverUrl: coverFile ? URL.createObjectURL(coverFile) : undefined,
      audioUrl: audioFile ? URL.createObjectURL(audioFile) : undefined, audioName: audioFile?.name, audioFile: audioFile ?? undefined, coverFile: coverFile ?? undefined,
      telegramCaption: `${form.title.trim().toUpperCase()} — ${form.bpm || '—'} BPM / ${form.key || '—'}\n\n${form.tags.trim() || '#typebeat'}`,
      youtubeDescription: `${form.title.trim().toUpperCase()} | Type Beat\n\nBPM: ${form.bpm || '—'} · Key: ${form.key || '—'}\n\nДля связи: @yourname`,
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
    { id: 'overview' as Screen, label: 'Обзор', Icon: AudioLines },
  ]

  return <div className="app-shell">
    <div className="app-frame">
      <header className="topbar"><button className="topbar-action topbar-create" onClick={() => navigate('create')} aria-label="Добавить новый бит"><Plus size={20} /></button><button className="wordmark" onClick={() => navigate('library')} aria-label="XEINTY — к библиотеке">Xeinty</button><span className="topbar-note">Студия битмейкера</span><span className="topbar-badge">Демо-версия</span><button className="topbar-action topbar-overview" onClick={() => navigate('overview')} aria-label="Открыть обзор"><AudioLines size={19} /></button></header>
      <div className="workspace">
        <aside className="desktop-rail" aria-label="Навигация"><div className="rail-head"><strong>Рабочее пространство</strong><span>Биты и публикации</span></div><nav>{nav.map(({ id, label, Icon }) => <button key={id} className={screen === id || (screen === 'detail' && id === 'library') ? 'is-active' : ''} onClick={() => navigate(id)}><Icon size={19} />{label}<ChevronRight size={16} /></button>)}</nav><div className="rail-footer"><AudioLines size={18} /><span>Один бит — все материалы для его публикации.</span></div></aside>
        <main className="main-content" key={screen}>
          {screen === 'library' && <>
            <div className="library-context"><span>Текущий проект</span><span>{projectCount(beats.length)}</span></div>
            <section className="feature-section" aria-label="Текущий бит">
              <div className="feature-card">
                <div className="player-top"><Cover beat={latest} className="feature-cover" /><div className="feature-content"><span className="feature-status">{latest.isDemo ? 'Демо-проект' : latest.status}</span><h2>{latest.title}</h2><p>{latest.bpm} BPM <span>·</span> {latest.key}</p><Waveform light /></div><button className="player-open" onClick={() => openBeat(latest)} aria-label={`Открыть ${latest.title}`}><ChevronRight size={19} /></button></div>
                <div className="player-footer"><span>{latest.audioUrl ? latest.audioName : 'Аудио не загружено'}</span><div className="player-controls">{latest.audioUrl ? <button className="player-play" onClick={togglePreview} aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'} title="Предпрослушать бит">{isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button> : <button className="player-publish" onClick={() => openBeat(latest, 'publication')} aria-label="Открыть тексты для публикации"><Send size={16} /><span>Тексты</span></button>}<button className="player-next" onClick={() => openBeat(latest)}>Открыть бит <ArrowRight size={16} /></button></div></div>
                {latest.audioUrl && <audio key={latest.id} ref={playerRef} src={latest.audioUrl} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} preload="metadata" />}
              </div>
            </section>
            <section className="tools-section"><div className="section-heading"><h2>Рабочие шаги</h2></div><div className="tool-grid"><button onClick={() => openBeat(latest, 'data')}><ListMusic size={20} /><span>Параметры</span></button><button onClick={() => openBeat(latest, 'publication')}><Clipboard size={20} /><span>Публикация</span></button><button onClick={() => openBeat(latest, 'links')}><Link2 size={20} /><span>Ссылки</span></button></div></section>
            <button className="upload-banner" onClick={() => navigate('create')}><span className="upload-banner-icon"><UploadCloud size={23} /></span><span><strong>Добавить свой бит</strong><small>Обложка, аудио, BPM и теги</small></span><span className="upload-banner-arrow"><ArrowRight size={18} /></span></button>
            <section className="list-section"><div className="list-header"><div><h2>Недавние проекты</h2></div><span className="demo-pill">{beats.every((beat) => beat.isDemo) ? 'Демо' : 'Демо и черновики'}</span></div><div className="beat-list">{beats.map((beat) => <button className="beat-row" key={beat.id} onClick={() => openBeat(beat)}>{beat.isDemo ? <span className="row-wave"><Waveform compact /></span> : <Cover beat={beat} className="row-cover" />}<span className="row-main"><strong>{beat.title}</strong><small>{beat.bpm} BPM · {beat.key}</small></span><span className="row-meta">{beat.cloud ? 'Облако' : beat.isDemo ? beat.status : 'На устройстве'}</span><ArrowRight className="row-arrow" size={18} /></button>)}</div><p className="demo-note"><CircleHelp size={15} /> {cloudAvailable ? 'Облачные биты доступны в Telegram на других устройствах. Локальные записи можно перенести из карточки бита.' : 'Примеры показывают интерфейс. Пока свои биты хранятся только на этом устройстве.'}</p></section>
          </>}
          {screen === 'create' && <>
            <div className="page-heading"><div><h1>Новый бит</h1><p>Добавь параметры, обложку и аудио для предпросмотра.</p></div></div>
            <form className="create-layout" onSubmit={addBeat}><div className="form-panel"><div className="panel-title"><span>01</span><div><h2>Основное</h2><p>Название и музыкальные параметры</p></div></div><label className="field"><span>Название бита *</span><input required maxLength={40} placeholder="Например, NO SIGNAL" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><div className="field-grid"><label className="field"><span>BPM</span><input type="number" min="1" max="300" placeholder="138" value={form.bpm} onChange={(e) => setForm({ ...form, bpm: e.target.value })} /></label><label className="field"><span>Тональность</span><input placeholder="F# minor" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /></label></div><label className="field"><span>Теги и настроение</span><input placeholder="dark trap, ambient, type beat" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label></div>
              <div className="form-panel"><div className="panel-title"><span>02</span><div><h2>Файлы</h2><p>Обложка и аудио для предпросмотра</p></div></div><div className="upload-grid"><label className="upload-zone"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} /><ImagePlus size={25} /><strong>{coverFile ? coverFile.name : 'Обложка'}</strong><span>PNG, JPG или WEBP</span></label><label className="upload-zone"><input type="file" accept={cloudAvailable ? '.mp3,audio/mpeg' : 'audio/*,.mp3,.wav'} onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)} /><UploadCloud size={26} /><strong>{audioFile ? audioFile.name : 'Аудиофайл'}</strong><span>{cloudAvailable ? 'MP3 до 15 МБ' : 'MP3 или WAV'}</span></label></div><p className="form-hint">{cloudAvailable ? 'MP3 и обложка сохранятся в облаке. WAV и MP4 останутся на твоём устройстве.' : 'Файлы пока сохранятся на этом устройстве. Облако работает при запуске через Telegram после подключения проекта.'}</p></div>
              <div className="create-submit"><button type="submit" className="primary-button" disabled={savingBeat}>{savingBeat ? 'Сохраняем…' : 'Создать черновик'} {!savingBeat && <ArrowRight size={19} />}</button><span>{cloudAvailable ? 'Черновик будет доступен в Telegram на других устройствах.' : 'Черновик сохранится в этом браузере.'}</span></div></form>
          </>}
          {screen === 'overview' && <>
            <div className="page-heading"><div><h1>Обзор</h1><p>Статистика всех опубликованных битов.</p></div></div><div className="overview-hero"><div className="overview-symbol"><AudioLines size={28} /></div><h2>Статистика появится позже</h2><p>Просмотры и динамика битов станут доступны после подключения Telegram и YouTube. Сейчас источники не подключены.</p><button className="outline-button" onClick={() => navigate('library')}>Вернуться к битам <ArrowRight size={18} /></button></div><div className="future-grid"><div><Radio size={22} /><strong>Telegram</strong><span>Статистика постов канала</span></div><div><Disc3 size={22} /><strong>YouTube</strong><span>Просмотры и публикации</span></div></div>
          </>}
          {screen === 'detail' && selected && <>
            <button className="back-link" onClick={() => navigate('library')}><ArrowLeft size={17} /> Все биты</button><section className="detail-hero"><Cover beat={selected} className="detail-cover" /><div className="detail-identity"><div className="eyebrow">{selected.isDemo ? 'Демо-проект' : 'Черновик'}</div><h1>{selected.title}</h1><p>{selected.tags}</p><div className="meta-row"><span>{selected.bpm} BPM</span><i /><span>{selected.key}</span></div><div className="detail-audio">{selected.audioUrl ? <><FileAudio2 size={17} /><span>{selected.audioName}</span><audio src={selected.audioUrl} controls preload="metadata" /></> : <><Music2 size={18} /><span>{selected.isDemo ? 'Аудио для этого демо-бита не загружено' : 'Аудиофайл не добавлен'}</span></>}</div></div></section>
            <div className="detail-tabs" role="tablist" aria-label="Разделы бита">{([['data', 'Данные'], ['publication', 'Публикация'], ['links', 'Ссылки']] as [DetailTab, string][]).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
            {tab === 'data' && <div className="detail-section"><div className="section-intro"><h2>Данные бита</h2><p>Основные параметры проекта.</p></div><div className="data-card"><div><span>НАЗВАНИЕ</span><strong>{selected.title}</strong></div><div><span>ТЕМП</span><strong>{selected.bpm} BPM</strong></div><div><span>ТОНАЛЬНОСТЬ</span><strong>{selected.key}</strong></div><div><span>ТЕГИ</span><strong>{selected.tags}</strong></div></div><p className="detail-footnote">{selected.cloud ? 'MP3 и обложка хранятся в облаке.' : 'Редактирование данных добавим в следующей версии интерфейса.'}</p>{!selected.isDemo && <div className="delete-beat">{cloudAvailable && !selected.cloud && <button onClick={migrateBeat} disabled={savingBeat}><UploadCloud size={16} /> {savingBeat ? 'Переносим…' : 'Перенести в облако'}</button>}{confirmDelete ? <><p>Удалить «{selected.title}» вместе с аудио и обложкой {selected.cloud ? 'из облака' : 'с этого устройства'}?</p><div><button onClick={() => setConfirmDelete(false)}>Отмена</button><button className="delete-beat-confirm" onClick={deleteBeat} disabled={deleting}>Подтвердить удаление</button></div></> : <button onClick={() => setConfirmDelete(true)}><Trash2 size={16} /> Удалить бит</button>}</div>}</div>}
            {tab === 'publication' && <div className="detail-section">
              <div className="section-intro"><h2>Публикация</h2><p>Подстрой тексты под площадку и скопируй готовый вариант.</p></div>
              <div className="platform-switch" role="tablist" aria-label="Площадка"><button role="tab" aria-selected={publicationPlatform === 'telegram'} className={publicationPlatform === 'telegram' ? 'is-active' : ''} onClick={() => setPublicationPlatform('telegram')}>Telegram</button><button role="tab" aria-selected={publicationPlatform === 'youtube'} className={publicationPlatform === 'youtube' ? 'is-active' : ''} onClick={() => setPublicationPlatform('youtube')}>YouTube</button></div>
              <div className="publication-grid">
                <div className={`publication-card ${publicationPlatform === 'telegram' ? 'is-current' : ''}`}><div className="publication-card-head"><div className="platform-icon telegram-icon"><Send size={20} /></div><div><span>TELEGRAM</span><h3>Подпись к посту</h3></div></div><textarea aria-label="Подпись для Telegram" value={selected.telegramCaption} onChange={(e) => updateBeat({ telegramCaption: e.target.value })} /><button className="copy-button" onClick={() => copyText(selected.telegramCaption, 'Текст Telegram')}><Clipboard size={16} /> Скопировать текст <ArrowRight size={16} /></button></div>
                <div className={`publication-card ${publicationPlatform === 'youtube' ? 'is-current' : ''}`}><div className="publication-card-head"><div className="platform-icon youtube-icon">▶</div><div><span>YOUTUBE</span><h3>Описание видео</h3></div></div><textarea aria-label="Описание для YouTube" value={selected.youtubeDescription} onChange={(e) => updateBeat({ youtubeDescription: e.target.value })} /><button className="copy-button" onClick={() => copyText(selected.youtubeDescription, 'Описание YouTube')}><Clipboard size={16} /> Скопировать описание <ArrowRight size={16} /></button><label className="keywords-field"><span>КЛЮЧЕВЫЕ СЛОВА</span><input aria-label="Ключевые слова YouTube" value={selected.youtubeKeywords} onChange={(e) => updateBeat({ youtubeKeywords: e.target.value })} /></label><button className="copy-button copy-button--subtle" onClick={() => copyText(selected.youtubeKeywords, 'Ключевые слова')}><Clipboard size={16} /> Скопировать ключевые слова <ArrowRight size={16} /></button></div>
              </div>
              <div className="video-tool"><div className="video-tool-head"><div className="next-feature-icon"><ImagePlus size={22} /></div><div><strong>Видео из обложки и аудио</strong><p>Пробная сборка MP4 16:9 на твоём устройстве. Файлы не отправляются на сервер.</p></div></div>
                {(selected.audioFile || selected.audioUrl) && (selected.coverFile || selected.coverUrl) ? <>
                  <button className="primary-button video-action" onClick={createVideo} disabled={videoStage !== null}>{videoStage ? 'Сборка идёт…' : 'Собрать MP4'} {!videoStage && <ArrowRight size={18} />}</button>
                  {videoStage && <p className="video-status" role="status">{videoStage === 'loading' ? 'Загружаем видеодвижок — около 31 МБ…' : videoStage === 'preparing' ? 'Подготавливаем файлы…' : 'Собираем видео. Не закрывай Telegram…'}</p>}
                  {videoError && <p className="video-error" role="alert">{videoError}</p>}
                  {videoResult?.beatId === selected.id && <div className="video-result"><video src={videoResult.url} controls playsInline preload="metadata" aria-label={`Готовое видео ${selected.title}`} /><p>MP4 · {(videoResult.size / 1024 / 1024).toFixed(1)} МБ · сборка {videoResult.seconds} с</p><div className="video-save-actions"><button className="video-download" onClick={saveVideo}><Download size={17} /> Сохранить MP4</button><a className="video-download video-download--secondary" href={videoResult.url} download={`${selected.title.replace(/[^a-z0-9а-яё-]+/gi, '-').toLowerCase()}.mp4`}>Обычная загрузка</a></div></div>}
                </> : <p className="video-hint">Для сборки MP4 нужны обложка и MP3 или WAV. Демо-биты без файлов собрать нельзя.</p>}
              </div>
            </div>}
            {tab === 'links' && <div className="detail-section"><div className="section-intro"><h2>Ссылки</h2><p>Адреса опубликованных поста и видео.</p></div><div className="links-panel"><label className="field"><span>ПОСТ В TELEGRAM</span><div className="link-input"><Link2 size={18} /><input type="url" placeholder="https://t.me/yourchannel/123" value={selected.telegramLink} onChange={(e) => updateBeat({ telegramLink: e.target.value })} />{selected.telegramLink && <a href={selected.telegramLink} target="_blank" rel="noreferrer" aria-label="Открыть Telegram"><ExternalLink size={17} /></a>}</div></label><label className="field"><span>ВИДЕО НА YOUTUBE</span><div className="link-input"><Link2 size={18} /><input type="url" placeholder="https://youtube.com/watch?v=..." value={selected.youtubeLink} onChange={(e) => updateBeat({ youtubeLink: e.target.value })} />{selected.youtubeLink && <a href={selected.youtubeLink} target="_blank" rel="noreferrer" aria-label="Открыть YouTube"><ExternalLink size={17} /></a>}</div></label><p className="form-hint">{selected.cloud ? 'Ссылки сохраняются в облаке.' : 'Ссылки сохраняются на этом устройстве.'}</p></div></div>}
          </>}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Главная навигация">{nav.map(({ id, label, Icon }) => <button key={id} className={screen === id || (screen === 'detail' && id === 'library') ? 'is-active' : ''} onClick={() => navigate(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>
      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    </div>
  </div>
}

export default App
