import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { ExternalLink, Plus } from 'lucide-react'
import { Dropdown } from './choice-menu'
import { LoopInboxAudio } from './loop-inbox-audio'
import {
  addLoopSource, deleteLoopWork, dismissLoopIncoming, enableLoopInbox, loadLoopChannelStats, loadLoopWorkspace, saveLoopProducer, saveLoopWork,
  type LoopIncoming, type LoopProducer, type LoopWork, type LoopWorkspaceData, type PlatformStats, type TelegramChannel,
} from './cloud-beats'

export type LoopPage = 'loops' | 'loop-beats' | 'loop-stats'
type WorkDraft = { id?: string; inboxId?: string; title: string; loopIds: string[]; producerIds: string[]; releaseUrl: string }
type ProducerDraft = { id?: string; name: string; channel: string }
const emptyWork: WorkDraft = { title: '', loopIds: [], producerIds: [], releaseUrl: '' }
const emptyProducer: ProducerDraft = { name: '', channel: '' }
const formatNumber = new Intl.NumberFormat('ru-RU')

function toggleId(current: string[], id: string) {
  return current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
}

function replaceById<T extends { id: string }>(items: T[], item: T) {
  return [item, ...items.filter(({ id }) => id !== item.id)]
}

function TelegramLink({ url, open, children }: { url: string; open: (url: string) => void; children: ReactNode }) {
  return <a className="outline-button" href={url} target="_blank" rel="noreferrer"
    onClick={(event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      event.preventDefault()
      open(url)
    }}>
    {children} <ExternalLink size={14} aria-hidden="true" />
  </a>
}

function LoopChannelStats({ initData, channels }: { initData: string; channels: TelegramChannel[] }) {
  const [channel, setChannel] = useState('')
  const [result, setResult] = useState<PlatformStats>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  async function refresh() {
    setLoading(true)
    setError('')
    try { setResult(await loadLoopChannelStats(initData, channel || undefined)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось обновить статистику.') }
    finally { setLoading(false) }
  }
  const metrics = [
    ['Просмотры', result?.totals.views], ['Реакции', result?.totals.reactions],
    ['Пересылки', result?.totals.forwards], ['Комментарии', result?.totals.comments],
  ] as const
  return <section className="form-panel loop-panel" aria-label="Статистика Telegram">
    <div className="section-intro"><h2>Статистика Telegram</h2><p>По постам последних 200 лупов в каталоге. Каждый пост учитывается один раз.</p></div>
    <Dropdown label="Канал с лупами" value={channel} disabled={loading}
      options={[{ value: '', label: 'Все каналы' }, ...channels.map(({ id, title }) => ({ value: id, label: title }))]}
      onChange={(value) => { setChannel(value); setResult(undefined); setError('') }} />
    <button type="button" className="outline-button" onClick={() => void refresh()} disabled={loading}>
      {loading ? 'Обновляем…' : 'Обновить статистику Telegram'}
    </button>
    {error && <p className="video-error" role="alert">{error}</p>}
    {result && <>
      {metrics.some(([, value]) => typeof value === 'number') ? <dl className="stats-metric-grid">
        {metrics.map(([label, value]) => typeof value === 'number' ? <div className="stats-metric-card" key={label}>
          <dt>{label}</dt><dd>{formatNumber.format(value)}</dd>
        </div> : null)}
      </dl> : <p role="status" className="form-hint">Telegram не вернул показатели по этим постам.</p>}
      {result.linkedVideos > 0 && <p className="form-hint">Просмотры получены по {result.videosWithViews} из {result.linkedVideos} постов.</p>}
      {result.restricted && <p className="form-hint">Проверь доступ бота к закрытому каналу.</p>}
    </>}
  </section>
}

export function LoopWorkspace({ page, initData, library, moreLibrary, channels, openTelegram, importLoops, goToBeats, playLoop }: {
  page: LoopPage
  initData?: string
  library: { id: string; title: string }[]
  moreLibrary: ReactNode
  channels: TelegramChannel[]
  openTelegram: (url: string) => void
  importLoops: () => void
  goToBeats: () => void
  playLoop: (id: string) => ReactNode
}) {
  const [data, setData] = useState<LoopWorkspaceData>()
  const [revision, setRevision] = useState(0)
  const [source, setSource] = useState('')
  const [work, setWork] = useState<WorkDraft>()
  const [producer, setProducer] = useState<ProducerDraft>()
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [deleteId, setDeleteId] = useState<string>()
  const [attachId, setAttachId] = useState<string>()
  const [targetWork, setTargetWork] = useState('')
  const [shareLink, setShareLink] = useState('')
  const [reloading, setReloading] = useState(false)
  useEffect(() => {
    if (!initData) return
    const controller = new AbortController()
    setLoadError('')
    setReloading(true)
    void loadLoopWorkspace(initData, controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result)
    }).catch((failure) => {
      if (!controller.signal.aborted) setLoadError(failure instanceof Error ? failure.message : 'Не удалось загрузить каталог.')
    }).finally(() => {
      if (!controller.signal.aborted) setReloading(false)
    })
    return () => controller.abort()
  }, [initData, revision])

  const heading = page === 'loops' ? 'Лупы' : page === 'loop-beats' ? 'Биты на лупах' : 'Статистика лупмейкера'
  if (!initData) return <><div className="page-heading"><h1>{heading}</h1></div><p className="form-hint">Открой XEINTY в Telegram, чтобы работать с каталогом лупов.</p></>
  if (!data) return <><div className="page-heading"><h1>{heading}</h1></div>
    {loadError ? <><p className="video-error" role="alert">{loadError}</p>
      <button type="button" className="outline-button" onClick={() => setRevision((value) => value + 1)}>Повторить</button></>
      : <p className="form-hint" role="status">Загружаем каталог…</p>}
  </>

  const session = initData
  const loopsById = new Map(data.loops.map((item) => [item.id, item]))
  const producersById = new Map(data.producers.map((item) => [item.id, item]))
  const libraryOptions = library.filter(({ id }) => !loopsById.has(id)).map(({ id, title }) => ({ value: id, label: title }))
  const incoming = data.incoming ?? []
  const released = data.works.filter(({ release_url }) => Boolean(release_url)).length

  async function save(task: () => Promise<void>, success: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try { await task(); setNotice(success) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Не удалось сохранить изменения.') }
    finally { setBusy(false) }
  }

  function submitProducer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!producer) return
    void save(async () => {
      const result = await saveLoopProducer(session, producer)
      setData((current) => current && { ...current, producers: replaceById(current.producers, result.producer) })
      setWork((current) => current && !current.producerIds.includes(result.producer.id)
        ? { ...current, producerIds: [...current.producerIds, result.producer.id] } : current)
      setProducer(undefined)
    }, 'Продюсер сохранён.')
  }

  function submitWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!work) return
    void save(async () => {
      const result = await saveLoopWork(session, work)
      setData((current) => current && {
        ...current, works: replaceById(current.works, result.work),
        incoming: (current.incoming ?? []).filter(({ id }) => id !== work.inboxId),
      })
      setWork(undefined)
      setAttachId(undefined)
    }, 'Бит сохранён.')
  }

  function editWork(item: LoopWork) {
    setWork({
      id: item.id, title: item.title, releaseUrl: item.release_url ?? '',
      loopIds: item.loop_ids.filter((id) => loopsById.has(id)), producerIds: item.producer_ids.filter((id) => producersById.has(id)),
    })
    setProducer(undefined)
    setDeleteId(undefined)
  }

  async function copyLoopLink(id: string) {
    const url = 'https://t.me/xeintybot?start=loop_' + id
    setShareLink(url)
    setNotice('')
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Ссылка скопирована.')
    } catch { /* The visible URL remains available for manual copying. */ }
  }

  function prepareIncoming(item: LoopIncoming, existing?: LoopWork) {
    const hint = item.author_hint?.replace(/^@/, '').toLowerCase()
    const author = hint ? data?.producers.find(({ name }) => name.replace(/^@/, '').toLowerCase() === hint) : undefined
    setWork({
      id: existing?.id, inboxId: item.id, title: existing?.title ?? item.title,
      loopIds: [...new Set([...(existing?.loop_ids.filter((id) => loopsById.has(id)) ?? []), ...(item.loop_id && loopsById.has(item.loop_id) ? [item.loop_id] : [])])],
      producerIds: [...new Set([...(existing?.producer_ids.filter((id) => producersById.has(id)) ?? []), ...(author ? [author.id] : [])])],
      releaseUrl: existing?.release_url ?? item.release_url ?? '',
    })
    setProducer(!existing && !author && item.author_hint ? { name: item.author_hint, channel: '' } : undefined)
    setAttachId(undefined)
    setDeleteId(undefined)
  }

  function editProducer(item: LoopProducer) {
    setProducer({ id: item.id, name: item.name, channel: item.channel ?? '' })
  }

  return <div className="loop-workspace">
    <div className="page-heading"><h1>{heading}</h1></div>
    {(error || loadError) && <p className="video-error" role="alert">{error || loadError}</p>}
    {notice && <p className="form-hint" role="status">{notice}</p>}

    {page === 'loops' && <>
      <section className="form-panel loop-panel">
        <div className="section-intro"><h2>Добавить луп</h2><p>Импортируй лупы из Telegram или выбери запись, которая уже есть в библиотеке.</p></div>
        <div className="import-actions">
          <button type="button" className="outline-button" onClick={importLoops} disabled={busy}>Импортировать из Telegram</button>
          {moreLibrary}
        </div>
        {libraryOptions.length > 0 && <>
          <Dropdown label="Запись из библиотеки" value={source} options={libraryOptions} placeholder="Выбрать запись" disabled={busy} onChange={setSource} />
          <button type="button" className="primary-button" disabled={!source || busy} onClick={() => void save(async () => {
            const result = await addLoopSource(session, source)
            setData((current) => current && { ...current, loops: replaceById(current.loops, result.loop) })
            setSource('')
          }, 'Луп добавлен в каталог.')}><Plus size={16} aria-hidden="true" /> Добавить луп</button>
        </>}
      </section>
      <section className="list-section loop-panel" aria-label="Каталог лупов">
        <div className="section-intro"><h2>Каталог</h2></div>
        {shareLink && <label className="field"><span>Ссылка для отправки бита</span>
          <input value={shareLink} readOnly onFocus={(event) => event.currentTarget.select()} />
        </label>}
        {!data.loops.length && <p className="form-hint">Добавленных лупов пока нет.</p>}
        {data.loops.map((loop) => {
          const linked = data.works.filter((item) => item.loop_ids.includes(loop.id))
          const metadata = [loop.bpm && loop.bpm !== '—' ? loop.bpm + ' BPM' : '', loop.musical_key !== '—' ? loop.musical_key : ''].filter(Boolean)
          return <article className="links-panel loop-panel" key={loop.id}>
            <strong>{loop.title}</strong>
            {metadata.length > 0 && <small className="form-hint">{metadata.join(' · ')}</small>}
            <small className="form-hint">Битов {linked.length} · Вышло {linked.filter((item) => item.release_url).length}</small>
            {linked.length > 0 && <ul className="loop-credits">{linked.map((item) => <li key={item.id}>
              <button type="button" className="outline-button" onClick={() => { editWork(item); goToBeats() }}>
                {item.title} · {item.producer_ids.map((id) => producersById.get(id)?.name).filter(Boolean).join(', ')}
              </button>
            </li>)}</ul>}
            <div className="import-actions">
              {playLoop(loop.id)}
              {loop.telegram_source_url && <TelegramLink url={loop.telegram_source_url} open={openTelegram}>Исходный пост</TelegramLink>}
              <button type="button" className="outline-button" onClick={() => {
                setWork({ ...emptyWork, loopIds: [loop.id] })
                setProducer(undefined)
                goToBeats()
              }}>Добавить бит</button>
              {data.inboxEnabled && <button type="button" className="outline-button" onClick={() => void copyLoopLink(loop.id)}>Ссылка «Прислать бит»</button>}
            </div>
          </article>
        })}
      </section>
    </>}

    {page === 'loop-beats' && <>
      <section className="form-panel loop-panel" aria-label="Входящие биты">
        <div className="section-intro"><h2>Входящие</h2><p>Перешли боту аудио или пост с битом. Здесь можно подтвердить, кто и на какой луп его сделал.</p></div>
        {!data.inboxEnabled ? <button type="button" className="primary-button" disabled={busy} onClick={() => void save(async () => {
          await enableLoopInbox(session)
          setData((current) => current && { ...current, inboxEnabled: true })
        }, 'Входящие подключены.')}>Подключить входящие</button> : <>
          <div className="import-actions">
            <TelegramLink url="https://t.me/xeintybot" open={openTelegram}>Открыть бота</TelegramLink>
            <button type="button" className="outline-button" disabled={busy || reloading} onClick={() => setRevision((value) => value + 1)}>
              {reloading ? 'Загружаем…' : 'Обновить входящие'}
            </button>
          </div>
          {!incoming.length && <p className="form-hint">Новых битов пока нет.</p>}
          {incoming.map((item) => {
            const linked = data.works.find((entry) => item.release_url && entry.release_url === item.release_url)
            const loop = item.loop_id ? loopsById.get(item.loop_id) : undefined
            return <article className="links-panel loop-panel" key={item.id}>
              <strong>{item.title}</strong>
              {item.author_hint && <small className="form-hint">Отправитель · {item.author_hint}</small>}
              {loop && <small className="form-hint">Луп · {loop.title}</small>}
              {item.audio_name && <LoopInboxAudio initData={session} id={item.id} />}
              {item.release_url && <TelegramLink url={item.release_url} open={openTelegram}>Открыть пост</TelegramLink>}
              <div className="import-actions">
                <button type="button" className="outline-button" disabled={busy} onClick={() => prepareIncoming(item, linked)}>
                  {linked ? 'Дополнить найденный бит' : 'Создать бит из входящего'}
                </button>
                {data.works.length > 0 && !linked && <button type="button" className="outline-button" disabled={busy} onClick={() => { setAttachId(item.id); setTargetWork('') }}>Привязать к существующему</button>}
                <button type="button" className="outline-button" disabled={busy} onClick={() => void save(async () => {
                  await dismissLoopIncoming(session, item.id)
                  setData((current) => current && { ...current, incoming: (current.incoming ?? []).filter(({ id }) => id !== item.id) })
                  if (work?.inboxId === item.id) setWork(undefined)
                }, 'Входящий бит скрыт.')}>Скрыть</button>
              </div>
              {attachId === item.id && <div className="loop-panel">
                <Dropdown label="Существующий бит" value={targetWork} placeholder="Выбрать бит" disabled={busy}
                  options={data.works.map(({ id, title }) => ({ value: id, label: title }))} onChange={setTargetWork} />
                <button type="button" className="primary-button" disabled={!targetWork || busy} onClick={() => {
                  const existing = data.works.find(({ id }) => id === targetWork)
                  if (existing) prepareIncoming(item, existing)
                }}>Открыть карточку</button>
              </div>}
            </article>
          })}
        </>}
      </section>
      <div className="import-actions">
        <button type="button" className="primary-button" disabled={busy} onClick={() => { setWork(emptyWork); setProducer(undefined) }}>
          <Plus size={16} aria-hidden="true" /> Добавить бит
        </button>
        <button type="button" className="outline-button" disabled={busy} onClick={() => setProducer(emptyProducer)}>Добавить продюсера</button>
      </div>
      {producer && <form className="form-panel loop-panel" onSubmit={submitProducer} aria-label="Профиль продюсера">
        <div className="section-intro"><h2>{producer.id ? 'Редактировать продюсера' : 'Новый продюсер'}</h2></div>
        <label className="field"><span>Имя или @ник</span><input required maxLength={80} disabled={busy} value={producer.name}
          onChange={(event) => setProducer({ ...producer, name: event.target.value })} /></label>
        <label className="field"><span>Канал продюсера</span><input placeholder="@канал или https://t.me/канал" maxLength={150} disabled={busy} value={producer.channel}
          onChange={(event) => setProducer({ ...producer, channel: event.target.value })} /></label>
        <div className="import-actions"><button type="submit" className="primary-button" disabled={busy}>Сохранить продюсера</button>
          <button type="button" className="outline-button" disabled={busy} onClick={() => setProducer(undefined)}>Отмена</button></div>
      </form>}
      {work && <form className="form-panel loop-panel" onSubmit={submitWork} aria-label="Карточка бита">
        <div className="section-intro"><h2>{work.id ? 'Редактировать бит' : 'Новый бит'}</h2></div>
        <label className="field"><span>Название бита</span><input required maxLength={120} disabled={busy} value={work.title}
          onChange={(event) => setWork({ ...work, title: event.target.value })} /></label>
        <fieldset className="loop-checkboxes" disabled={busy}><legend>Использованные лупы</legend>
          {data.loops.length ? data.loops.map((loop) => <label key={loop.id}>
            <input type="checkbox" checked={work.loopIds.includes(loop.id)} onChange={() => setWork({ ...work, loopIds: toggleId(work.loopIds, loop.id) })} />
            {loop.title}
          </label>) : <p className="form-hint">Сначала добавь запись во вкладке «Лупы».</p>}
        </fieldset>
        <fieldset className="loop-checkboxes" disabled={busy}><legend>Продюсеры</legend>
          {data.producers.length ? data.producers.map((item) => <div className="loop-producer-choice" key={item.id}>
            <label><input type="checkbox" checked={work.producerIds.includes(item.id)}
              onChange={() => setWork({ ...work, producerIds: toggleId(work.producerIds, item.id) })} /> {item.name}</label>
            {work.producerIds.includes(item.id) && item.channel && <TelegramLink url={item.channel} open={openTelegram}>{item.channel.replace('https://t.me/', '@')}</TelegramLink>}
          </div>) : <p className="form-hint">Добавь профиль продюсера, чтобы выбрать его для бита.</p>}
        </fieldset>
        <label className="field"><span>Ссылка на релиз в Telegram</span><input type="url" placeholder="https://t.me/канал/123" maxLength={500}
          disabled={busy} value={work.releaseUrl} onChange={(event) => setWork({ ...work, releaseUrl: event.target.value })} /></label>
        <p className="form-hint">Статус · {work.releaseUrl.trim() ? 'Вышел' : 'Демо'}</p>
        <div className="import-actions"><button type="submit" className="primary-button" disabled={busy || !work.loopIds.length || !work.producerIds.length}>Сохранить бит</button>
          <button type="button" className="outline-button" disabled={busy} onClick={() => setWork(undefined)}>Отмена</button></div>
      </form>}
      <section className="list-section loop-panel" aria-label="Биты на лупах">
        <div className="section-intro"><h2>Каталог битов</h2></div>
        {!data.works.length && <p className="form-hint">Добавь первый бит, даже если его пока прислали только в личку.</p>}
        {data.works.map((item) => <article className="links-panel loop-panel" key={item.id}>
          <strong>{item.title} · {item.release_url ? 'Вышел' : 'Демо'}</strong>
          {item.audio_inbox_id && <LoopInboxAudio key={item.audio_inbox_id} initData={session} id={item.audio_inbox_id} />}
          <small className="form-hint">Лупы · {item.loop_ids.map((id) => loopsById.get(id)?.title ?? 'Удалённая запись').join(', ')}</small>
          <ul className="loop-credits">{item.producer_ids.map((id) => {
            const author = producersById.get(id)
            return author && <li key={id}>{author.name}{author.channel && <TelegramLink url={author.channel} open={openTelegram}>Канал продюсера</TelegramLink>}</li>
          })}</ul>
          <div className="import-actions">
            {item.release_url && <TelegramLink url={item.release_url} open={openTelegram}>Открыть релиз</TelegramLink>}
            <button type="button" className="outline-button" disabled={busy} onClick={() => editWork(item)}>Редактировать бит</button>
            {deleteId === item.id ? <>
              <button type="button" className="outline-button" disabled={busy} onClick={() => void save(async () => {
                await deleteLoopWork(session, item.id)
                setData((current) => current && { ...current, works: current.works.filter(({ id }) => id !== item.id) })
                if (work?.id === item.id) setWork(undefined)
                setDeleteId(undefined)
              }, 'Бит удалён из каталога.')}>Подтвердить удаление</button>
              <button type="button" className="outline-button" disabled={busy} onClick={() => setDeleteId(undefined)}>Отмена</button>
            </> : <button type="button" className="outline-button" disabled={busy} onClick={() => setDeleteId(item.id)}>Удалить</button>}
          </div>
        </article>)}
      </section>
      {data.producers.length > 0 && <section className="list-section loop-panel" aria-label="Продюсеры">
        <div className="section-intro"><h2>Продюсеры</h2></div>
        {data.producers.map((item) => <div className="import-actions" key={item.id}>
          <strong>{item.name}</strong>
          {item.channel && <TelegramLink url={item.channel} open={openTelegram}>Канал продюсера</TelegramLink>}
          <button type="button" className="outline-button" disabled={busy} onClick={() => editProducer(item)}>Редактировать продюсера</button>
        </div>)}
      </section>}
    </>}

    {page === 'loop-stats' && <>
      <section className="form-panel loop-panel" aria-label="Статистика битов">
        <div className="section-intro"><h2>Биты на твоих лупах</h2></div>
        <dl className="stats-metric-grid">
          {[['Лупы', data.loops.length], ['Всего битов', data.works.length], ['Вышло', released], ['Продюсеры', new Set(data.works.flatMap((item) => item.producer_ids)).size]]
            .map(([label, value]) => <div className="stats-metric-card" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        {data.loops.length > 0 && <><h3>Использование по лупам</h3><ul className="loop-credits">
          {data.loops.map((loop) => ({ loop, count: data.works.filter((item) => item.loop_ids.includes(loop.id)).length }))
            .sort((a, b) => b.count - a.count).map(({ loop, count }) => <li key={loop.id}><span>{loop.title}</span><strong>{count}</strong></li>)}
        </ul></>}
        {data.producers.length > 0 && <><h3>Биты по продюсерам</h3><ul className="loop-credits">
          {data.producers.map((item) => ({ item, count: data.works.filter((work) => work.producer_ids.includes(item.id)).length }))
            .sort((a, b) => b.count - a.count).map(({ item, count }) => <li key={item.id}><span>{item.name}</span><strong>{count}</strong></li>)}
        </ul></>}
      </section>
      <LoopChannelStats initData={session} channels={channels} />
    </>}
  </div>
}
