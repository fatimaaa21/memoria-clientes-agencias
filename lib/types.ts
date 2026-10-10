import type { Database } from '@/types/database.types'

type T = Database['public']['Tables']
export type Role = Database['public']['Enums']['app_role']
export type RecordKind = Database['public']['Enums']['record_kind']
export type RecordStatus = Database['public']['Enums']['record_status']

export type Agency = T['agencies']['Row']
export type Member = T['agency_members']['Row']
export type Client = T['clients']['Row']
export type ClientRecord = T['records']['Row']
export type Invitation = T['agency_invitations']['Row']

export type HistoryEntry = {
  id: number
  changed_at: string
  changed_by: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
}

/** Cliente con lo necesario para la lista y la barra lateral. */
export type ClientSummary = Client & {
  pending_count: number
  record_count: number
  last_activity: string | null
}

/** Registro por confirmar con el nombre de su cliente (para la cola). */
export type PendingRecord = ClientRecord & { client_name: string }

/** Contexto del usuario actual dentro de su agencia. */
export type AppContext = {
  userEmail: string
  agency: Agency
  me: Member
  members: Member[]
  demo: boolean
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  ejecutivo: 'Ejecutivo de cuenta',
  colaborador: 'Colaborador',
  externo: 'Externo',
}

export const KIND_LABEL: Record<RecordKind, string> = {
  acuerdo: 'Acuerdo',
  consideracion: 'Consideración',
  pendiente: 'Pendiente',
}

export const KIND_PLURAL: Record<RecordKind, string> = {
  acuerdo: 'Acuerdos',
  consideracion: 'Consideraciones',
  pendiente: 'Pendientes',
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string }
