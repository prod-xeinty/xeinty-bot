import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Ellipsis, FileAudio2, Trash2 } from 'lucide-react'
import { positionAnchoredMenu } from './choice-menu'

export function RecordMenu({ title, openRecord, post, openTelegram, remove, deleting }: {
  title: string; openRecord: () => void; post?: { url: string; platform: 'telegram' | 'youtube' };
  openTelegram?: (url: string) => void; remove?: () => Promise<boolean>; deleting: boolean
}) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [position, setPosition] = useState<ReturnType<typeof positionAnchoredMenu>>()

  function close(returnFocus = false) {
    setOpen(false)
    setConfirm(false)
    if (returnFocus) trigger.current?.focus({ preventScroll: true })
  }

  useLayoutEffect(() => {
    if (!open) return
    function align() {
      if (trigger.current) setPosition(positionAnchoredMenu(trigger.current.getBoundingClientRect(), 224, 172))
    }
    align()
    window.addEventListener('resize', align)
    window.addEventListener('scroll', align, true)
    const viewport = window.visualViewport
    viewport?.addEventListener('resize', align)
    viewport?.addEventListener('scroll', align)
    return () => {
      window.removeEventListener('resize', align)
      window.removeEventListener('scroll', align, true)
      viewport?.removeEventListener('resize', align)
      viewport?.removeEventListener('scroll', align)
    }
  }, [open])

  const positioned = Boolean(position)
  useLayoutEffect(() => {
    if (open && positioned) menu.current?.querySelector<HTMLElement>('[role=menuitem]:not([disabled])')?.focus({ preventScroll: true })
  }, [open, positioned, confirm])

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close()
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])

  function navigate(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (confirm && !deleting) setConfirm(false)
      else close(true)
      return
    }
    if (event.key === 'Tab') { close(true); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !menu.current) return
    const items = [...menu.current.querySelectorAll<HTMLElement>('[role=menuitem]:not([disabled])')]
    if (!items.length) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next].focus()
  }

  return <>
    <button ref={trigger} type="button" className="record-menu-trigger" aria-label={"Действия для «" + title + "»"}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => open ? close(true) : setOpen(true)} onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true) }
      }}><Ellipsis size={20} aria-hidden="true" /></button>
    {open && position && createPortal(<div ref={menu} id={id} role="menu" aria-label={"Действия для «" + title + "»"} onKeyDown={navigate}
      className={"choice-menu record-menu" + (position.above ? " choice-menu--above" : "")}
      style={{ left: position.left, width: position.width, maxHeight: position.available, [position.above ? "bottom" : "top"]: position.y }}>
      {confirm ? <>
        <p className="record-menu-note">Удалить «{title}» из библиотеки?</p>
        <button type="button" role="menuitem" tabIndex={-1} disabled={deleting} onClick={() => setConfirm(false)}>Отмена</button>
        <button type="button" role="menuitem" tabIndex={-1} className="record-menu-danger" disabled={deleting}
          onClick={() => { if (remove) void remove().then((removed) => { if (removed) close(true) }) }}>
          <Trash2 size={16} aria-hidden="true" /> {deleting ? "Удаляем…" : "Подтвердить удаление"}
        </button>
      </> : <>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => { close(); openRecord() }}><FileAudio2 size={16} aria-hidden="true" /> Открыть карточку</button>
        {post && <a role="menuitem" tabIndex={-1} href={post.url} target="_blank" rel="noreferrer" onClick={(event) => {
          if (post.platform === "telegram" && openTelegram) { event.preventDefault(); openTelegram(post.url) }
          close(true)
        }}><ArrowUpRight size={16} aria-hidden="true" /> {post.platform === "telegram" ? "Перейти к посту" : "Открыть на YouTube"}</a>}
        {remove && <button type="button" role="menuitem" tabIndex={-1} className="record-menu-danger" disabled={deleting} onClick={() => setConfirm(true)}>
          <Trash2 size={16} aria-hidden="true" /> Удалить запись
        </button>}
      </>}
    </div>, document.body)}
  </>
}
