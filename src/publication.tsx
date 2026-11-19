import { Dropdown } from './choice-menu'
import { useEffect, useState } from 'react'
import type { TelegramChannel, TelegramPublication } from './cloud-beats'

export function DirectTelegramPublication({ publish, channels, publishedCount }: {
  channels: TelegramChannel[]
  publishedCount: number
  publish: (channel: string, republish: boolean) => Promise<TelegramPublication>
}) {
  const [channel, setChannel] = useState('')
  const selectedChannel = channels.find((item) => item.id === channel)
  const [confirm, setConfirm] = useState<false | 'first' | 'repeat'>(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TelegramPublication>()
  const [error, setError] = useState('')

  async function send() {
    if (busy || !confirm || !selectedChannel) return
    setBusy(true)
    setError('')
    try { setResult(await publish(selectedChannel.id, confirm === 'repeat')) }
    catch (error) {
      setError(error instanceof Error && !(error instanceof TypeError) ? error.message : 'Ответ не получен. Проверь канал перед повторной отправкой.')
    } finally {
      setBusy(false)
      setConfirm(false)
    }
  }

  return <form className="publication-link" onSubmit={(event) => {
    event.preventDefault()
    if (!busy && !confirm && selectedChannel) {
      setConfirm(publishedCount || result ? 'repeat' : 'first')
      setError('')
    }
  }}>
    <Dropdown label="Канал Telegram" placeholder="Выбрать канал" value={selectedChannel?.id ?? ''}
      disabled={!channels.length || busy || Boolean(confirm)} onChange={setChannel}
      options={channels.map((item) => ({ value: item.id, label: item.title + (item.username ? ' (@' + item.username + ')' : '') }))} />
    {!result && channels.length === 0 && <p className="form-hint">Сначала подключи канал во вкладке «Каналы».</p>}
    {!confirm && (publishedCount > 0 || result) && <p className="form-hint">{publishedCount > 0 ? 'Битов со ссылкой на публикацию в Telegram: ' + publishedCount : 'Аудио уже отправлено в Telegram.'}</p>}
    {!confirm && <button className="copy-button" disabled={!selectedChannel}>{publishedCount || result ? 'Опубликовать заново' : 'Опубликовать через бота'}</button>}
    {confirm && <>
      <p className="form-hint">{confirm === 'repeat' ? 'Отправить новый пост с выбранными битами' : 'Отправить аудио и текущую подпись'} в {selectedChannel?.title}?</p>
      <button type="button" className="copy-button" disabled={busy} onClick={() => void send()}>{busy ? 'Публикуем…' : confirm === 'repeat' ? 'Подтвердить повторную публикацию' : 'Подтвердить публикацию'}</button>
      <button type="button" className="copy-button copy-button--subtle" disabled={busy} onClick={() => setConfirm(false)}>Отмена</button>
    </>}
    {error && <p className="video-error" role="alert">{error}</p>}
    {result && <div role="status">
      <p>Аудио опубликовано{result.saved ? ', ссылка сохранена.' : '.'}</p>
      <a className="video-download" href={result.url} target="_blank" rel="noreferrer">Открыть публикацию</a>
      {result.warnings.map((warning) => <p key={warning} className="video-error">{warning}</p>)}
    </div>}
  </form>
}

export function readPublicationCover(file: File): Promise<string> {
  if (file.size > 2 * 1024 * 1024) return Promise.reject(new Error('Обложка должна быть до 2 МБ.'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Не удалось прочитать обложку.'))
    reader.readAsDataURL(file)
  })
}

export function OwnYoutubeVideo({ file, onChange }: { file?: File; onChange: (file?: File) => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!file) { setUrl(''); return }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return <div className="video-result">
    <label className="upload-zone">
      <input type="file" accept="video/*,.mp4,.mov,.webm,.mkv" onChange={(event) => onChange(event.target.files?.[0])} />
      <strong>{file?.name || 'Выбрать видео с устройства'}</strong>
    </label>
    {file && url && <>
      <video src={url} controls playsInline preload="metadata" aria-label="Предпросмотр своего видео" />
      <a className="video-download" href="https://studio.youtube.com/" target="_blank" rel="noreferrer">Открыть YouTube Studio</a>
      <p>Выбери этот же файл при загрузке через Studio.</p>
    </>}
  </div>
}
