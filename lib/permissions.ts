// Reglas de permisos para la interfaz (qué botones mostrar).
// La fuente de verdad son las políticas RLS y triggers de la base de datos;
// esto solo evita mostrar acciones que la base rechazaría.
import type { Client, Member } from './types'

export function isAdmin(me: Member) {
  return me.role === 'admin'
}

/** Confirmar, editar, asignar personas y crear tareas en un cliente. */
export function canManageClient(me: Member, client: Client) {
  if (me.role === 'admin') return true
  return (
    me.role === 'ejecutivo' &&
    !client.archived_at &&
    (client.owner_member_id === me.id || client.backup_member_id === me.id)
  )
}

/** Registrar información (registro rápido) en un cliente. */
export function canContributeClient(me: Member, client: Client, assignedIds: string[]) {
  if (canManageClient(me, client)) return true
  return (
    !client.archived_at &&
    (me.role === 'ejecutivo' || me.role === 'colaborador') &&
    assignedIds.includes(me.id)
  )
}

/** Lo que registra un colaborador siempre entra por confirmar. */
export function recordsStartConfirmed(me: Member) {
  return me.role === 'admin' || me.role === 'ejecutivo'
}

export function canCreateClients(me: Member) {
  return me.role === 'admin' || me.role === 'ejecutivo'
}
