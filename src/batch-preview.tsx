import { useEffect, useState } from 'react'
import { ChevronDown, FileAudio2, Image, ListMusic } from 'lucide-react'
import { captionWithLinks, renderTrackCaption, telegramCaptionLimit } from '../supabase/functions/beats/telegram-caption'

type PreviewTrack = { id: string; title: string; audioName?: string; credits?: string }

function PreviewCaption({ content }: { content: ReturnType<typeof captionWithLinks> }) {
  const { caption, caption_entities: entities = [] } = content
  if (!caption) return null
  let cursor = 0
  return <p className="batch-preview-caption">
    {entities.map(({ offset, length, url }) => {
      const text = caption.slice(cursor, offset)
      cursor = offset + length
      return <span key={offset}>{text}<a href={url} target="_blank" rel="noreferrer">{caption.slice(offset, cursor)}</a></span>
    })}
    {caption.slice(cursor)}
  </p>
}

function PreviewCover({ file, caption }: { file: File; caption: string }) {
  const [image, setImage] = useState<{ file: File; url: string }>()
  const [failed, setFailed] = useState<string>()
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImage({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])
  const url = image?.file === file ? image.url : undefined
  return <figure className="batch-preview-cover">
    {url && failed !== url ? <img src={url} alt="Общая обложка пачки" onError={() => setFailed(url)} />
      : <div className="batch-preview-cover-placeholder"><Image size={19} aria-hidden="true" /> {file.name}</div>}
    {caption && <figcaption><PreviewCaption content={captionWithLinks(caption)} /></figcaption>}
  </figure>
}

export function BatchPreview({ tracks, cover, coverCaption, caption, lastCaptionLength, unavailable }: {
  tracks: PreviewTrack[]; cover: File | null; coverCaption: string; caption: string; lastCaptionLength: number; unavailable: number
}) {
  const [open, setOpen] = useState(false)
  return <details className="batch-preview" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><ListMusic size={17} aria-hidden="true" /><span>Предпросмотр пачки</span><ChevronDown size={17} className="batch-preview-chevron" aria-hidden="true" /></summary>
    {open && <div className="batch-preview-body">
      {unavailable > 0 && <p className="form-hint">Здесь показаны доступные треки. Перед отправкой проверь состав пачки.</p>}
      {cover && <PreviewCover file={cover} caption={coverCaption} />}
      <ol className="batch-preview-tracks" aria-label="Аудио и подписи в порядке отправки">
        {tracks.map(({ id, title, audioName, credits }, index) => <li key={id}>
          <div className="batch-preview-track-name"><FileAudio2 size={18} aria-hidden="true" /><span>{audioName || title}</span></div>
          <PreviewCaption content={renderTrackCaption(credits ?? '', index === tracks.length - 1 ? caption : undefined)} />
        </li>)}
      </ol>
      <p className="form-hint batch-preview-limit">Подпись последнего аудио <span>{lastCaptionLength} / {telegramCaptionLimit}</span></p>
    </div>}
  </details>
}
