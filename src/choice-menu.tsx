import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { canonicalKeyOptions, normalizeMusicKey } from './music-key'

type Option = { value: string; label: string; disabled?: boolean; group?: string }

function ChoiceMenu({ label, value, options, onChange, children, empty, disabled = false }: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  children: (controls: {
    expanded: boolean
    menuId: string
    activeId?: string
    setOpen: (open: boolean) => void
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  }) => ReactNode
  empty?: string
  disabled?: boolean
}) {
  const id = useId()
  const anchor = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState<string>()
  const [position, setPosition] = useState({ left: 0, width: 0, y: 0, available: 0, above: false })
  const expanded = open && !disabled
  const enabled = options.filter((option) => !option.disabled)
  const active = enabled.find((option) => option.value === highlight) ?? enabled.find((option) => option.value === value) ?? enabled[0]
  const activeId = expanded && active ? id + '-' + options.indexOf(active) : undefined

  useLayoutEffect(() => {
    if (!expanded) return
    function align() {
      if (!anchor.current) return
      const rect = anchor.current.getBoundingClientRect()
      const viewport = window.visualViewport
      const top = viewport?.offsetTop ?? 0
      const bottom = top + (viewport?.height ?? window.innerHeight)
      const leftEdge = viewport?.offsetLeft ?? 0
      const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth)
      const roomBelow = bottom - rect.bottom - 14
      const roomAbove = rect.top - top - 14
      const above = roomBelow < 178 && roomAbove > roomBelow
      const width = Math.min(Math.max(rect.width, 176), rightEdge - leftEdge - 24)
      setPosition({
        left: Math.min(Math.max(rect.left, leftEdge + 12), rightEdge - width - 12),
        width, y: above ? window.innerHeight - rect.top + 7 : rect.bottom + 7,
        available: Math.max(40, Math.min(286, above ? roomAbove : roomBelow)), above,
      })
    }
    align()
    window.addEventListener('resize', align)
    window.addEventListener('scroll', align, true)
    window.visualViewport?.addEventListener('resize', align)
    window.visualViewport?.addEventListener('scroll', align)
    return () => {
      window.removeEventListener('resize', align)
      window.removeEventListener('scroll', align, true)
      window.visualViewport?.removeEventListener('resize', align)
      window.visualViewport?.removeEventListener('scroll', align)
    }
  }, [expanded])

  useEffect(() => {
    if (!expanded) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !anchor.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [expanded])

  useEffect(() => {
    if (!activeId || !menu.current) return
    const row = document.getElementById(activeId)
    if (!row) return
    const bounds = row.getBoundingClientRect()
    const list = menu.current.getBoundingClientRect()
    if (bounds.top < list.top) menu.current.scrollTop -= list.top - bounds.top + 6
    if (bounds.bottom > list.bottom) menu.current.scrollTop += bounds.bottom - list.bottom + 6
  }, [activeId])

  function choose(option: Option) {
    setOpen(false)
    setHighlight(undefined)
    onChange(option.value)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      setOpen(false)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || (expanded && (event.key === 'Home' || event.key === 'End') && event.currentTarget.tagName !== 'INPUT')) {
      event.preventDefault()
      if (!expanded) { setOpen(true); return }
      const index = active ? enabled.indexOf(active) : -1
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 :
        Math.max(0, Math.min(enabled.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))
      setHighlight(enabled[next]?.value)
    } else if (event.key === 'Enter' && expanded && active) {
      event.preventDefault()
      choose(active)
    }
  }

  return <div className="choice-anchor" ref={anchor} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setHighlight(undefined) }
  }}>
    {children({ expanded, menuId: id, activeId, setOpen: (next) => { setOpen(next); setHighlight(undefined) }, onKeyDown })}
    {expanded && createPortal(<div ref={menu} id={id} className={'choice-menu' + (position.above ? ' choice-menu--above' : '')}
      role="listbox" aria-label={label} style={{ left: position.left, width: position.width, maxHeight: position.available, [position.above ? 'bottom' : 'top']: position.y }}>
      {options.map((option, index) => <div key={option.value}>
        {option.group && option.group !== options[index - 1]?.group && <div className="choice-group" role="presentation">{option.group}</div>}
        <div id={id + '-' + index} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
          className={'choice-option' + (option === active ? ' is-highlighted' : '')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => { if (!option.disabled) choose(option) }}>
          <span>{option.label}</span>{option.value === value && <Check size={15} aria-hidden="true" />}
        </div>
      </div>)}
      {!options.length && <div className="choice-empty" role="status">{empty || 'Нет доступных вариантов'}</div>}
    </div>, document.body)}
  </div>
}

export function Dropdown({ label, value, options, onChange, placeholder = 'Выбрать', disabled = false }: {
  label: string
  value: string
  options: Option[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const selected = options.find((option) => option.value === value)
  return <div className="field">
    <span>{label}</span>
    <ChoiceMenu label={label} value={value} options={options} onChange={onChange} disabled={disabled}>
      {({ expanded, menuId, activeId, setOpen, onKeyDown }) => <button type="button" role="combobox"
        aria-label={label} aria-expanded={expanded} aria-controls={expanded ? menuId : undefined}
        aria-activedescendant={activeId} disabled={disabled} className="choice-trigger"
        onKeyDown={onKeyDown} onClick={() => setOpen(!expanded)}>
        <span className={selected ? undefined : 'choice-placeholder'}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>}
    </ChoiceMenu>
  </div>
}

export function KeyPicker({ value, onChange, onCommit, label = 'Тональность' }: {
  value: string
  onChange: (value: string) => void
  onCommit?: (value: string) => void
  label?: string
}) {
  const [search, setSearch] = useState('')
  const normalized = normalizeMusicKey(search)
  const options = canonicalKeyOptions
    .filter((key) => !search || key === normalized || key.toLowerCase().includes(search.toLowerCase()))
    .map((key) => ({ value: key, label: key, group: key.endsWith('major') ? 'Мажор' : 'Минор' }))
    .sort((a, b) => Number(a.group === 'Минор') - Number(b.group === 'Минор'))
  function choose(key: string) {
    setSearch('')
    if (onCommit) onCommit(key)
    else onChange(key)
  }

  return <ChoiceMenu label={label} value={value} options={options} onChange={choose} empty="Ничего не найдено. Попробуй Cm или «До минор».">
    {({ expanded, menuId, activeId, setOpen, onKeyDown }) => <div className="choice-input">
      <input aria-label={label} role="combobox" aria-expanded={expanded} aria-autocomplete="list"
        aria-controls={expanded ? menuId : undefined} aria-activedescendant={activeId}
        autoComplete="off" placeholder="Например, Cm или До минор" value={value === '—' ? '' : value}
        onFocus={() => { setSearch(''); setOpen(true) }} onClick={() => { if (!expanded) setOpen(true) }}
        onBlur={() => { setSearch(''); onCommit?.(value) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && expanded && !options.length) { event.preventDefault(); onCommit?.(value); setOpen(false); return }
          onKeyDown(event)
        }}
        onChange={(event) => { setSearch(event.target.value); onChange(event.target.value); setOpen(true) }} />
      <ChevronDown size={17} aria-hidden="true" />
    </div>}
  </ChoiceMenu>
}
