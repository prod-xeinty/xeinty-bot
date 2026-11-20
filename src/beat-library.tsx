import { Search, X } from 'lucide-react'
import type { StoredBeat } from './beat-store'
import { Dropdown } from './choice-menu'
import { normalizeMusicKey } from './music-key'
import { getBeatPublications } from './publication-history'

type SearchableBeat = Pick<StoredBeat, 'title' | 'bpm' | 'key' | 'tags' | 'audioName'>
type LibraryBeat = SearchableBeat & Pick<StoredBeat, 'youtubeLink' | 'telegramLink' | 'publications' | 'youtubePublishAt'> & {
  createdAt?: number; cloud?: boolean; isDemo?: boolean
}

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' })
const publicationOptions = [
  { value: 'all', label: 'Все записи' }, { value: 'draft', label: 'Без публикаций' },
  { value: 'telegram', label: 'Есть пост в Telegram' }, { value: 'youtube', label: 'Есть видео на YouTube' },
  { value: 'planned', label: 'Запланированы' },
]
const storageOptions = [
  { value: 'all', label: 'Любое' }, { value: 'cloud', label: 'В облаке' }, { value: 'local', label: 'На устройстве' },
]
const sortOptions = [
  { value: 'recent', label: 'Сначала новые' }, { value: 'title', label: 'По названию' }, { value: 'bpm', label: 'По BPM' },
]

export const defaultLibraryFilters = { query: '', publication: 'all', storage: 'all', sort: 'recent' }
type LibraryFilters = typeof defaultLibraryFilters

function searchText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е').replaceAll('♯', '#').replaceAll('♭', 'b')
    .replace(/(\d)\s*bpm\b/g, '$1 bpm').replace(/[_.·,]+/g, ' ').trim()
}

const explicitTempo = /(?<![\p{L}\p{N}])(?<!\d[.,])(\d{1,3})\s*(?:bpm|бпм)(?![\p{L}\p{N}])/iu

export function matchBeats<T extends SearchableBeat>(beats: T[], query: string): T[] {
  const normalizedQuery = query.normalize('NFKC')
  const tempoMatch = normalizedQuery.match(explicitTempo)
  const tempo = tempoMatch ? Number(tempoMatch[1]) : undefined
  const remainder = normalizedQuery.replace(explicitTempo, ' ')
  const text = searchText(remainder)
  if (tempo === undefined && !text) return beats

  const terms = text ? text.split(/\s+/) : []
  const key = normalizeMusicKey(remainder)
  return beats.filter((beat) => {
    if (tempo !== undefined && (!beat.bpm.trim() || Number(beat.bpm) !== tempo)) return false
    if (key) {
      const matchingKey = normalizeMusicKey(beat.key) === key
      if (tempo !== undefined || matchingKey) return matchingKey
    }
    const searchable = searchText([beat.title, beat.audioName, beat.tags, beat.key, beat.bpm + ' bpm'].filter(Boolean).join(' '))
    return terms.every((term) => searchable.includes(term))
  })
}

export function refineLibrary<T extends LibraryBeat>(beats: T[], filters: LibraryFilters, now = Date.now()): T[] {
  const visible = matchBeats(beats, filters.query).filter((beat) => {
    if (filters.storage === 'cloud' && !beat.cloud) return false
    if (filters.storage === 'local' && (beat.cloud || beat.isDemo)) return false
    if (filters.publication === 'all') return true
    const posts = getBeatPublications(beat)
    if (filters.publication === 'draft') return !beat.isDemo && posts.length === 0
    if (filters.publication === 'planned') return posts.some((post) => Date.parse(post.publishAt ?? '') > now)
    return posts.some((post) => post.platform === filters.publication)
  })
  function tempo(value: string) {
    const parsed = Number(value)
    return parsed > 0 && Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
  }
  return visible.sort((a, b) => {
    if (filters.sort === 'title') return collator.compare(a.title, b.title)
    if (filters.sort === 'bpm' && tempo(a.bpm) !== tempo(b.bpm)) return tempo(a.bpm) - tempo(b.bpm)
    return (b.createdAt ?? 0) - (a.createdAt ?? 0)
  })
}

export function BeatSearch({ value, onChange, label = 'Поиск аудио' }: {
  value: string; onChange: (query: string) => void; label?: string
}) {
  return <div className="beat-search">
    <Search size={16} aria-hidden="true" />
    <input type="search" aria-label={label} placeholder="Название, тег, BPM или тональность"
      value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    {value && <button type="button" aria-label="Очистить поиск" onClick={() => onChange('')}><X size={16} aria-hidden="true" /></button>}
  </div>
}

export function LibraryControls({ filters, onChange, count, total }: {
  filters: LibraryFilters; onChange: (filters: LibraryFilters) => void; count: number; total: number
}) {
  const active = Object.entries(defaultLibraryFilters).some(([key, value]) => filters[key as keyof LibraryFilters] !== value)
  return <div className="library-controls">
    <BeatSearch value={filters.query} onChange={(query) => onChange({...filters, query})} />
    <div className="library-filters">
      <Dropdown label="Публикации" value={filters.publication} options={publicationOptions} onChange={(publication) => onChange({...filters, publication})} />
      <Dropdown label="Хранилище" value={filters.storage} options={storageOptions} onChange={(storage) => onChange({...filters, storage})} />
      <Dropdown label="Сортировка" value={filters.sort} options={sortOptions} onChange={(sort) => onChange({...filters, sort})} />
    </div>
    <div className="library-results">
      <span className="form-hint" role="status">Найдено {count} из {total}</span>
      {active && <button type="button" className="outline-button" onClick={() => onChange(defaultLibraryFilters)}>Сбросить</button>}
    </div>
  </div>
}
