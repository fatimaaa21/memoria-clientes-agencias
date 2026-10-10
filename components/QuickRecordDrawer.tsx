'use client'

import { useState, useTransition } from 'react'
import type { Client, Member, RecordKind } from '@/lib/types'
import { recordsStartConfirmed } from '@/lib/permissions'
import { Drawer, MemberSelect, toast } from './ui'
import { createRecordAction } from '@/app/actions'

const KINDS: { value: RecordKind; label: string; hint: string; placeholder: string }[] = [
  { value: 'acuerdo', label: 'Acuerdo', hint: 'Algo que se decidió con el cliente', placeholder: 'Ej. Se suben a 4 publicaciones por semana en diciembre; el extra se cobra aparte.' },
  { value: 'consideracion', label: 'Consideración', hint: 'Una preferencia o restricción del cliente', placeholder: 'Ej. No usar fotos de stock; todo sale de la sesión en la tienda.' },
  { value: 'pendiente', label: 'Pendiente', hint: 'Algo que alguien tiene que hacer', placeholder: 'Ej. Mandar 3 conceptos para la campaña de diciembre.' },
]

export function QuickRecordDrawer({
  open, onClose, client, members, me, owner,
}: { open: boolean; onClose: () => void; client: Client; members: Member[]; me: Member; owner: Member | null }) {
  const [kind, setKind] = useState<RecordKind>('acuerdo')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const confirmsDirectly = recordsStartConfirmed(me)
  const current = KINDS.find((k) => k.value === kind)!

  function submit(form: FormData) {
    setError('')
    start(async () => {
      const res = await createRecordAction(form)
      if (!res.ok) return setError(res.error)
      toast(confirmsDirectly ? `${current.label} guardado` : `${current.label} guardado, por confirmar`)
      setKind('acuerdo')
      onClose()
    })
  }

  return (
    <Drawer
      open={open} onClose={onClose} title="Registrar" subtitle={client.name}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="quick-record" className="btn btn-primary" disabled={pending}>
            {pending ? 'Guardando…' : `Guardar ${current.label.toLowerCase()}`}
          </button>
        </>
      }
    >
      <form id="quick-record" action={submit} className="stack-16">
        <input type="hidden" name="client_id" value={client.id} />
        <input type="hidden" name="kind" value={kind} />

        <fieldset className="field">
          <legend className="field-label">Tipo</legend>
          <div className="kind-picker">
            {KINDS.map((k) => (
              <button
                key={k.value} type="button" aria-pressed={kind === k.value}
                className={`kind-option kind-option-${k.value}${kind === k.value ? ' is-on' : ''}`}
                onClick={() => setKind(k.value)}
              >
                <span className="kind-option-label">{k.label}</span>
                <span className="kind-option-hint">{k.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span className="field-label">Qué quedó</span>
          <textarea className="input textarea" name="content" required maxLength={4000} rows={4}
            placeholder={current.placeholder} data-autofocus />
        </label>

        <div className="grid-2">
          <label className="field">
            <span className="field-label">Responsable</span>
            <MemberSelect name="responsible" members={members} />
          </label>
          <label className="field">
            <span className="field-label">{kind === 'pendiente' ? 'Fecha límite' : 'Fecha'} <span className="muted">(opcional)</span></span>
            <input className="input" type="date" name="due_date" />
          </label>
        </div>

        <label className="check">
          <input type="checkbox" name="is_internal" />
          <span>
            Solo para el equipo
            <span className="field-help">No se incluye en minutas al cliente ni la ven personas externas.</span>
          </span>
        </label>

        {confirmsDirectly ? (
          <label className="check">
            <input type="checkbox" name="confirmed" defaultChecked />
            <span>
              Ya está confirmado
              <span className="field-help">Desmárcalo si todavía hay que validarlo con alguien.</span>
            </span>
          </label>
        ) : (
          <p className="note">
            Quedará <strong>por confirmar</strong> hasta que {owner?.full_name ?? 'el responsable del cliente'} lo revise.
          </p>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Drawer>
  )
}
