'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { repo, isDemo } from '@/lib/data'
import { DEMO_COOKIE } from '@/lib/data/demo'
import { sendAccessEmail } from '@/lib/data/supabase'
import type { ActionResult, HistoryEntry, RecordKind, Role } from '@/lib/types'

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/row-level security|permission denied/i.test(msg)) return 'No tienes permiso para hacer esto.'
  if (/duplicate key.*invitations/i.test(msg)) return 'Ya hay una invitación pendiente para ese correo.'
  if (/check constraint/i.test(msg)) return 'Revisa los datos: hay un campo vacío o demasiado largo.'
  return msg
}

async function run(fn: () => Promise<string | void>): Promise<ActionResult> {
  try {
    const message = await fn()
    revalidatePath('/', 'layout')
    return { ok: true, message: message ?? undefined }
  } catch (e) {
    return { ok: false, error: friendly(e) }
  }
}

const clean = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function createClientAction(form: FormData): Promise<ActionResult & { id?: string }> {
  const name = clean(form.get('name'))
  if (!name) return { ok: false, error: 'Escribe el nombre del cliente.' }
  try {
    const id = await repo().createClient({
      name,
      owner_member_id: clean(form.get('owner')),
      backup_member_id: clean(form.get('backup')),
    })
    revalidatePath('/', 'layout')
    return { ok: true, id, message: 'Cliente creado' }
  } catch (e) {
    return { ok: false, error: friendly(e) }
  }
}

export async function createRecordAction(form: FormData): Promise<ActionResult> {
  const content = clean(form.get('content'))
  if (!content) return { ok: false, error: 'Escribe qué se acordó.' }
  return run(async () => {
    await repo().createRecord({
      client_id: String(form.get('client_id')),
      kind: (form.get('kind') as RecordKind) ?? 'acuerdo',
      content,
      responsible_member_id: clean(form.get('responsible')),
      due_date: clean(form.get('due_date')),
      is_internal: form.get('is_internal') === 'on',
      confirmed: form.get('confirmed') === 'on',
    })
    return 'Registro guardado'
  })
}

export async function updateRecordAction(id: string, form: FormData): Promise<ActionResult> {
  const content = clean(form.get('content'))
  if (!content) return { ok: false, error: 'El registro no puede quedar vacío.' }
  return run(async () => {
    await repo().updateRecord(id, {
      kind: form.get('kind') as RecordKind,
      content,
      responsible_member_id: clean(form.get('responsible')),
      due_date: clean(form.get('due_date')),
      is_internal: form.get('is_internal') === 'on',
    })
    return 'Cambios guardados'
  })
}

export async function confirmRecordsAction(ids: string[]): Promise<ActionResult> {
  return run(async () => {
    const n = await repo().confirmRecords(ids)
    return n === 1 ? '1 registro confirmado' : `${n} registros confirmados`
  })
}

export async function deleteRecordAction(id: string): Promise<ActionResult> {
  return run(async () => {
    await repo().deleteRecord(id)
    return 'Registro eliminado'
  })
}

export async function getHistoryAction(recordId: string): Promise<HistoryEntry[]> {
  try {
    return await repo().getHistory(recordId)
  } catch {
    return []
  }
}

export async function setAssignmentsAction(clientId: string, memberIds: string[]): Promise<ActionResult> {
  return run(async () => {
    await repo().setAssignments(clientId, memberIds)
    return 'Equipo actualizado'
  })
}

export async function inviteMemberAction(form: FormData): Promise<ActionResult> {
  const email = clean(form.get('email'))
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: 'Escribe un correo válido.' }
  return run(async () => {
    await repo().inviteMember({
      email,
      role: (form.get('role') as Role) ?? 'colaborador',
      full_name: clean(form.get('full_name')) ?? '',
    })
    if (isDemo()) return `Invitación guardada para ${email}`
    const sent = await sendAccessEmail(email)
    return sent.ok
      ? `Invitación enviada a ${email}`
      : `Invitación guardada, pero el correo no salió (${sent.error}). Compártele el enlace de la app.`
  })
}

export async function setMemberActiveAction(memberId: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    await repo().setMemberActive(memberId, active)
    return active ? 'Acceso reactivado' : 'Acceso desactivado'
  })
}

export async function createAgencyAction(form: FormData): Promise<ActionResult> {
  const name = clean(form.get('agency'))
  if (!name || name.length < 2) return { ok: false, error: 'Escribe el nombre de la agencia.' }
  try {
    await repo().createAgency(name, clean(form.get('full_name')) ?? '')
  } catch (e) {
    return { ok: false, error: friendly(e) }
  }
  redirect('/clientes')
}

/** Solo en modo demo: cambia la persona con la que se ve la app. */
export async function switchDemoMemberAction(memberId: string) {
  if (!isDemo()) return
  ;(await cookies()).set(DEMO_COOKIE, memberId, { path: '/', sameSite: 'lax' })
  revalidatePath('/', 'layout')
}
