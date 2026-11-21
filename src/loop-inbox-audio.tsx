import { useEffect, useRef, useState } from 'react'
import { loadLoopInboxAudio } from './cloud-beats'

export function LoopInboxAudio({ initData, id }: { initData: string; id: string }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<AbortController>(null)
  const objectUrl = useRef('')
  useEffect(() => () => {
    request.current?.abort()
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
  }, [])

  async function load() {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setError('')
    try {
      const blob = await loadLoopInboxAudio(initData, id, controller.signal)
      if (controller.signal.aborted) return
      objectUrl.current = URL.createObjectURL(blob)
      setUrl(objectUrl.current)
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof TypeError ? 'Не удалось загрузить аудио. Попробуй ещё раз.'
          : failure instanceof Error ? failure.message : 'Аудио недоступно.')
      }
    } finally {
      if (!controller.signal.aborted) {
        request.current = null
        setLoading(false)
      }
    }
  }
  return <div className="loop-inbox-audio">
    {url ? <audio src={url} controls autoPlay preload="metadata" aria-label="Прослушать входящий бит" />
      : <button type="button" className="outline-button" disabled={loading} onClick={() => void load()}>
        {loading ? 'Загружаем аудио…' : 'Прослушать бит'}
      </button>}
    {error && <p className="video-error" role="alert">{error}</p>}
  </div>
}
