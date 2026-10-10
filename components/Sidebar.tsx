'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { CircleDashed, LogOut, Users, Building2 } from 'lucide-react'
import type { AppContext, ClientSummary } from '@/lib/types'
import { ROLE_LABEL } from '@/lib/types'
import { swatch } from '@/lib/format'
import { Avatar } from './ui'
import { switchDemoMemberAction } from '@/app/actions'

export function Sidebar({ ctx, clients, pendingCount }: { ctx: AppContext; clients: ClientSummary[]; pendingCount: number }) {
  const path = usePathname()
  const [, start] = useTransition()
  const mine = clients.filter((c) => c.owner_member_id === ctx.me.id || c.backup_member_id === ctx.me.id)
  const listed = (mine.length ? mine : clients).slice(0, 12)

  const nav = [
    { href: '/clientes', label: 'Clientes', icon: Building2, active: path === '/clientes' },
    { href: '/por-confirmar', label: 'Por confirmar', icon: CircleDashed, count: pendingCount, active: path === '/por-confirmar' },
    { href: '/equipo', label: 'Equipo', icon: Users, active: path === '/equipo' },
  ]

  return (
    <aside className="sidebar" aria-label="Navegación principal">
      <div className="sb-agency">
        <span className="brand-mark brand-mark-sm" aria-hidden>{ctx.agency.name.charAt(0)}</span>
        <div className="sb-agency-text">
          <span className="sb-agency-name">{ctx.agency.name}</span>
          <span className="sb-agency-role">{ROLE_LABEL[ctx.me.role]}</span>
        </div>
      </div>

      <nav className="sb-nav">
        {nav.map(({ href, label, icon: Icon, count, active }) => (
          <Link key={href} href={href} className={`sb-link${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
            <Icon size={16} strokeWidth={1.75} aria-hidden />
            <span>{label}</span>
            {!!count && <span className="sb-count">{count}</span>}
          </Link>
        ))}
      </nav>

      {listed.length > 0 && (
        <div className="sb-section">
          <p className="sb-section-title">{mine.length ? 'Tus clientes' : 'Clientes'}</p>
          {listed.map((c) => {
            const href = `/clientes/${c.id}`
            const active = path === href
            return (
              <Link key={c.id} href={href} className={`sb-link sb-client${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined}>
                <span className={`swatch swatch-${swatch(c.id)}`} aria-hidden>{c.name.charAt(0)}</span>
                <span className="truncate">{c.name}</span>
                {c.pending_count > 0 && <span className="sb-dot" aria-label={`${c.pending_count} por confirmar`} />}
              </Link>
            )
          })}
        </div>
      )}

      <div className="sb-foot">
        {ctx.demo && (
          <label className="demo-switch">
            <span>Ver como</span>
            <select
              className="input input-sm"
              value={ctx.me.id}
              onChange={(e) => start(() => switchDemoMemberAction(e.target.value))}
            >
              {ctx.members.map((m) => (
                <option key={m.id} value={m.id}>{m.full_name} · {ROLE_LABEL[m.role]}</option>
              ))}
            </select>
          </label>
        )}
        <div className="sb-user">
          <Avatar member={ctx.me} size={26} />
          <div className="sb-user-text">
            <span className="truncate">{ctx.me.full_name || ctx.userEmail}</span>
            <span className="sb-user-mail truncate">{ctx.userEmail}</span>
          </div>
          {!ctx.demo && (
            <form action="/auth/salir" method="post">
              <button className="icon-btn" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={16} /></button>
            </form>
          )}
        </div>
      </div>
    </aside>
  )
}
