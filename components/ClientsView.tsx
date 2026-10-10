'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Plus, Search } from 'lucide-react'
import type { ClientSummary, Member } from '@/lib/types'
import { relative, swatch } from '@/lib/format'
import { Avatar, Drawer, MemberSelect, toast } from './ui'
import { createClientAction } from '@/app/actions'

export function ClientsView({
  clients, members, me, canCreate,
}: { clients: ClientSummary[]; members: Member[]; me: Member; canCreate: boolean }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const shown = clients.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-sub">
            {clients.length === 1 ? '1 cliente' : `${clients.length} clientes`} que puedes ver
          </p>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} aria-hidden /> Nuevo cliente
          </button>
        )}
      </header>

      {clients.length > 0 && (
        <div className="toolbar">
          <label className="search">
            <Search size={15} aria-hidden />
            <input
              className="search-input" placeholder="Buscar cliente" value={q}
              onChange={(e) => setQ(e.target.value)} aria-label="Buscar cliente"
            />
          </label>
        </div>
      )}

      {clients.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Todavía no hay clientes aquí</p>
          <p className="empty-text">
            {canCreate
              ? 'Agrega tu primer cliente para empezar a guardar sus acuerdos.'
              : 'Cuando te asignen a un cliente, aparecerá en esta lista.'}
          </p>
          {canCreate && <button className="btn btn-primary" onClick={() => setOpen(true)}>Nuevo cliente</button>}
        </div>
      ) : (
        <div className="table" role="table" aria-label="Clientes">
          <div className="tr th" role="row">
            <span role="columnheader">Cliente</span>
            <span role="columnheader">Responsable</span>
            <span role="columnheader" className="num">Registros</span>
            <span role="columnheader">Por confirmar</span>
            <span role="columnheader">Última actividad</span>
          </div>
          {shown.map((c) => {
            const owner = c.owner_member_id ? byId.get(c.owner_member_id) : null
            return (
              <Link key={c.id} href={`/clientes/${c.id}`} className="tr" role="row">
                <span className="cell-client" role="cell">
                  <span className={`swatch swatch-${swatch(c.id)}`} aria-hidden>{c.name.charAt(0)}</span>
                  <span className="truncate strong">{c.name}</span>
                  {(c.owner_member_id === me.id || c.backup_member_id === me.id) && <span className="chip">Tuyo</span>}
                </span>
                <span className="cell-person" role="cell">
                  {owner ? <><Avatar member={owner} /> <span className="truncate">{owner.full_name}</span></> : <span className="muted">Sin responsable</span>}
                </span>
                <span className="num muted" role="cell">{c.record_count}</span>
                <span role="cell">
                  {c.pending_count > 0
                    ? <span className="pending-pill">{c.pending_count} por confirmar</span>
                    : <span className="muted">Al día</span>}
                </span>
                <span className="muted" role="cell">{relative(c.last_activity)}</span>
              </Link>
            )
          })}
          {shown.length === 0 && <p className="table-empty">Ningún cliente coincide con “{q}”.</p>}
        </div>
      )}

      <NewClientDrawer open={open} onClose={() => setOpen(false)} members={members} me={me} />
    </div>
  )
}

function NewClientDrawer({ open, onClose, members, me }: { open: boolean; onClose: () => void; members: Member[]; me: Member }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const isExec = me.role === 'ejecutivo'

  function submit(form: FormData) {
    setError('')
    start(async () => {
      const res = await createClientAction(form)
      if (!res.ok) return setError(res.error)
      toast('Cliente creado')
      onClose()
      if (res.id) router.push(`/clientes/${res.id}`)
    })
  }

  return (
    <Drawer
      open={open} onClose={onClose} title="Nuevo cliente"
      subtitle={isExec ? 'Quedarás como responsable de este cliente.' : 'Elige quién responde por este cliente.'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="new-client" className="btn btn-primary" disabled={pending}>
            {pending ? 'Creando…' : 'Crear cliente'}
          </button>
        </>
      }
    >
      <form id="new-client" action={submit} className="stack-16">
        <label className="field">
          <span className="field-label">Nombre del cliente</span>
          <input className="input" name="name" required maxLength={160} placeholder="Ej. Café Altura" data-autofocus />
        </label>
        {!isExec && (
          <label className="field">
            <span className="field-label">Responsable</span>
            <MemberSelect name="owner" members={members} filter={(m) => m.role === 'admin' || m.role === 'ejecutivo'} />
          </label>
        )}
        <label className="field">
          <span className="field-label">Suplente <span className="muted">(opcional)</span></span>
          <MemberSelect name="backup" members={members} placeholder="Sin suplente"
            filter={(m) => (m.role === 'admin' || m.role === 'ejecutivo') && m.id !== me.id} />
          <span className="field-help">Responde cuando el responsable no está. Así nadie se queda sin poder confirmar.</span>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Drawer>
  )
}
