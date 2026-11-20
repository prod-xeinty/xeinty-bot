import { normalizeMusicKey } from './music-key.ts'

const note = '[a-g][#b♯♭]?'
const solfege = '(?:до|ре|ми|фа|соль|ля|си)(?:[ -]+(?:диез|бемоль))?'
const keyWithMode = note + '[ \\t]*(?:minor|major|min|maj|m)|' + solfege + '[ \\t]+(?:минор|мажор|мин|маж)'
const keyPattern = new RegExp(
  '(?<![\\p{L}\\p{N}#@])(?:(?<label>(?:musical[ \\t]+key|key|тональность)[ \\t]*[:=—–-][ \\t]*)' +
  '(?<labelled>' + keyWithMode + '|' + note + '|' + solfege + ')|(?<unlabelled>' + keyWithMode + '))(?![\\p{L}\\p{N}#♯♭])',
  'giu',
)
const explicitTempo = /(?<![\p{L}\p{N}])(?<!\d[.,])(\d{2,3})[ \t]*(?:bpm|бпм)(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(?:bpm|бпм|tempo|темп)[ \t]*[:=—–-]?[ \t]*(\d{2,3})(?![\p{L}\p{N}]|[.,]\d)/giu
const tempoBeforeKey = /(?<![\p{L}\p{N}])(?<!\d[.,])(\d{2,3})(?:[ \t]*(?:bpm|бпм))?[ \t,:/|·—–-]{1,9}$/iu
const tempoAfterKey = /^[ \t,:/|·—–-]{1,9}(\d{2,3})(?:[ \t]*(?:bpm|бпм))?(?![\p{L}\p{N}]|[.,]\d)/iu

function tempo(value?: string) {
  if (!value) return ''
  const bpm = Number(value)
  return bpm >= 40 && bpm <= 300 ? String(bpm) : ''
}

function single(values: string[]) {
  const unique = new Set(values.filter(Boolean))
  return unique.size === 1 ? [...unique][0] : ''
}

function extract(value: string) {
  const text = value.replace(/\.(?:mp3|wav|flac|aiff?|m4a|aac|ogg|opus|wma)$/i, '').replaceAll('_', ' ')
  const keys: string[] = []
  const paired: string[] = []
  for (const match of text.matchAll(keyPattern)) {
    const { labelled, unlabelled } = match.groups ?? {}
    const token = labelled ?? unlabelled
    if (!token) continue
    const before = tempo(tempoBeforeKey.exec(text.slice(0, match.index))?.[1])
    const after = tempo(tempoAfterKey.exec(text.slice(match.index + match[0].length))?.[1])
    // A nearby tempo disambiguates compact lowercase keys such as "fm" and "am".
    if (!labelled && /^[a-g]m$/i.test(token) && !/^[A-G]m$/.test(token) && !before && !after) continue
    const key = normalizeMusicKey(token)
    if (!key) continue
    keys.push(key)
    paired.push(before, after)
  }
  const explicit = [...text.matchAll(explicitTempo)].map((match) => tempo(match[1] ?? match[2])).filter(Boolean)
  return { bpm: single(explicit.length ? explicit : paired), key: single(keys) }
}

export function detectTelegramAudioMetadata(name: string, title?: string, caption?: string) {
  let bpm = ''
  let key = ''
  for (const source of [name, title, caption]) {
    if (!source) continue
    const detected = extract(source)
    bpm ||= detected.bpm
    key ||= detected.key
    if (bpm && key) break
  }
  return { bpm: bpm || '—', key: key || '—' }
}
