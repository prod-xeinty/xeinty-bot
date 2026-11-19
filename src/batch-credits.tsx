import { useState } from 'react'
import { telegramCaptionLimit } from '../supabase/functions/beats/telegram-caption'

export function BatchTrackCredits({ title, value, onChange }: { title: string; value: string; onChange: (value: string) => void }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState('')

  function addLink() {
    const label = name.trim()
    let url: URL | undefined
    try { url = new URL(address.trim()) } catch { /* Show the validation message below. */ }
    if (!label || /[\[\]]/.test(label) || !url || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      setError('Укажи имя без квадратных скобок и полную ссылку https://.')
      return
    }
    const link = '[' + label + '](' + url.href.replaceAll('(', '%28').replaceAll(')', '%29') + ')'
    const next = [value.trim(), link].filter(Boolean).join(' · ')
    if (next.length > telegramCaptionLimit) {
      setError('Сократи подпись к треку перед добавлением ссылки.')
      return
    }
    onChange(next)
    setName('')
    setAddress('')
    setError('')
  }

  return <details className="batch-track-credits">
    <summary>{value.trim() ? "Соавторы добавлены" : "Добавить соавторов"}</summary>
    <label className="field"><span>Подпись к треку · {title}</span>
      <input maxLength={telegramCaptionLimit} value={value} placeholder="@producer1 + @producer2" onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
    <details className="batch-credit-link">
      <summary>Ссылка с именем</summary>
      <label className="field"><span>Имя продюсера</span><input value={name} maxLength={160} onChange={(event) => setName(event.currentTarget.value)} /></label>
      <label className="field"><span>Ссылка на продюсера</span><input type="url" value={address} placeholder="https://t.me/…" maxLength={600} onChange={(event) => setAddress(event.currentTarget.value)} /></label>
      {error && <p className="video-error" role="alert">{error}</p>}
      <button type="button" className="outline-button" onClick={addLink}>Добавить ссылку</button>
    </details>
  </details>
}
