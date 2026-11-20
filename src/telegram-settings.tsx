import { Dropdown } from './choice-menu'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { loadTelegramChannelProfile, type ChannelProfile, type TelegramChannel } from './cloud-beats'

const subscriberFormat = new Intl.NumberFormat('ru-RU')

export function ChannelPanel({ name, description, children }: { name: string; description: string; children: ReactNode }) {
  return <section className="form-panel channel-panel" aria-label={"Настройки канала " + name}>
    <div className="section-intro"><h2>{name}</h2><p>{description}</p></div>
    {children}
  </section>
}

export function ChannelIdentity({ title, address, profile, loading = false }: {
  title: string; address?: string; profile?: ChannelProfile; loading?: boolean
}) {
  const name = profile?.title || title
  const avatar = profile?.avatar
  const [failedAvatar, setFailedAvatar] = useState<string>()
  return <div className="channel-identity">
    <span className="channel-avatar" aria-hidden="true">
      {avatar && failedAvatar !== avatar
        ? <img src={avatar} alt="" referrerPolicy="no-referrer" onError={() => setFailedAvatar(avatar)} />
        : name.trim().slice(0, 1).toUpperCase()}
    </span>
    <div className="channel-identity-text">
      <strong>{name}</strong>
      {address && <small>{address}</small>}
      <small>{loading ? 'Загружаем данные канала…' : typeof profile?.subscribers === 'number'
        ? 'Подписчики: ' + subscriberFormat.format(profile.subscribers) : 'Число подписчиков недоступно'}</small>
    </div>
  </div>
}

function TelegramChannelIdentity({ initData, channel }: { initData?: string; channel: TelegramChannel }) {
  const [profile, setProfile] = useState<ChannelProfile>()
  const [loading, setLoading] = useState(Boolean(initData))
  useEffect(() => {
    if (!initData) return
    let active = true
    setLoading(true)
    void loadTelegramChannelProfile(initData, channel.id).then((result) => {
      if (active) setProfile(result)
    }).catch(() => {
      if (active) setProfile(undefined)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [initData, channel.id])
  const username = profile?.username ?? channel.username
  return <ChannelIdentity title={channel.title} address={username ? '@' + username : channel.id} profile={profile} loading={loading} />
}

export function TelegramChannels({ available, initData, channels, loadError, onConnect, onDisconnect }: {
  available: boolean
  initData?: string
  channels: TelegramChannel[]
  loadError: string
  onConnect: (address: string) => Promise<void>
  onDisconnect: (id: string) => Promise<void>
}) {
  const [address, setAddress] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function change(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try { await action() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось обновить каналы.') }
    finally { setBusy(false) }
  }

  function connect(event: FormEvent) {
    event.preventDefault()
    if (busy || !address.trim()) return
    void change(async () => {
      await onConnect(address.trim())
      setAddress('')
    })
  }

  return <ChannelPanel name="Telegram" description="Импорт аудио и статистика постов">
    <p className="form-hint">Добавь @xeintybot в администраторы канала. Затем укажи @имя канала или ID закрытого канала.</p>
    {!available ? <p>Открой XEINTY через Telegram, чтобы подключить канал.</p> : <>
      <form onSubmit={connect}>
        <label className="field"><span>Канал Telegram</span><input required value={address} disabled={busy} placeholder="@имя_канала или -100…" onChange={(e) => setAddress(e.target.value)} /></label>
        <button className="outline-button channel-connect" disabled={busy || !address.trim()}>Подключить канал</button>
      </form>
      {(error || loadError) && <p className="video-error" role="alert">{error || loadError}</p>}
      {channels.length === 0 && !loadError && <p className="form-hint">Подключённых каналов пока нет.</p>}
      <ul className="telegram-channel-list">{channels.map((channel) => <li className="channel-row" key={channel.id}>
        <TelegramChannelIdentity initData={initData} channel={channel} />
        <button type="button" className="outline-button" disabled={busy} onClick={() => void change(() => onDisconnect(channel.id))}>Отключить</button>
      </li>)}</ul>
    </>}
  </ChannelPanel>
}

export type CaptionTemplate = { id: string; name: string; text: string; linkText: string; linkUrl: string }
export type CaptionPreferences = { templates: CaptionTemplate[]; hashtags: string[] }

const templateFields = { название: 'Название', bpm: 'BPM', тональность: 'Тональность', теги: 'Теги', биты: 'Список битов' }
type TemplateField = keyof typeof templateFields
type TemplateValues = Partial<Record<TemplateField, string>>
const fieldPattern = new RegExp('\\{\\{(' + Object.keys(templateFields).join('|') + ')\\}\\}', 'g')
const previewValues: TemplateValues = {
  название: 'NO SIGNAL', bpm: '138', тональность: 'F# minor', теги: '#darktrap',
  биты: '1. NO SIGNAL — 138 BPM · F# minor\n2. SILHOUETTE — 92 BPM · C minor',
}

export function beatCaptionValues(beat: { title: string; bpm: string; key: string; tags: string }): TemplateValues {
  return {
    название: beat.title.trim(), bpm: beat.bpm === '—' ? '' : beat.bpm.trim(),
    тональность: beat.key === '—' ? '' : beat.key.trim(), теги: beat.tags === 'без тегов' ? '' : beat.tags.trim(),
  }
}

function fillTemplate(text: string, values: TemplateValues) {
  const missing = new Set<TemplateField>()
  const filled = text.replace(fieldPattern, (token: string, field: TemplateField) => {
    const value = values[field]
    if (value) return value
    missing.add(field)
    return token
  })
  return { filled, missing }
}

export function readCaptionPreferences(): CaptionPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem('xeinty-telegram-caption-preferences') ?? '{}')
    const hashtags = Array.isArray(saved.hashtags) ? saved.hashtags.filter((tag: unknown) => typeof tag === 'string').slice(0, 12) : []
    const templates = Array.isArray(saved.templates) ? saved.templates : []
    if (!templates.length && typeof saved.template === 'string' && saved.template.trim()) {
      templates.push({ id: 'previous-template', name: 'Мой шаблон', text: saved.template, linkText: '', linkUrl: '' })
    }
    return { templates, hashtags }
  } catch { return { templates: [], hashtags: [] } }
}

export function CaptionTools({ caption, onChange, preferences, values, youtube = false }: {
  caption: string
  onChange: (caption: string) => void
  preferences: CaptionPreferences
  values: TemplateValues
  youtube?: boolean
}) {
  const limit = youtube ? 5000 : 1024
  const append = (value: string) => [caption.trimEnd(), value].filter(Boolean).join('\n')
  function insert(value: string) {
    const next = append(value)
    if (next.length <= limit) onChange(next)
  }
  const templates = preferences.templates.map(({ id, name, text, linkText, linkUrl }) => {
    const { filled, missing } = fillTemplate(text, values)
    const link = !linkUrl ? '' : youtube ? linkText + ': ' + linkUrl : '[' + linkText + '](' + linkUrl + ')'
    const next = [filled, link].filter(Boolean).join('\n')
    let group: string | undefined
    if (missing.has('биты')) group = 'биты' in values ? 'Сначала выбери биты' : 'Для пачки Telegram'
    else if (missing.size) group = 'биты' in values ? 'Для одного бита' : 'Заполни в карточке · ' + [...missing].map((field) => templateFields[field]).join(', ')
    else if (next.length > limit) group = 'Слишком длинный текст'
    return { value: id, label: name, next, disabled: Boolean(group), group }
  })
  templates.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '', 'ru'))

  return <div className="caption-tools">
    {templates.length ? <Dropdown label="Шаблон" placeholder="Выбрать шаблон" value="" onChange={(value) => {
      const template = templates.find((item) => item.value === value)
      if (template && !template.disabled) onChange(template.next)
    }} options={templates} /> : <p className="form-hint">Шаблоны можно создать в разделе «Ещё».</p>}
    {"биты" in values && preferences.templates.some(({ text }) => text.includes("{{биты}}")) &&
      <p className="form-hint">Если изменишь состав или порядок пачки, выбери шаблон снова, чтобы обновить список в подписи.</p>}
    {!youtube && preferences.hashtags.length > 0 && <div className="caption-tags" aria-label="Недавние хештеги">
      <span>Недавние хештеги</span>
      {preferences.hashtags.map((tag) => <button type="button" key={tag} className="outline-button"
        disabled={caption.toLowerCase().match(/#[\p{L}\p{N}_]+/gu)?.includes(tag.toLowerCase()) || append(tag).length > limit}
        onClick={() => insert(tag)}>{tag}</button>)}
    </div>}
  </div>
}

const emptyTemplate = { id: '', name: '', text: '', linkText: '', linkUrl: '' }

export function CaptionTemplates({ templates, onChange }: {
  templates: CaptionTemplate[]
  onChange: (templates: CaptionTemplate[]) => void
}) {
  const [draft, setDraft] = useState<CaptionTemplate>()
  const [error, setError] = useState('')
  const textInput = useRef<HTMLTextAreaElement>(null)
  const preview = draft ? fillTemplate(draft.text.trim(), previewValues).filled : ''

  function insertField(field: TemplateField) {
    if (!draft || !textInput.current) return
    const input = textInput.current
    const token = '{{' + field + '}}'
    const position = input.selectionStart
    const text = draft.text.slice(0, position) + token + draft.text.slice(input.selectionEnd)
    if (text.length > input.maxLength) {
      setError('В тексте шаблона нет места для этой подстановки.')
      return
    }
    setError('')
    setDraft({ ...draft, text })
    requestAnimationFrame(() => {
      if (textInput.current !== input) return
      input.focus()
      input.setSelectionRange(position + token.length, position + token.length)
    })
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    const { id, name, text, linkText, linkUrl } = draft
    const label = linkText.trim()
    let url = linkUrl.trim()
    if (url || label) {
      try {
        const parsed = new URL(url)
        if (!['https:', 'http:'].includes(parsed.protocol) || !label || /[\[\]]/.test(label)) throw new Error()
        url = parsed.href.replaceAll('(', '%28').replaceAll(')', '%29')
      } catch {
        setError('Укажи текст ссылки без квадратных скобок и адрес, начинающийся с https:// или http://.')
        return
      }
    }
    if (text.includes('{{биты}}') && (Object.keys(templateFields) as TemplateField[]).some((field) => field !== 'биты' && text.includes('{{' + field + '}}'))) {
      setError('Список битов используется в шаблоне для пачки. Для данных одного бита создай отдельный шаблон.')
      return
    }
    if (!name.trim() || (!text.trim() && !url)) {
      setError('Укажи название и добавь текст или ссылку.')
      return
    }
    if (text.trim().length + label.length + url.length + (url ? 5 : 0) > 1024) {
      setError('Шаблон слишком длинный для подписи Telegram.')
      return
    }
    const saved = { id: id || crypto.randomUUID(), name: name.trim(), text: text.trim(), linkText: label, linkUrl: url }
    onChange(id ? templates.map((item) => item.id === id ? saved : item) : [...templates, saved])
    setDraft(undefined)
    setError('')
  }

  return <section className="form-panel batch-panel">
    <button type="button" className="outline-button" onClick={() => { setDraft({ ...emptyTemplate }); setError('') }}>Создать шаблон</button>
    {templates.length > 0 && <ul className="telegram-channel-list">{templates.map((item) => <li key={item.id}>
      <div><strong>{item.name}</strong></div>
      <button type="button" className="outline-button" onClick={() => { setDraft(item); setError('') }}>Изменить</button>
    </li>)}</ul>}
    {draft && <form className="caption-template field" onSubmit={save}>
      <label className="field"><span>Название шаблона</span><input required maxLength={80} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className="field"><span>Текст поста</span><textarea ref={textInput} maxLength={1024} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} /></label>
      <div className="caption-tags" role="group" aria-label="Подстановки в шаблон">
        <span>Вставить данные из карточки или список для пачки</span>
        {(Object.keys(templateFields) as TemplateField[]).map((field) => <button type="button" key={field}
          className="outline-button" onClick={() => insertField(field)}>{templateFields[field]}</button>)}
      </div>
      <label className="field"><span>Текст ссылки</span><input maxLength={160} placeholder="Купить" value={draft.linkText} onChange={(e) => setDraft({ ...draft, linkText: e.target.value })} /></label>
      <label className="field"><span>Адрес ссылки</span><input type="url" maxLength={600} placeholder="https://t.me/твой_ник" value={draft.linkUrl} onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })} /></label>
      {(preview || draft.linkText.trim() && draft.linkUrl.trim()) && <section className="caption-preview" aria-label="Пример подписи">
        <h2>Пример подписи</h2>
        {preview && <p>{preview}</p>}
        {draft.linkText.trim() && draft.linkUrl.trim() && <p className="caption-preview-link">{draft.linkText.trim()}</p>}
      </section>}
      {error && <p className="video-error" role="alert">{error}</p>}
      <div className="video-save-actions">
        <button className="outline-button">Сохранить шаблон</button>
        <button type="button" className="outline-button" onClick={() => setDraft(undefined)}>Отмена</button>
        {draft.id && <button type="button" className="outline-button" onClick={() => { onChange(templates.filter((item) => item.id !== draft.id)); setDraft(undefined) }}>Удалить</button>}
      </div>
    </form>}
  </section>
}
