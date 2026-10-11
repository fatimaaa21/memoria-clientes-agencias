'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useTransition } from 'react'
import { CircleDashed, LogOut, Users, Building2, Plus } from 'lucide-react'
import type { AppContext, Client, ProjectSummary } from '@/lib/types'
import { ROLE_LABEL } from '@/lib/types'
import { swatch } from '@/lib/format'
import { Avatar } from './ui'
import { switchDemoMemberAction } from '@/app/actions'
import { NewProjectDrawer } from './NewProjectDrawer'

export function Sidebar({
  ctx, projects, manageableClients, pendingCount,
}: { ctx: AppContext; projects: ProjectSummary[]; manageableClients: Client[]; pendingCount: number }) {
  const path = usePathname()
  const [, start] = useTransition()
  const [newOpen, setNewOpen] = useState(false)
  const canCreate = manageableClients.length > 0

  const nav = [
    { href: '/clientes', label: 'Clientes', icon: Building2, active: path.startsWith('/clientes') },
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

      <div className="sb-section">
        <div className="sb-section-head">
          <p className="sb-section-title">Proyectos</p>
          {canCreate && (
            <button className="icon-btn icon-btn-sm" onClick={() => setNewOpen(true)} aria-label="Nuevo proyecto" title="Nuevo proyecto">
              <Plus size={15} />
            </button>
          )}
        </div>
        {projects.length === 0 ? (
          <p className="sb-empty">
            {canCreate ? 'Crea un proyecto para agrupar los acuerdos de una campaña.' : 'Aún no hay proyectos en tus clientes.'}
          </p>
        ) : (
          projects.slice(0, 15).map((p) => {
            const href = `/proyectos/${p.id}`
            const active = path === href
            return (
              <Link key={p.id} href={href} className={`sb-link sb-client${active ? ' is-active' : ''}`} aria-current={active ? 'page' : undefined} title={`${p.name} · ${p.client_name}`}>
                <span className={`swatch swatch-${swatch(p.client_id)}`} aria-hidden>{p.client_name.charAt(0)}</span>
                <span className="sb-project-text">
                  <span className="truncate">{p.name}</span>
                  <span className="sb-project-client truncate">{p.client_name}</span>
                </span>
                {p.pending_count > 0 && <span className="sb-dot" aria-label={`${p.pending_count} por confirmar`} />}
              </Link>
            )
          })
        )}
      </div>

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
      <NewProjectDrawer open={newOpen} onClose={() => setNewOpen(false)} clients={manageableClients} />
    </aside>
  )
}
