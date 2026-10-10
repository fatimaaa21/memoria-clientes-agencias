'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronRight, Lock, Plus, UsersRound } from 'lucide-react'
import type { Client, ClientRecord, Member, RecordKind } from '@/lib/types'
import { KIND_PLURAL, ROLE_LABEL } from '@/lib/types'
import { fmtDay, fmtDue, fmtMonth, swatch } from '@/lib/format'
import { Avatar, KindTag, StatusMarker } from './ui'
import { QuickRecordDrawer } from './QuickRecordDrawer'
import { RecordDrawer } from './RecordDrawer'
import { AssignDrawer } from './AssignDrawer'

export type Perms = { manage: boolean; contribute: boolean; admin: boolean }

type Filter = 'todo' | RecordKind

export function ClientDossier({
  client, records, assigned, members, me, perms,
}: {
  client: Client
  records: ClientRecord[]
  assigned: string[]
  members: Member[]
  me: Member
  perms: Perms
}) {
  const [filter, setFilter] = useState<Filter>('todo')
  const [onlyPending, setOnlyPending] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const owner = client.owner_member_id ? byId.get(client.owner_member_id) : null
  const backup = client.backup_member_id ? byId.get(client.backup_member_id) : null
  const team = assigned.map((id) => byId.get(id)).filter(Boolean) as Member[]
  const pendingCount = records.filter((r) => r.status === 'por_confirmar').length

  // Lo que hay que leer antes de trabajar con el cliente
  const considerations = records.filter((r) => r.kind === 'consideracion' && r.status === 'confirmado')

  const shown = records.filter(
    (r) => (filter === 'todo' || r.kind === filter) && (!onlyPending || r.status === 'por_confirmar'),
  )
  const groups = useMemo(() => {
    const map = new Map<string, ClientRecord[]>()
    for (const r of shown) {
      const key = fmtMonth(r.created_at)
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return [...map.entries()]
  }, [shown])

  const counts: Record<Filter, number> = {
    todo: records.length,
    acuerdo: records.filter((r) => r.kind === 'acuerdo').length,
    consideracion: records.filter((r) => r.kind === 'consideracion').length,
    pendiente: records.filter((r) => r.kind === 'pendiente').length,
  }
  const selected = records.find((r) => r.id === selectedId) ?? null

  return (
    <div className="page page-dossier">
      <nav className="crumbs" aria-label="Ruta">
        <Link href="/clientes">Clientes</Link>
        <ChevronRight size={14} aria-hidden />
        <span aria-current="page">{client.name}</span>
      </nav>

      <header className="dossier-head">
        <span className={`swatch swatch-lg swatch-${swatch(client.id)}`} aria-hidden>{client.name.charAt(0)}</span>
        <h1 className="page-title">{client.name}</h1>
        <div className="head-actions">
          {perms.manage && (
            <button className="btn btn-ghost" onClick={() => setTeamOpen(true)}>
              <UsersRound size={16} aria-hidden /> Equipo
            </button>
          )}
          {perms.contribute && (
            <button className="btn btn-primary" onClick={() => setQuickOpen(true)}>
              <Plus size={16} aria-hidden /> Registrar
            </button>
          )}
        </div>
      </header>

      <dl className="props">
        <div className="prop">
          <dt>Responsable</dt>
          <dd>{owner ? <><Avatar member={owner} /> {owner.full_name}</> : <span className="muted">Sin responsable</span>}</dd>
        </div>
        <div className="prop">
          <dt>Suplente</dt>
          <dd>{backup ? <><Avatar member={backup} /> {backup.full_name}</> : <span className="muted">Sin suplente</span>}</dd>
        </div>
        <div className="prop">
          <dt>Equipo</dt>
          <dd>
            {team.length ? (
              <span className="avatar-stack">
                {team.map((m) => <span key={m.id} title={`${m.full_name} · ${ROLE_LABEL[m.role]}`}><Avatar member={m} /></span>)}
                <span className="muted">{team.length === 1 ? team[0].full_name : `${team.length} personas`}</span>
              </span>
            ) : <span className="muted">Nadie asignado</span>}
          </dd>
        </div>
        <div className="prop">
          <dt>Por confirmar</dt>
          <dd>{pendingCount ? <span className="pending-pill">{pendingCount}</span> : <span className="muted">Al día</span>}</dd>
        </div>
      </dl>

      {considerations.length > 0 && (
        <section className="brief" aria-labelledby="brief-title">
          <h2 id="brief-title" className="brief-title">Antes de trabajar con {client.name}</h2>
          <ul className="brief-list">
            {considerations.map((c) => (
              <li key={c.id}>
                <button className="brief-item" onClick={() => setSelectedId(c.id)}>
                  {c.content}
                  {c.is_internal && <span className="chip chip-internal"><Lock size={11} aria-hidden /> Interna</span>}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="timeline-bar">
        <div className="segmented" role="tablist" aria-label="Filtrar registros">
          {(['todo', 'acuerdo', 'consideracion', 'pendiente'] as Filter[]).map((f) => (
            <button
              key={f} role="tab" aria-selected={filter === f}
              className={`seg${filter === f ? ' is-on' : ''}`} onClick={() => setFilter(f)}
            >
              {f === 'todo' ? 'Todo' : KIND_PLURAL[f]}
              <span className="seg-count">{counts[f]}</span>
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
          Solo por confirmar
        </label>
      </div>

      {records.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Este expediente está vacío</p>
          <p className="empty-text">
            Registra el primer acuerdo con {client.name}: lo que se decidió, una preferencia del cliente o algo que quedó pendiente.
          </p>
          {perms.contribute && <button className="btn btn-primary" onClick={() => setQuickOpen(true)}>Registrar</button>}
        </div>
      ) : shown.length === 0 ? (
        <p className="table-empty">No hay registros con este filtro.</p>
      ) : (
        <ol className="timeline">
          {groups.map(([month, items]) => (
            <li key={month} className="tl-group">
              <h3 className="tl-month">{month}</h3>
              <ol>
                {items.map((r) => {
                  const resp = r.responsible_member_id ? byId.get(r.responsible_member_id) : null
                  const author = r.created_by ? byId.get(r.created_by) : null
                  const due = r.due_date ? fmtDue(r.due_date) : null
                  return (
                    <li key={r.id}>
                      <button className={`tl-item${r.status === 'por_confirmar' ? ' is-pending' : ''}`} onClick={() => setSelectedId(r.id)}>
                        <StatusMarker kind={r.kind} status={r.status} />
                        <span className="tl-body">
                          <span className="tl-text">{r.content}</span>
                          <span className="tl-meta">
                            <KindTag kind={r.kind} />
                            {r.status === 'por_confirmar' && (
                              <span className="meta-pending">Por confirmar{author ? `, registró ${author.full_name?.split(' ')[0]}` : ''}</span>
                            )}
                            {resp && <span className="meta-person"><Avatar member={resp} size={18} /> {resp.full_name}</span>}
                            {due && (
                              <span className={`due${due.overdue ? ' due-late' : due.soon ? ' due-soon' : ''}`}>
                                {due.overdue ? `Venció ${due.label.toLowerCase()}` : `Para ${due.label.toLowerCase()}`}
                              </span>
                            )}
                            {r.is_internal && <span className="chip chip-internal"><Lock size={11} aria-hidden /> Interna</span>}
                          </span>
                        </span>
                        <time className="tl-date" dateTime={r.created_at}>{fmtDay(r.created_at)}</time>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}

      <QuickRecordDrawer open={quickOpen} onClose={() => setQuickOpen(false)} client={client} members={members} me={me} owner={owner ?? null} />
      <RecordDrawer
        record={selected} onClose={() => setSelectedId(null)} members={members} perms={perms} clientName={client.name}
      />
      {perms.manage && (
        <AssignDrawer open={teamOpen} onClose={() => setTeamOpen(false)} client={client} members={members} assigned={assigned} />
      )}
    </div>
  )
}
