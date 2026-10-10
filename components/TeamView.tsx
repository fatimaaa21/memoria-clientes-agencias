'use client'

import { useState, useTransition } from 'react'
import { UserPlus } from 'lucide-react'
import type { Invitation, Member, Role } from '@/lib/types'
import { ROLE_LABEL } from '@/lib/types'
import { fmtDay } from '@/lib/format'
import { Avatar, Drawer, toast } from './ui'
import { inviteMemberAction, setMemberActiveAction } from '@/app/actions'

const ROLE_HELP: Record<Role, string> = {
  admin: 'Ve toda la agencia, invita personas y puede eliminar registros.',
  ejecutivo: 'Confirma y edita en los clientes donde es responsable o suplente.',
  colaborador: 'Ve sus clientes asignados; lo que registra queda por confirmar.',
  externo: 'Solo lectura en clientes asignados. Su acceso vence a los 90 días.',
}

export function TeamView({
  members, me, admin, invitations, demo,
}: { members: Member[]; me: Member; admin: boolean; invitations: Invitation[]; demo: boolean }) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const order: Role[] = ['admin', 'ejecutivo', 'colaborador', 'externo']
  const sorted = [...members].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || (a.full_name ?? '').localeCompare(b.full_name ?? ''))

  function setActive(m: Member, active: boolean) {
    if (!active && !window.confirm(`¿Quitar el acceso a ${m.full_name}? Sus registros se conservan.`)) return
    start(async () => {
      const res = await setMemberActiveAction(m.id, active)
      toast(res.ok ? res.message ?? 'Listo' : res.error, res.ok ? 'ok' : 'error')
    })
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Equipo</h1>
          <p className="page-sub">Cuando alguien deja la agencia, quítale el acceso: sus registros se quedan en el expediente.</p>
        </div>
        {admin && (
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <UserPlus size={16} aria-hidden /> Invitar persona
          </button>
        )}
      </header>

      <div className="table table-team" role="table" aria-label="Personas de la agencia">
        <div className="tr th" role="row">
          <span role="columnheader">Persona</span>
          <span role="columnheader">Rol</span>
          <span role="columnheader">Acceso</span>
          <span role="columnheader" />
        </div>
        {sorted.map((m) => (
          <div key={m.id} className={`tr${m.active ? '' : ' is-off'}`} role="row">
            <span className="cell-person" role="cell">
              <Avatar member={m} size={26} />
              <span className="pick-text">
                <span className="strong">{m.full_name || m.email}{m.id === me.id && <span className="muted"> (tú)</span>}</span>
                <span className="muted small">{m.email}</span>
              </span>
            </span>
            <span role="cell">{ROLE_LABEL[m.role]}</span>
            <span role="cell" className="muted">
              {!m.active ? 'Sin acceso' : m.access_expires_at ? `Hasta el ${fmtDay(m.access_expires_at)}` : 'Activo'}
            </span>
            <span role="cell" className="cell-actions">
              {admin && m.id !== me.id && (
                <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setActive(m, !m.active)}>
                  {m.active ? 'Quitar acceso' : 'Devolver acceso'}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {admin && invitations.length > 0 && (
        <section className="stack-8 mt-32">
          <h2 className="section-title">Invitaciones pendientes</h2>
          <ul className="invites">
            {invitations.map((i) => (
              <li key={i.id}>
                <span className="strong">{i.full_name || i.email}</span>
                <span className="muted">{i.email}, {ROLE_LABEL[i.role].toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InviteDrawer open={open} onClose={() => setOpen(false)} demo={demo} />
    </div>
  )
}

function InviteDrawer({ open, onClose, demo }: { open: boolean; onClose: () => void; demo: boolean }) {
  const [role, setRole] = useState<Role>('colaborador')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  function submit(form: FormData) {
    setError('')
    start(async () => {
      const res = await inviteMemberAction(form)
      if (!res.ok) return setError(res.error)
      toast(res.message ?? 'Invitación guardada')
      onClose()
    })
  }

  return (
    <Drawer
      open={open} onClose={onClose} title="Invitar persona"
      subtitle="Entrará con este rol cuando inicie sesión con ese correo."
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="invite" className="btn btn-primary" disabled={pending}>Guardar invitación</button>
        </>
      }
    >
      <form id="invite" action={submit} className="stack-16">
        <label className="field">
          <span className="field-label">Nombre</span>
          <input className="input" name="full_name" autoComplete="off" data-autofocus />
        </label>
        <label className="field">
          <span className="field-label">Correo</span>
          <input className="input" name="email" type="email" required autoComplete="off" />
        </label>
        <fieldset className="field">
          <legend className="field-label">Rol</legend>
          <input type="hidden" name="role" value={role} />
          <div className="role-list">
            {(['ejecutivo', 'colaborador', 'externo', 'admin'] as Role[]).map((r) => (
              <label key={r} className={`role-option${role === r ? ' is-on' : ''}`}>
                <input type="radio" name="role-pick" checked={role === r} onChange={() => setRole(r)} />
                <span>
                  <span className="strong">{ROLE_LABEL[r]}</span>
                  <span className="muted small block">{ROLE_HELP[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="note">
          {demo
            ? 'En el demo la invitación solo se guarda en la lista.'
            : 'Todavía no se envía un correo automático: compártele el enlace de la app para que entre con este correo.'}
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Drawer>
  )
}
