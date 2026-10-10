import type {
  AppContext, Client, ClientRecord, ClientSummary, HistoryEntry, Invitation, PendingRecord, RecordKind, Role,
} from '../types'

export type NewRecordInput = {
  client_id: string
  kind: RecordKind
  content: string
  responsible_member_id: string | null
  due_date: string | null
  is_internal: boolean
  confirmed: boolean
}

export type RecordPatch = Partial<Pick<ClientRecord,
  'kind' | 'content' | 'responsible_member_id' | 'due_date' | 'is_internal'>>

/** Acceso a datos. Hay dos implementaciones: Supabase y demo en memoria. */
export interface Repo {
  getContext(): Promise<AppContext | null>
  hasSession(): Promise<boolean>

  listClients(): Promise<ClientSummary[]>
  getClient(id: string): Promise<Client | null>
  listAssignments(clientId: string): Promise<string[]>
  listRecords(clientId: string): Promise<ClientRecord[]>
  getHistory(recordId: string): Promise<HistoryEntry[]>
  listPending(): Promise<PendingRecord[]>
  listInvitations(): Promise<Invitation[]>

  createAgency(name: string, fullName: string): Promise<void>
  acceptInvitations(): Promise<number>
  createClient(input: { name: string; owner_member_id: string | null; backup_member_id: string | null }): Promise<string>
  createRecord(input: NewRecordInput): Promise<void>
  updateRecord(id: string, patch: RecordPatch): Promise<void>
  confirmRecords(ids: string[]): Promise<number>
  deleteRecord(id: string): Promise<void>
  setAssignments(clientId: string, memberIds: string[]): Promise<void>
  inviteMember(input: { email: string; role: Role; full_name: string }): Promise<void>
  setMemberActive(memberId: string, active: boolean): Promise<void>
}
