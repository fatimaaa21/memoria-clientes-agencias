'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { Client } from '@/lib/types'
import { Drawer, toast } from './ui'
import { createProjectAction } from '@/app/actions'

/** Panel para crear un proyecto. Si recibe un solo cliente, no pregunta cuál. */
export function NewProjectDrawer({
  open, onClose, clients, fixedClient,
}: { open: boolean; onClose: () => void; clients: Client[]; fixedClient?: Client | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')

  function submit(form: FormData) {
    setError('')
    start(async () => {
      const res = await createProjectAction(form)
      if (!res.ok) return setError(res.error)
      toast('Proyecto creado')
      onClose()
      if (res.id) router.push(`/proyectos/${res.id}`)
    })
  }

  return (
    <Drawer
      open={open} onClose={onClose} title="Nuevo proyecto"
      subtitle={fixedClient ? fixedClient.name : 'Una campaña, lanzamiento o cuenta dentro de un cliente.'}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="new-project" className="btn btn-primary" disabled={pending}>
            {pending ? 'Creando…' : 'Crear proyecto'}
          </button>
        </>
      }
    >
      {!fixedClient && clients.length === 0 ? (
        <p className="muted">Solo el responsable o suplente de un cliente puede crear sus proyectos.</p>
      ) : (
        <form id="new-project" action={submit} className="stack-16">
          <label className="field">
            <span className="field-label">Nombre del proyecto</span>
            <input className="input" name="name" required maxLength={120} placeholder="Ej. Campaña de diciembre" data-autofocus />
          </label>
          {fixedClient ? (
            <input type="hidden" name="client_id" value={fixedClient.id} />
          ) : (
            <label className="field">
              <span className="field-label">Cliente</span>
              <select className="input" name="client_id" required defaultValue="">
                <option value="" disabled>Elige un cliente</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}
          <p className="note">
            Las consideraciones del cliente aplican a todos sus proyectos. Dentro del proyecto registras sus acuerdos y pendientes.
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      )}
    </Drawer>
  )
}
