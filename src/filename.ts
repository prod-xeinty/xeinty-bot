import { normalizeMusicKey } from './music-key'

export type ParsedAudioName = { title: string; bpm: string; key: string; tags: string }

export function parseAudioName(filename: string): ParsedAudioName {
  let name = filename.replace(/\.(mp3|wav)$/i, '').replace(/[_]+/g, ' ')
  const bpmMatch = name.match(/(?:^|[\s([{-])(\d{2,3})\s*bpm\b/i)
  let bpm = bpmMatch && Number(bpmMatch[1]) >= 40 && Number(bpmMatch[1]) <= 300 ? bpmMatch[1] : ''
  if (bpm && bpmMatch) name = name.replace(bpmMatch[0], ' ')
  if (!bpm) {
    const numberMatch = name.match(/(?:^|[\s([{-])(\d{2,3})(?=$|[\s)\]}-])/)
    if (numberMatch && Number(numberMatch[1]) >= 40 && Number(numberMatch[1]) <= 300) {
      name = name.replace(numberMatch[0], ' ')
      bpm = numberMatch[1]
    }
  }

  let key = ''
  const keyPattern = /(?:^|[\s([{-])((?:[a-g][#b♯♭]?\s*(?:minor|major|min|maj|m)|(?:до|ре|ми|фа|соль|ля|си)(?:[- ](?:диез|бемоль))?\s+(?:минор|мажор)))(?=$|[\s)\]}-])/i
  const keyMatch = name.match(keyPattern)
  if (keyMatch) {
    key = normalizeMusicKey(keyMatch[1]) ?? ''
    if (key) name = name.replace(keyMatch[0], ' ')
  }

  const tagMatches = [...name.matchAll(/(?:^|\s)(@[\w.]+|#[\wа-яё]+|prod\.?\s*(?:by\s+)?[\w.-]+)/gi)]
  const tags = tagMatches.map((match) => match[1]).filter((tag) => !/^(?:@|#|prod\.?\s*(?:by\s+)?)?xeinty$/i.test(tag)).join(' · ')
  for (const match of tagMatches) name = name.replace(match[0], ' ')
  name = name.replace(/(?:^|\s)xeinty\s*$/i, ' ')
  const title = name.replace(/[()[\]{}]/g, ' ').replace(/\s*[-–—|]+\s*/g, ' ').replace(/\s+/g, ' ').trim() || filename.replace(/\.[^.]+$/, '')
  return { title, bpm, key, tags }
}

export function telegramLine(parsed: ParsedAudioName): string {
  const details = [parsed.bpm && `${parsed.bpm} BPM`, parsed.key].filter(Boolean).join(' · ')
  return `${parsed.title}${details ? ` — ${details}` : ''}${parsed.tags ? ` · ${parsed.tags}` : ''}`
}
