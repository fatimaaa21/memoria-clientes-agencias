'use client'

import { useEffect, useState, useTransition } from 'react'
import type { Client, Member } from '@/lib/types'
import { ROLE_LABEL } from '@/lib/types'
import { Avatar, Drawer, toast } from './ui'
import { setAssignmentsAction } from '@/app/actions'

export function AssignDrawer({
  open, onClose, client, members, assigned,
}: { open: boolean; onClose: () => void; client: Client; members: Member[]; assigned: string[] }) {
  const [sel, setSel] = useState<string[]>(assigned)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  useEffect(() => { if (open) setSel(assigned) }, [open, assigned])

  // Responsable y suplente ya tienen acceso; el admin ve todo.
  const candidates = members.filter(
    (m) => m.active && m.role !== 'admin' && m.id !== client.owner_member_id && m.id !== client.backup_member_id,
  )
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  function save() {
    setError('')
    start(async () => {
      const res = await setAssignmentsAction(client.id, sel)
      if (!res.ok) return setError(res.error)
      toast('Equipo actualizado')
      onClose()
    })
  }

  return (
    <Drawer
      open={open} onClose={onClose} title="Equipo del cliente"
      subtitle={`Quién puede ver y registrar información de ${client.name}.`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={pending}>Guardar equipo</button>
        </>
      }
    >
      {candidates.length === 0 ? (
        <p className="muted">No hay más personas en la agencia. Invítalas desde Equipo.</p>
      ) : (
        <ul className="pick-list">
          {candidates.map((m) => (
            <li key={m.id}>
              <label className="pick-row">
                <input type="checkbox" checked={sel.includes(m.id)} onChange={() => toggle(m.id)} />
                <Avatar member={m} size={28} />
                <span className="pick-text">
                  <span>{m.full_name || m.email}</span>
                  <span className="muted small">
                    {ROLE_LABEL[m.role]}{m.role === 'externo' ? ': solo lectura, sin consideraciones internas' : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Drawer>
  )
}
