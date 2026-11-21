import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, ExternalLink, MessageCircle, Plus } from 'lucide-react'
import { Dropdown } from './choice-menu'
import { deleteProducerDeal, loadProducerDeals, saveProducerDeal, type DealInput, type ProducerDeal, type SaleCurrency } from './cloud-beats'

const currencies: { value: SaleCurrency; label: string }[] = [
  { value: 'RUB', label: 'RUB · ₽' }, { value: 'USD', label: 'USD · $' }, { value: 'EUR', label: 'EUR · €' },
]
const money = Object.fromEntries(currencies.map(({ value }) => [value, new Intl.NumberFormat('ru-RU', { style: 'currency', currency: value, minimumFractionDigits: 0 })])) as Record<SaleCurrency, Intl.NumberFormat>
const dates = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' })
type Draft = Omit<DealInput, 'amountMinor'> & { amount: string }

function newDraft(): Draft {
  return { id: crypto.randomUUID(), title: '', contact: '', chat: '', amount: '', currency: 'RUB', notes: '', completed: false }
}

function inputFrom(deal: ProducerDeal): DealInput {
  return {
    id: deal.id, expectedUpdatedAt: deal.updated_at, title: deal.title, contact: deal.contact, chat: deal.chat_url ?? '',
    amountMinor: deal.amount_minor, currency: deal.currency, notes: deal.notes, completed: Boolean(deal.completed_at),
  }
}

function chatLabel(deal: ProducerDeal) {
  if (deal.contact) return deal.contact
  return deal.chat_url ? new URL(deal.chat_url).host : 'Чат сделки'
}

function ChatLink({ url, label, open }: { url: string; label: string; open: (url: string) => boolean }) {
  return <a className="outline-button sales-chat-link" href={url} target="_blank" rel="noopener noreferrer"
    onClick={(event) => {
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && open(url)) event.preventDefault()
    }}>
    <MessageCircle size={15} aria-hidden="true" /> <span>{label}</span><ExternalLink size={13} aria-hidden="true" />
  </a>
}

export function ProducerSales({ initData, openChat }: { initData?: string; openChat: (url: string) => boolean }) {
  const [deals, setDeals] = useState<ProducerDeal[]>()
  const [loadError, setLoadError] = useState('')
  const [mutationError, setMutationError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft>()
  const [confirm, setConfirm] = useState<string>()
  const formRef = useRef<HTMLFormElement>(null)
  const working = useRef(false)

  useEffect(() => {
    if (!initData) return
    const request = new AbortController()
    setLoading(true)
    setLoadError('')
    void loadProducerDeals(initData, request.signal).then(({ deals }) => {
      if (!request.signal.aborted) setDeals(deals)
    }).catch((failure) => {
      if (!request.signal.aborted) setLoadError(failure instanceof Error ? failure.message : 'Не удалось загрузить сделки.')
    }).finally(() => { if (!request.signal.aborted) setLoading(false) })
    return () => request.abort()
  }, [initData, revision])

  useEffect(() => {
    if (draft?.id) formRef.current?.querySelector('input')?.focus()
  }, [draft?.id])

  function openForm(deal?: ProducerDeal) {
    setMutationError('')
    setNotice('')
    setConfirm(undefined)
    if (!deal) { setDraft(newDraft()); return }
    const { amountMinor, ...input } = inputFrom(deal)
    setDraft({ ...input, amount: amountMinor === null ? '' : String(amountMinor / 100) })
  }

  async function mutate(task: () => Promise<void>, message: string) {
    if (working.current) return
    working.current = true
    setSaving(true)
    setMutationError('')
    setNotice('')
    try { await task(); setNotice(message) }
    catch (failure) {
      setMutationError(failure instanceof Error ? failure.message : 'Не удалось сохранить изменения.')
    } finally { working.current = false; setSaving(false) }
  }

  async function persist(deal: DealInput) {
    if (!initData) return
    const { deal: saved } = await saveProducerDeal(initData, deal)
    setDeals((current) => [saved, ...(current ?? []).filter(({ id }) => id !== saved.id)])
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || !initData) return
    const { amount, ...input } = draft
    const cleanAmount = amount.trim().replace(',', '.')
    const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(cleanAmount)
    if (cleanAmount && !match) { setMutationError('Укажи сумму числом с двумя знаками после запятой или короче.'); return }
    const amountMinor = match ? Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0')) : null
    if (amountMinor !== null && amountMinor > 1_000_000_000) { setMutationError('Сумма слишком большая для одной сделки.'); return }
    void mutate(async () => {
      await persist({ ...input, amountMinor })
      setDraft(undefined)
    }, 'Сделка сохранена.')
  }

  const all = [...(deals ?? [])].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
  const active = all.filter((deal) => !deal.completed_at)
  const completed = all.filter((deal) => deal.completed_at)
  const revenue = new Map<SaleCurrency, number>()
  for (const deal of completed) {
    if (deal.amount_minor !== null) revenue.set(deal.currency, (revenue.get(deal.currency) ?? 0) + deal.amount_minor)
  }
  const chatLinks = new Map<string, ProducerDeal>()
  for (const deal of [...active, ...completed]) {
    if (deal.chat_url && !chatLinks.has(deal.chat_url)) chatLinks.set(deal.chat_url, deal)
  }
  const locked = saving || loading

  function dealCard(deal: ProducerDeal) {
    const complete = Boolean(deal.completed_at)
    const editing = draft?.id === deal.id
    return <article key={deal.id} className="links-panel loop-panel sales-deal">
      <div className="sales-deal-head">
        <div><strong>{deal.title}</strong>{deal.contact && <small className="form-hint">{deal.contact}</small>}</div>
        <div>{deal.amount_minor !== null ? <strong>{money[deal.currency].format(deal.amount_minor / 100)}</strong> : <small className="form-hint">Сумма не указана</small>}
          {deal.completed_at && <time className="form-hint" dateTime={deal.completed_at}>{dates.format(Date.parse(deal.completed_at))}</time>}</div>
      </div>
      {deal.notes && <p className="form-hint sales-notes">{deal.notes}</p>}
      <div className="import-actions">
        {deal.chat_url && <ChatLink url={deal.chat_url} label="Открыть чат" open={openChat} />}
        {!editing && <button type="button" className="outline-button" disabled={locked} onClick={() => openForm(deal)}>Редактировать</button>}
        <button type="button" className="outline-button" disabled={locked || editing} onClick={() => void mutate(async () => {
          await persist({ ...inputFrom(deal), completed: !complete })
        }, complete ? 'Сделка снова в работе.' : 'Сделка завершена.')}>
          {!complete && <Check size={15} aria-hidden="true" />}{complete ? 'Вернуть в работу' : 'Завершить'}
        </button>
        {confirm === deal.id ? <>
          <button type="button" className="outline-button" disabled={locked} onClick={() => void mutate(async () => {
            if (!initData) return
            await deleteProducerDeal(initData, deal)
            setDeals((current) => current?.filter(({ id }) => id !== deal.id))
            setConfirm(undefined)
          }, 'Сделка удалена.')}>Подтвердить удаление</button>
          <button type="button" className="outline-button" disabled={locked} onClick={() => setConfirm(undefined)}>Отмена</button>
        </> : <button type="button" className="outline-button" disabled={locked || editing} onClick={() => setConfirm(deal.id)}>Удалить</button>}
      </div>
    </article>
  }

  return <div className="loop-workspace sales-workspace">
    <div className="page-heading"><h1>Продажи</h1></div>
    {!initData ? <p className="form-hint">Открой XEINTY в Telegram, чтобы вести сделки.</p> : <>
      <div className="import-actions">
        <button type="button" className="primary-button" disabled={locked || Boolean(draft)} onClick={() => openForm()}>
          <Plus size={16} aria-hidden="true" /> Новая сделка
        </button>
        <button type="button" className="outline-button" disabled={locked} onClick={() => {
          setRevision((value) => value + 1)
          setNotice('')
        }}>{loading ? 'Загружаем…' : 'Обновить'}</button>
      </div>
      {(loadError || mutationError) && <p className="video-error" role="alert">{mutationError || loadError}</p>}
      {notice && <p className="form-hint" role="status">{notice}</p>}
      {draft && <form ref={formRef} className="form-panel loop-panel" aria-label="Карточка сделки" onSubmit={submit}>
        <div className="section-intro"><h2>{draft.expectedUpdatedAt ? 'Редактировать сделку' : 'Новая сделка'}</h2></div>
        <label className="field"><span>Название сделки</span><input required maxLength={120} disabled={saving} value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Название бита или заказа" /></label>
        <div className="field-grid">
          <label className="field"><span>Клиент</span><input maxLength={80} disabled={saving} value={draft.contact}
            onChange={(event) => setDraft({ ...draft, contact: event.target.value })} /></label>
          <label className="field"><span>Деловой чат</span><input maxLength={500} disabled={saving} value={draft.chat}
            onChange={(event) => setDraft({ ...draft, chat: event.target.value })} placeholder="@ник или https://…" /></label>
          <label className="field"><span>Сумма</span><input inputMode="decimal" maxLength={12} disabled={saving} value={draft.amount}
            onChange={(event) => setDraft({ ...draft, amount: event.target.value })} placeholder="Сумма сделки" /></label>
          <Dropdown label="Валюта" value={draft.currency} options={currencies} disabled={saving} onChange={(value) => {
            const currency = currencies.find((item) => item.value === value)?.value
            if (currency) setDraft({ ...draft, currency })
          }} />
        </div>
        <label className="field"><span>Заметка</span><textarea maxLength={1000} rows={3} disabled={saving} value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
        <label className="sales-status"><input type="checkbox" disabled={saving} checked={draft.completed}
          onChange={(event) => setDraft({ ...draft, completed: event.target.checked })} /> Сделка завершена</label>
        <div className="import-actions"><button type="submit" className="primary-button" disabled={locked}>{saving ? 'Сохраняем…' : 'Сохранить сделку'}</button>
          <button type="button" className="outline-button" disabled={saving} onClick={() => { setDraft(undefined); setMutationError('') }}>Отмена</button></div>
      </form>}
      {deals && <>
        <section className="form-panel loop-panel" aria-label="Статистика продаж">
          <div className="section-intro"><h2>Статистика продаж</h2></div>
          <dl className="stats-metric-grid">
            <div className="stats-metric-card"><dt>Открытые</dt><dd>{active.length}</dd></div>
            <div className="stats-metric-card"><dt>Завершённые</dt><dd>{completed.length}</dd></div>
          </dl>
          <div className="sales-revenue"><h3>Выручка по завершённым сделкам</h3>
            {revenue.size ? <ul className="loop-credits">{currencies.flatMap(({ value }) => revenue.has(value) ? <li key={value}>
              <span>{value}</span><strong>{money[value].format(revenue.get(value)! / 100)}</strong>
            </li> : [])}</ul> : <p className="form-hint">Пока нет завершённых сделок с указанной суммой.</p>}
          </div>
        </section>
        <section className="form-panel loop-panel" aria-label="Деловые чаты">
          <div className="section-intro"><h2>Деловые чаты</h2></div>
          {chatLinks.size ? <ul className="loop-credits sales-chats">{[...chatLinks].map(([url, deal]) => <li key={url}>
            <ChatLink url={url} label={chatLabel(deal)} open={openChat} />
          </li>)}</ul> : <p className="form-hint">Ссылки из карточек сделок появятся здесь.</p>}
        </section>
        {([{ label: 'Открытые сделки', items: active, empty: 'Сделок в работе пока нет.' },
          { label: 'Завершённые сделки', items: completed, empty: 'Завершённых сделок пока нет.' }]).map(({ label, items, empty }) =>
          <section className="list-section loop-panel sales-deals" aria-label={label} key={label}>
            <div className="section-intro"><h2>{label}</h2></div>
            {items.length ? items.map(dealCard) : <p className="form-hint">{empty}</p>}
          </section>)}
      </>}
    </>}
  </div>
}
