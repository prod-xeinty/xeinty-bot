import { useEffect, useState, type FormEvent } from 'react'
import { ExternalLink, Plus } from 'lucide-react'
import { Dropdown } from './choice-menu'
import { loadContacts, saveLoopAuthor, saveLoopProducer, type LoopProducer } from './cloud-beats'

type OpenChat = (url: string) => boolean
type ContactDraft = { id?: string; name: string; chat: string; channel: string }
const newContact: ContactDraft = { name: '', chat: '', channel: '' }

function useContacts(initData: string) {
  const [contacts, setContacts] = useState<LoopProducer[]>()
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const request = new AbortController()
    setError('')
    void loadContacts(initData, request.signal).then(({ contacts }) => {
      if (!request.signal.aborted) setContacts(contacts)
    }).catch(() => {
      if (!request.signal.aborted) setError('Не удалось загрузить контакты.')
    })
    return () => request.abort()
  }, [initData, revision])
  return { contacts, setContacts, error, retry: () => setRevision((value) => value + 1) }
}

function ContactLoad({ error, retry }: { error: string; retry: () => void }) {
  return error ? <div className="import-actions"><p className="video-error" role="alert">{error}</p>
    <button type="button" className="outline-button" onClick={retry}>Повторить</button></div>
    : <p className="form-hint" role="status">Загружаем контакты…</p>
}

function ContactLink({ url, label, openChat }: { url: string; label: string; openChat: OpenChat }) {
  return <a className="outline-button" href={url} target="_blank" rel="noreferrer"
    onClick={(event) => { if (openChat(url)) event.preventDefault() }}><ExternalLink size={16} aria-hidden="true" /> {label}</a>
}

export function ContactsPage({ initData, openChat }: { initData: string; openChat: OpenChat }) {
  const { contacts, setContacts, error, retry } = useContacts(initData)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<ContactDraft>()
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  if (!contacts) return <ContactLoad error={error} retry={retry} />
  const search = query.trim().toLowerCase()
  const visible = contacts.filter(({ name, telegram_chat, channel }) =>
    [name, telegram_chat, channel].some((value) => value?.toLowerCase().includes(search)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))

  function edit(value: ContactDraft) {
    setNotice('')
    setSaveError('')
    setDraft(value)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft || saving) return
    setSaving(true)
    setSaveError('')
    try {
      const { producer } = await saveLoopProducer(initData, draft)
      setContacts((current) => [...(current ?? []).filter(({ id }) => id !== producer.id), producer])
      setNotice('Контакт сохранён.')
      setDraft(undefined)
      setQuery('')
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : 'Не удалось сохранить контакт.')
    } finally { setSaving(false) }
  }

  return <section className="form-panel loop-panel">
    {!draft && <div className="import-actions"><button type="button" className="primary-button" onClick={() => edit(newContact)}>
      <Plus size={17} aria-hidden="true" /> Добавить друга
    </button></div>}
    {draft && <form className="loop-panel" onSubmit={submit} aria-label={draft.id ? 'Редактировать контакт' : 'Новый контакт'}>
      <label className="field"><span>Имя</span><input required maxLength={80} value={draft.name} disabled={saving}
        onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label className="field"><span>Личный чат Telegram</span><input required maxLength={150} placeholder="@username" value={draft.chat} disabled={saving}
        onChange={(event) => setDraft({ ...draft, chat: event.target.value })} /></label>
      <label className="field"><span>Канал (необязательно)</span><input maxLength={150} placeholder="@channel" value={draft.channel} disabled={saving}
        onChange={(event) => setDraft({ ...draft, channel: event.target.value })} /></label>
      {saveError && <p className="video-error" role="alert">{saveError}</p>}
      <div className="import-actions">
        <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
        <button type="button" className="outline-button" disabled={saving} onClick={() => setDraft(undefined)}>Отмена</button>
      </div>
    </form>}
    {notice && <p className="form-hint" role="status">{notice}</p>}
    {contacts.length > 0 && <label className="field"><span>Поиск по друзьям</span><input type="search" value={query}
      onChange={(event) => setQuery(event.target.value)} /></label>}
    {!visible.length && !draft && <p className="form-hint">{search ? 'Контакты не найдены.' : 'Добавь контакт, чтобы быстро открывать чат и выбирать соавтора.'}</p>}
    {visible.map((item) => <article className="links-panel loop-panel" key={item.id}>
      <strong>{item.name}</strong>
      {item.telegram_chat && <small className="form-hint">{item.telegram_chat.replace('https://t.me/', '@')}</small>}
      <div className="import-actions">
        {item.telegram_chat && <ContactLink url={item.telegram_chat} label="Открыть чат" openChat={openChat} />}
        {item.channel && <ContactLink url={item.channel} label="Канал" openChat={openChat} />}
        <button type="button" className="outline-button" disabled={saving}
          onClick={() => edit({ id: item.id, name: item.name, chat: item.telegram_chat ?? '', channel: item.channel ?? '' })}>Изменить</button>
      </div>
    </article>)}
  </section>
}

export function BeatLoopAuthor({ initData, beatId, authorId, onSaved, openContacts }: {
  initData: string; beatId: string; authorId?: string | null; onSaved: (id: string | null) => void; openContacts: () => void
}) {
  const { contacts, error, retry } = useContacts(initData)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  async function select(value: string) {
    const id = value || null
    if (saving || id === (authorId ?? null)) return
    setSaving(true)
    setSaveError('')
    try {
      await saveLoopAuthor(initData, beatId, id)
      onSaved(id)
    } catch (failure) {
      setSaveError(failure instanceof Error ? failure.message : 'Не удалось сохранить автора.')
    } finally { setSaving(false) }
  }
  return <section className="form-panel loop-panel cover-edit" aria-labelledby="beat-loop-author">
    <div className="section-intro"><h2 id="beat-loop-author">Автор лупа</h2></div>
    {contacts?.length ? <Dropdown label="Выбрать автора лупа" value={authorId ?? ''} disabled={saving}
      options={[{ value: '', label: 'Без автора' }, ...[...contacts].sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map(({ id, name }) => ({ value: id, label: name }))]} onChange={(value) => void select(value)} />
      : contacts ? <button type="button" className="outline-button" onClick={openContacts}>Добавить друга</button>
      : <ContactLoad error={error} retry={retry} />}
    {saveError && <p className="video-error" role="alert">{saveError}</p>}
  </section>
}
