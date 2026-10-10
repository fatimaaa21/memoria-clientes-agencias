'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Member, RecordKind, RecordStatus } from '@/lib/types'
import { KIND_LABEL } from '@/lib/types'
import { initials } from '@/lib/format'

// -----------------------------------------------------------------------------
// Panel lateral (drawer): todas las acciones cortas se abren aquí.
// -----------------------------------------------------------------------------
export function Drawer({
  open, onClose, title, subtitle, children, footer, wide,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    lastFocus.current = document.activeElement as HTMLElement
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select, button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      lastFocus.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="drawer-root">
      <div className="drawer-scrim" onClick={onClose} aria-hidden />
      <div ref={panel} className={`drawer${wide ? ' drawer-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header className="drawer-head">
          <div>
            <h2 id="drawer-title" className="drawer-title">{title}</h2>
            {subtitle && <p className="drawer-sub">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar panel">
            <X size={18} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Avisos breves después de una acción
// -----------------------------------------------------------------------------
export function toast(message: string, tone: 'ok' | 'error' = 'ok') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, tone } }))
}

export function Toaster() {
  const [items, setItems] = useState<{ id: number; message: string; tone: 'ok' | 'error' }[]>([])
  useEffect(() => {
    let id = 0
    const on = (e: Event) => {
      const { message, tone } = (e as CustomEvent).detail
      const item = { id: ++id, message, tone }
      setItems((xs) => [...xs, item])
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== item.id)), 3200)
    }
    window.addEventListener('app-toast', on)
    return () => window.removeEventListener('app-toast', on)
  }, [])
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>{t.message}</div>
      ))}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Piezas pequeñas
// -----------------------------------------------------------------------------
export function Avatar({ member, size = 22 }: { member?: Pick<Member, 'full_name' | 'email'> | null; size?: number }) {
  const name = member?.full_name || member?.email || ''
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} title={name} aria-hidden>
      {initials(name)}
    </span>
  )
}

export function KindTag({ kind }: { kind: RecordKind }) {
  return <span className={`kind kind-${kind}`}>{KIND_LABEL[kind]}</span>
}

/** Marca de la línea de tiempo: llena = confirmado, punteada = por confirmar. */
export function StatusMarker({ kind, status }: { kind: RecordKind; status: RecordStatus }) {
  return (
    <span
      className={`marker marker-${kind}${status === 'por_confirmar' ? ' marker-pending' : ''}`}
      aria-label={status === 'por_confirmar' ? 'Por confirmar' : 'Confirmado'}
      role="img"
    />
  )
}

export function MemberSelect({
  name, members, defaultValue, placeholder = 'Sin asignar', filter,
}: {
  name: string
  members: Member[]
  defaultValue?: string | null
  placeholder?: string
  filter?: (m: Member) => boolean
}) {
  const list = members.filter((m) => m.active && (!filter || filter(m)))
  return (
    <select className="input" name={name} defaultValue={defaultValue ?? ''}>
      <option value="">{placeholder}</option>
      {list.map((m) => (
        <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
      ))}
    </select>
  )
}
