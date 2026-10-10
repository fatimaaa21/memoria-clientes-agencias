'use client'

import { useActionState } from 'react'
import { createAgencyAction } from '../actions'
import type { ActionResult } from '@/lib/types'

export function CreateAgencyForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    (_prev, form) => createAgencyAction(form),
    null,
  )
  return (
    <form action={action} className="stack-16">
      <label className="field">
        <span className="field-label">Tu nombre</span>
        <input className="input" name="full_name" autoComplete="name" required />
      </label>
      <label className="field">
        <span className="field-label">Nombre de la agencia</span>
        <input className="input" name="agency" required minLength={2} />
      </label>
      {state && !state.ok && <p className="form-error" role="alert">{state.error}</p>}
      <button className="btn btn-primary btn-block" disabled={pending}>
        {pending ? 'Creando…' : 'Crear agencia'}
      </button>
    </form>
  )
}
