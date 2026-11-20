const pitchClasses = [
  { canonical: 'C', aliases: ['c', 'до'] },
  { canonical: 'C#', aliases: ['c#', 'db', 'до диез', 'до-диез', 'ре бемоль', 'ре-бемоль'] },
  { canonical: 'D', aliases: ['d', 'ре'] },
  { canonical: 'D#', aliases: ['d#', 'eb', 'ре диез', 'ре-диез', 'ми бемоль', 'ми-бемоль'] },
  { canonical: 'E', aliases: ['e', 'ми'] },
  { canonical: 'F', aliases: ['f', 'фа'] },
  { canonical: 'F#', aliases: ['f#', 'gb', 'фа диез', 'фа-диез', 'соль бемоль', 'соль-бемоль'] },
  { canonical: 'G', aliases: ['g', 'соль'] },
  { canonical: 'G#', aliases: ['g#', 'ab', 'соль диез', 'соль-диез', 'ля бемоль', 'ля-бемоль'] },
  { canonical: 'A', aliases: ['a', 'ля'] },
  { canonical: 'A#', aliases: ['a#', 'bb', 'ля диез', 'ля-диез', 'си бемоль', 'си-бемоль'] },
  { canonical: 'B', aliases: ['b', 'h', 'си', 'до бемоль', 'до-бемоль'] },
]

const minorWords = new Set(['m', 'min', 'minor', 'мин', 'минор'])
const majorWords = new Set(['maj', 'major', 'маж', 'мажор'])

function clean(value: string): string {
  return value.toLocaleLowerCase('ru').replaceAll('♯', '#').replaceAll('♭', 'b')
    .replace(/[,_/]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function normalizeMusicKey(value: string): string | null {
  const normalized = clean(value)
  if (!normalized || normalized === '—' || normalized === '-') return ''
  let note = normalized
  let mode = 'major'
  const parts = normalized.split(' ')
  const last = parts.at(-1) ?? ''
  if (minorWords.has(last) || majorWords.has(last)) {
    note = parts.slice(0, -1).join(' ')
    mode = minorWords.has(last) ? 'minor' : 'major'
  } else {
    const suffix = normalized.match(/^(.+?)(min|minor|maj|major|минор|мажор|мин|маж|m)$/)
    if (suffix) {
      note = suffix[1].trim()
      mode = minorWords.has(suffix[2]) ? 'minor' : 'major'
    }
  }
  const pitch = pitchClasses.find(({ aliases }) => aliases.includes(note))
  return pitch ? `${pitch.canonical} ${mode}` : null
}

export const canonicalKeyOptions = pitchClasses.flatMap(({ canonical }) => [`${canonical} major`, `${canonical} minor`])
