import { useState, type FormEvent } from 'react'
import { ArrowRight, FileAudio2, ListFilter } from 'lucide-react'
import { Dropdown } from './choice-menu'
import { previewTelegramImport, saveTelegramImport, type TelegramChannel, type TelegramImportPreview, type TelegramImportTrack } from './cloud-beats'

const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' })
const saveBatchSize = 100

export function TelegramImport({ initData, channels, openChannels, openLibrary, onSaved, asLoops = false }: {
  initData?: string; channels: TelegramChannel[]; asLoops?: boolean; openChannels: () => void; openLibrary: () => void; onSaved: () => void
}) {
  const [preferredChannel, setPreferredChannel] = useState('')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [hideImported, setHideImported] = useState(false)
  const [result, setResult] = useState<TelegramImportPreview>()
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState<'read' | 'save'>()
  const [error, setError] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)
  const [saveTotal, setSaveTotal] = useState(0)
  const [outcome, setOutcome] = useState<{ added: number; skipped: number }>()
  const channel = channels.find((item) => item.id === preferredChannel)?.id ?? channels[0]?.id ?? ''

  function reset() {
    setError('')
    setSaveFailed(false)
    setResult(undefined)
    setSelected([])
    setOutcome(undefined)
  }

  async function scan(cursor?: number) {
    if (!initData || !channel || busy) return
    if (cursor === undefined) reset()
    setBusy('read')
    setError('')
    setSaveFailed(false)
    try {
      const firstLink = first.trim()
      const lastLink = last.trim() || firstLink
      const page = await previewTelegramImport(initData, channel, firstLink, lastLink, cursor)
      const all = new Map((cursor === undefined ? [] : result?.tracks ?? []).map((track) => [track.id, track]))
      const newIds = page.tracks.filter((track) => !track.exists && !all.has(track.id)).map((track) => track.id)
      for (const track of page.tracks) all.set(track.id, track)
      setResult({ ...page, tracks: [...all.values()].sort((a, b) => a.id - b.id) })
      setSelected((previous) => [...(cursor === undefined ? [] : previous.filter((id) => !all.get(id)?.exists)), ...newIds])
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось прочитать канал.')
    } finally { setBusy(undefined) }
  }

  async function save() {
    if (!initData || !channel || busy || !selected.length) return
    setBusy('save')
    setError('')
    setSaveFailed(false)
    setSaveTotal(selected.length)
    let processed = 0
    try {
      for (let i = 0; i < selected.length; i += saveBatchSize) {
        const ids = selected.slice(i, i + saveBatchSize)
        const counts = await saveTelegramImport(initData, channel, ids, asLoops)
        processed += ids.length
        const processedIds = new Set(ids)
        const savedIds = new Set(counts.savedIds)
        setOutcome((previous) => ({
          added: (previous?.added ?? 0) + counts.added,
          skipped: (previous?.skipped ?? 0) + counts.skipped,
        }))
        setSelected((previous) => previous.filter((id) => !processedIds.has(id)))
        setResult((previous) => previous && { ...previous, tracks: previous.tracks.flatMap((track) =>
          !processedIds.has(track.id) ? [track] : savedIds.has(track.id) ? [{ ...track, exists: true }] : []) })
      }
    } catch (failure) {
      setSaveFailed(true)
      setError(failure instanceof Error ? failure.message : 'Не удалось завершить импорт.')
    } finally {
      if (processed > 0) onSaved()
      setBusy(undefined)
    }
  }

  function submit(event: FormEvent) { event.preventDefault(); void scan() }
  const tracks = result?.tracks ?? []
  const available = tracks.filter((track) => !track.exists)
  const importedCount = tracks.length - available.length
  const visibleTracks = hideImported ? available : tracks
  const selection = new Set(selected)
  const allSelected = available.length > 0 && available.every((track) => selection.has(track.id))

  return <section className="form-panel batch-panel import-panel" aria-label="Импорт из Telegram">
    {!initData ? <p>Открой XEINTY в Telegram, чтобы импортировать биты.</p> : !channels.length ? <>
      <p>Добавь бота в администраторы канала и подключи канал в XEINTY.</p>
      <button type="button" className="outline-button" onClick={openChannels}>Подключить канал <ArrowRight size={16} /></button>
    </> : <>
      <form className="import-links" onSubmit={submit}>
        <Dropdown label="Канал Telegram" value={channel} disabled={Boolean(busy)}
          options={channels.map(({ id, title, username }) => ({ value: id, label: title + (username ? " (@" + username + ")" : "") }))}
          onChange={(value) => {
            if (value === channel) return
            setPreferredChannel(value)
            setFirst('')
            setLast('')
            reset()
          }} />
        <div className="import-fields">
          <label className="field"><span>Первый пост</span><input type="url" required maxLength={500} disabled={Boolean(busy)} placeholder="https://t.me/канал/7" value={first}
            onChange={(event) => { setFirst(event.currentTarget.value); reset() }} /></label>
          <label className="field"><span>Последний пост (необязательно)</span><input type="url" maxLength={500} disabled={Boolean(busy)} placeholder="https://t.me/канал/13" value={last}
            onChange={(event) => { setLast(event.currentTarget.value); reset() }} /></label>
        </div>
        <p className="form-hint">Вставь одну ссылку для поста или две для диапазона. Если ссылка ведёт на трек в пачке, проверим всю пачку.</p>
        <button className="primary-button" disabled={Boolean(busy) || !first.trim()}><ListFilter size={17} /> {busy === "read" && !result ? "Ищем аудио…" : "Найти аудио"}</button>
      </form>
      {result && <section className="import-results" aria-label="Результаты поиска аудио">
        <div className="batch-library-head"><strong>Найдено аудио · {result.tracks.length}</strong><span>Проверено {result.scanned} из {result.total}</span></div>
        {tracks.length > 0 && <div className="import-actions">
          {available.length > 0 && <button type="button" className="outline-button" disabled={Boolean(busy)}
            onClick={() => setSelected(allSelected ? [] : available.map((track) => track.id))}>
            {allSelected ? 'Снять выбор' : 'Выбрать все новые'}
          </button>}
          {importedCount > 0 && <button type="button" className="outline-button" onClick={() => setHideImported((current) => !current)}>
            {hideImported ? 'Показать импортированные' : 'Скрыть импортированные'} · {importedCount}
          </button>}
        </div>}
        {!tracks.length && <p className="form-hint">{result.next !== null ? 'На этом участке аудио нет. Можно продолжить поиск.' : 'По указанным ссылкам аудио не найдено.'}</p>}
        {hideImported && importedCount > 0 && !available.length && <p className="form-hint">Всё найденное аудио уже в библиотеке.</p>}
        {visibleTracks.length > 0 && <ul className="import-track-list">{visibleTracks.map((track) => <ImportTrack key={track.id} track={track} checked={selection.has(track.id)} busy={Boolean(busy)}
          toggle={(checked) => setSelected((previous) => checked ? [...previous, track.id] : previous.filter((id) => id !== track.id))} />)}</ul>}
        <div className="import-actions">
          {result.next !== null && <button type="button" className="outline-button" disabled={Boolean(busy)} onClick={() => void scan(result.next ?? undefined)}>
            {busy === "read" ? "Продолжаем поиск…" : "Продолжить поиск"}
          </button>}
          {busy !== 'save' && selected.length > 0 && <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={() => void save()}>
            {saveFailed ? 'Повторить импорт' : asLoops ? 'Добавить в лупы' : 'Добавить в библиотеку'} · {selected.length} <ArrowRight size={16} />
          </button>}
        </div>
        {busy === 'save' && <div className="youtube-upload-progress">
          <progress aria-label="Прогресс импорта" value={saveTotal - selected.length} max={saveTotal} />
          <span role="status">Обработано {saveTotal - selected.length} из {saveTotal}</span>
        </div>}
      </section>}
      {(error || saveFailed) && <p className="video-error" role="alert">
        {error}{saveFailed && selected.length > 0 && <> Осталось импортировать: {selected.length}.</>}
      </p>}
      {outcome && <div className="import-actions"><p className="form-hint" role="status">Добавлено: {outcome.added}{outcome.skipped ? " · Пропущено: " + outcome.skipped : ""}</p>
        <button type="button" className="outline-button" disabled={Boolean(busy)} onClick={openLibrary}>{asLoops ? 'Открыть лупы' : 'Открыть библиотеку'} <ArrowRight size={16} /></button>
      </div>}
    </>}
  </section>
}

function ImportTrack({ track, checked, busy, toggle }: { track: TelegramImportTrack; checked: boolean; busy: boolean; toggle: (checked: boolean) => void }) {
  return <li><label>
    <input type="checkbox" checked={checked || track.exists} disabled={busy || track.exists} onChange={(event) => toggle(event.currentTarget.checked)} />
    <FileAudio2 size={17} aria-hidden="true" />
    <span><strong>{track.title}</strong><small>{dateFormat.format(Date.parse(track.date))}{track.bpm && track.bpm !== "—" ? " · " + track.bpm + " BPM" : ""}{track.key && track.key !== "—" ? " · " + track.key : ""}{track.group ? " · Пачка" : ""}{track.exists ? " · Уже в библиотеке" : ""}</small></span>
  </label></li>
}
