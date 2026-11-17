import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, AudioLines, Check, ChevronRight, CircleHelp, Clipboard, Disc3, ExternalLink, FileAudio2, ImagePlus, Link2, ListMusic, Music2, Plus, Radio, Send, Sparkles, UploadCloud } from 'lucide-react'
import { getTelegramWebApp } from './telegram'

type Screen = 'library' | 'create' | 'overview' | 'detail'
type DetailTab = 'data' | 'publication' | 'links'
type Beat = {
  id: string; title: string; bpm: string; key: string; tags: string; status: string
  cover: number; coverUrl?: string; audioUrl?: string; audioName?: string
  telegramCaption: string; youtubeDescription: string; youtubeKeywords: string; telegramLink: string; youtubeLink: string; isDemo?: boolean
}

const demoBeats: Beat[] = [
  { id: 'no-signal', title: 'NO SIGNAL', bpm: '138', key: 'F# minor', tags: 'dark trap · ambient · type beat', status: 'Черновик', cover: 0, telegramCaption: 'NO SIGNAL — 138 BPM / F# minor\n\nDark trap · ambient type beat\n\n#typebeat #darktrap #beats', youtubeDescription: 'NO SIGNAL | Dark Trap Type Beat\n\nBPM: 138 · Key: F# minor\n\nДля связи и покупки бита: @yourname', youtubeKeywords: 'dark trap type beat, ambient trap beat, no signal beat', telegramLink: '', youtubeLink: '', isDemo: true },
  { id: 'silhouette', title: 'SILHOUETTE', bpm: '92', key: 'C minor', tags: 'r&b · nocturnal · type beat', status: 'К публикации', cover: 1, telegramCaption: 'SILHOUETTE — 92 BPM / C minor\n\nR&B · nocturnal type beat\n\n#typebeat #rnb #beats', youtubeDescription: 'SILHOUETTE | R&B Type Beat\n\nBPM: 92 · Key: C minor\n\nДля связи и покупки бита: @yourname', youtubeKeywords: 'rnb type beat, nocturnal rnb beat, silhouette beat', telegramLink: '', youtubeLink: '', isDemo: true },
  { id: 'after-hours', title: 'AFTER HOURS', bpm: '105', key: 'A minor', tags: 'melodic · trap soul · type beat', status: 'Черновик', cover: 2, telegramCaption: 'AFTER HOURS — 105 BPM / A minor\n\nMelodic trap soul type beat\n\n#typebeat #trapsoul #beats', youtubeDescription: 'AFTER HOURS | Melodic Trap Soul Type Beat\n\nBPM: 105 · Key: A minor\n\nДля связи и покупки бита: @yourname', youtubeKeywords: 'melodic trap type beat, trap soul beat, after hours beat', telegramLink: '', youtubeLink: '', isDemo: true },
]

function Cover({ beat, className = '' }: { beat: Beat; className?: string }) {
  return <div className={`cover cover--${beat.cover} ${className}`} style={beat.coverUrl ? { backgroundImage: `url("${beat.coverUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} role="img" aria-label={`Обложка ${beat.title}`} />
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
  const selected = beats.find((beat) => beat.id === selectedId) ?? beats[0]
  const latest = beats[0]

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

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(''), 3500) }
  function navigate(next: Screen) { setScreen(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function openBeat(beat: Beat, nextTab: DetailTab = 'publication') { setSelectedId(beat.id); setTab(nextTab); navigate('detail') }
  function updateBeat(patch: Partial<Beat>) { setBeats((all) => all.map((beat) => beat.id === selected.id ? { ...beat, ...patch } : beat)) }
  async function copyText(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); notify(`${label} скопирован`) }
    catch { notify('Не удалось скопировать. Выдели текст вручную.') }
  }
  function addBeat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.title.trim()) return
    const beat: Beat = {
      id: `beat-${Date.now()}`, title: form.title.trim().toUpperCase(), bpm: form.bpm || '—', key: form.key || '—',
      tags: form.tags.trim() || 'без тегов', status: 'Черновик', cover: 0,
      coverUrl: coverFile ? URL.createObjectURL(coverFile) : undefined,
      audioUrl: audioFile ? URL.createObjectURL(audioFile) : undefined, audioName: audioFile?.name,
      telegramCaption: `${form.title.trim().toUpperCase()} — ${form.bpm || '—'} BPM / ${form.key || '—'}\n\n${form.tags.trim() || '#typebeat'}`,
      youtubeDescription: `${form.title.trim().toUpperCase()} | Type Beat\n\nBPM: ${form.bpm || '—'} · Key: ${form.key || '—'}\n\nДля связи: @yourname`,
      youtubeKeywords: form.tags.trim().replaceAll(' · ', ', '), telegramLink: '', youtubeLink: '',
    }
    setBeats((all) => [beat, ...all])
    setForm({ title: '', bpm: '', key: '', tags: '' }); setAudioFile(null); setCoverFile(null)
    openBeat(beat, 'data'); notify('Черновик добавлен на время этой сессии')
  }
  const nav = [
    { id: 'library' as Screen, label: 'Биты', Icon: ListMusic },
    { id: 'create' as Screen, label: 'Создать', Icon: Plus },
    { id: 'overview' as Screen, label: 'Обзор', Icon: AudioLines },
  ]

  return <div className="app-shell">
    <div className="ambient ambient--one" aria-hidden="true" /><div className="ambient ambient--two" aria-hidden="true" />
    <div className="app-frame">
      <header className="topbar"><button className="wordmark" onClick={() => navigate('library')} aria-label="XEINTY — к библиотеке">XEINTY<span>✳</span></button><span className="topbar-note">СТУДИЯ ДЛЯ БИТМЕЙКЕРА <i /></span><span className="topbar-badge"><i /> РАННИЙ ДОСТУП</span></header>
      <div className="workspace">
        <aside className="desktop-rail" aria-label="Навигация"><div className="rail-head"><span className="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span><strong>Твоя музыка,<br />твой темп.</strong></div><nav>{nav.map(({ id, label, Icon }) => <button key={id} className={screen === id || (screen === 'detail' && id === 'library') ? 'is-active' : ''} onClick={() => navigate(id)}><Icon size={19} />{label}<ChevronRight size={16} /></button>)}</nav><div className="rail-footer"><Sparkles size={18} /><span>От идеи до публикации — в одном месте.</span></div></aside>
        <main className="main-content" key={screen}>
          {screen === 'library' && <>
            <div className="page-heading heading-library"><div><div className="eyebrow"><i /> ТВОЯ СТУДИЯ / 01</div><h1>Библиотека<span>✳</span></h1><p>Все твои биты. От первого звука до релиза.</p></div><button className="primary-button heading-add" onClick={() => navigate('create')}><Plus size={20} /> Добавить бит</button></div>
            <section className="feature-section"><div className="section-topline"><span>В ФОКУСЕ</span><i /><span>01 / 0{beats.length}</span></div><div className="feature-card"><Cover beat={latest} className="feature-cover" /><div className="feature-content"><div className="feature-status"><i /> {latest.status.toUpperCase()}</div><h2>{latest.title}</h2><p>{latest.tags}</p><div className="meta-row"><span>{latest.bpm} BPM</span><i /><span>{latest.key}</span></div><button className="primary-button" onClick={() => openBeat(latest)}>Продолжить публикацию <ArrowRight size={19} /></button></div></div></section>
            <section className="list-section"><div className="list-header"><div><span className="eyebrow">КОЛЛЕКЦИЯ / {String(beats.length).padStart(2, '0')}</span><h2>Все биты</h2></div><span className="demo-pill">{beats.every((beat) => beat.isDemo) ? 'ДЕМО ДАННЫЕ' : 'ДЕМО + ЧЕРНОВИКИ'}</span></div><div className="beat-list">{beats.map((beat, index) => <button className="beat-row" key={beat.id} onClick={() => openBeat(beat)}><Cover beat={beat} className="row-cover" /><span className="row-main"><strong>{beat.title}</strong><small>{beat.tags}</small></span><span className="row-meta"><span>{beat.bpm} BPM</span><small>{beat.key}</small></span><span className="row-number">{String(index + 1).padStart(2, '0')}</span><ArrowRight className="row-arrow" size={18} /></button>)}</div><p className="demo-note"><CircleHelp size={15} /> Демо-биты показывают интерфейс. Твои данные пока доступны только в этой сессии.</p></section>
          </>}
          {screen === 'create' && <>
            <div className="page-heading"><div className="eyebrow"><i /> НОВЫЙ ПРОЕКТ / 02</div><h1>Новый бит<span>✳</span></h1><p>Начни с основного. Детали публикации добавишь позже.</p></div>
            <form className="create-layout" onSubmit={addBeat}><div className="form-panel"><div className="panel-title"><span>01</span><div><h2>Основное</h2><p>Название и музыкальные параметры</p></div></div><label className="field"><span>НАЗВАНИЕ БИТА *</span><input required maxLength={40} placeholder="Например, NO SIGNAL" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><div className="field-grid"><label className="field"><span>BPM</span><input type="number" min="1" max="300" placeholder="138" value={form.bpm} onChange={(e) => setForm({ ...form, bpm: e.target.value })} /></label><label className="field"><span>ТОНАЛЬНОСТЬ</span><input placeholder="F# minor" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} /></label></div><label className="field"><span>ТЕГИ И НАСТРОЕНИЕ</span><input placeholder="dark trap, ambient, type beat" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></label></div>
              <div className="form-panel"><div className="panel-title"><span>02</span><div><h2>Файлы</h2><p>Обложка и аудио для предпросмотра</p></div></div><div className="upload-grid"><label className="upload-zone"><input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} /><ImagePlus size={25} /><strong>{coverFile ? coverFile.name : 'Обложка'}</strong><span>PNG, JPG или WEBP</span></label><label className="upload-zone"><input type="file" accept="audio/*,.mp3,.wav" onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)} /><UploadCloud size={26} /><strong>{audioFile ? audioFile.name : 'Аудиофайл'}</strong><span>MP3 или WAV</span></label></div><p className="form-hint">Файлы используются для предпросмотра и не сохраняются после закрытия приложения.</p></div>
              <div className="create-submit"><button type="submit" className="primary-button">Создать черновик <ArrowRight size={19} /></button><span>Данные пока хранятся только в открытой сессии.</span></div></form>
          </>}
          {screen === 'overview' && <>
            <div className="page-heading"><div className="eyebrow"><i /> АНАЛИТИКА / 03</div><h1>Обзор<span>✳</span></h1><p>Одна картина по всем твоим публикациям.</p></div><div className="overview-hero"><div className="overview-symbol"><AudioLines size={42} /></div><span className="eyebrow">СЛЕДУЮЩИЙ ЭТАП</span><h2>Слушай данные.<br /><em>Не гадай.</em></h2><p>Здесь появятся просмотры и динамика битов после подключения Telegram и YouTube. Сейчас источники не подключены.</p><button className="outline-button" onClick={() => navigate('library')}>Вернуться к битам <ArrowRight size={18} /></button></div><div className="future-grid"><div><Radio size={22} /><strong>Telegram</strong><span>Статистика постов канала</span></div><div><Disc3 size={22} /><strong>YouTube</strong><span>Просмотры и публикации</span></div></div>
          </>}
          {screen === 'detail' && selected && <>
            <button className="back-link" onClick={() => navigate('library')}><ArrowLeft size={17} /> Все биты</button><section className="detail-hero"><Cover beat={selected} className="detail-cover" /><div className="detail-identity"><div className="eyebrow"><i /> БИТ / {selected.isDemo ? 'ДЕМО' : 'ЧЕРНОВИК'}</div><h1>{selected.title}</h1><p>{selected.tags}</p><div className="meta-row"><span>{selected.bpm} BPM</span><i /><span>{selected.key}</span></div><div className="detail-audio">{selected.audioUrl ? <><FileAudio2 size={17} /><span>{selected.audioName}</span><audio src={selected.audioUrl} controls preload="metadata" /></> : <><Music2 size={18} /><span>{selected.isDemo ? 'Аудио для этого демо-бита не загружено' : 'Аудиофайл не добавлен'}</span></>}</div></div></section>
            <div className="detail-tabs" role="tablist" aria-label="Разделы бита">{([['data', 'Данные'], ['publication', 'Публикация'], ['links', 'Ссылки']] as [DetailTab, string][]).map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
            {tab === 'data' && <div className="detail-section"><div className="section-intro"><span className="eyebrow">01 / ПАРАМЕТРЫ</span><h2>Данные бита</h2><p>Основа, которую удобно держать под рукой.</p></div><div className="data-card"><div><span>НАЗВАНИЕ</span><strong>{selected.title}</strong></div><div><span>ТЕМП</span><strong>{selected.bpm} BPM</strong></div><div><span>ТОНАЛЬНОСТЬ</span><strong>{selected.key}</strong></div><div><span>ТЕГИ</span><strong>{selected.tags}</strong></div></div><p className="detail-footnote">Редактирование данных добавим в следующей версии интерфейса.</p></div>}
            {tab === 'publication' && <div className="detail-section">
              <div className="section-intro"><span className="eyebrow">02 / ПОДГОТОВКА</span><h2>Публикация</h2><p>Подстрой тексты под площадку и скопируй готовый вариант.</p></div>
              <div className="publication-grid">
                <div className="publication-card"><div className="publication-card-head"><div className="platform-icon telegram-icon"><Send size={20} /></div><div><span>TELEGRAM</span><h3>Подпись к посту</h3></div></div><textarea aria-label="Подпись для Telegram" value={selected.telegramCaption} onChange={(e) => updateBeat({ telegramCaption: e.target.value })} /><button className="copy-button" onClick={() => copyText(selected.telegramCaption, 'Текст Telegram')}><Clipboard size={16} /> Скопировать текст <ArrowRight size={16} /></button></div>
                <div className="publication-card"><div className="publication-card-head"><div className="platform-icon youtube-icon">▶</div><div><span>YOUTUBE</span><h3>Описание видео</h3></div></div><textarea aria-label="Описание для YouTube" value={selected.youtubeDescription} onChange={(e) => updateBeat({ youtubeDescription: e.target.value })} /><button className="copy-button" onClick={() => copyText(selected.youtubeDescription, 'Описание YouTube')}><Clipboard size={16} /> Скопировать описание <ArrowRight size={16} /></button><label className="keywords-field"><span>КЛЮЧЕВЫЕ СЛОВА</span><input aria-label="Ключевые слова YouTube" value={selected.youtubeKeywords} onChange={(e) => updateBeat({ youtubeKeywords: e.target.value })} /></label><button className="copy-button copy-button--subtle" onClick={() => copyText(selected.youtubeKeywords, 'Ключевые слова')}><Clipboard size={16} /> Скопировать ключевые слова <ArrowRight size={16} /></button></div>
              </div>
              <div className="next-feature"><div className="next-feature-icon"><ImagePlus size={22} /></div><div><strong>Видео из обложки и аудио</strong><p>Автоматическая сборка статичного видео появится на следующем этапе.</p></div><span>СКОРО</span></div>
            </div>}
            {tab === 'links' && <div className="detail-section"><div className="section-intro"><span className="eyebrow">03 / ПОСЛЕ ПУБЛИКАЦИИ</span><h2>Ссылки</h2><p>Сохрани адреса поста и видео, чтобы вернуться к ним позже.</p></div><div className="links-panel"><label className="field"><span>ПОСТ В TELEGRAM</span><div className="link-input"><Link2 size={18} /><input type="url" placeholder="https://t.me/yourchannel/123" value={selected.telegramLink} onChange={(e) => updateBeat({ telegramLink: e.target.value })} />{selected.telegramLink && <a href={selected.telegramLink} target="_blank" rel="noreferrer" aria-label="Открыть Telegram"><ExternalLink size={17} /></a>}</div></label><label className="field"><span>ВИДЕО НА YOUTUBE</span><div className="link-input"><Link2 size={18} /><input type="url" placeholder="https://youtube.com/watch?v=..." value={selected.youtubeLink} onChange={(e) => updateBeat({ youtubeLink: e.target.value })} />{selected.youtubeLink && <a href={selected.youtubeLink} target="_blank" rel="noreferrer" aria-label="Открыть YouTube"><ExternalLink size={17} /></a>}</div></label><p className="form-hint">Пока ссылки сохраняются только до закрытия приложения.</p></div></div>}
          </>}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Главная навигация">{nav.map(({ id, label, Icon }) => <button key={id} className={screen === id || (screen === 'detail' && id === 'library') ? 'is-active' : ''} onClick={() => navigate(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>
      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
    </div>
  </div>
}

export default App
