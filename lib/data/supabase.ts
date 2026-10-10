import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/types/database.types'
import type { AppContext, ClientSummary, HistoryEntry, PendingRecord } from '../types'
import type { Repo } from './repo'

export async function supabaseServer() {
  const store = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options))
          } catch {
            // Llamado desde un Server Component: el middleware refresca la sesión.
          }
        },
      },
    },
  )
}

function fail(error: { message: string } | null): asserts error is null {
  if (error) throw new Error(error.message)
}

export const supabaseRepo: Repo = {
  async hasSession() {
    const sb = await supabaseServer()
    const { data } = await sb.auth.getUser()
    return !!data.user
  },

  async getContext(): Promise<AppContext | null> {
    const sb = await supabaseServer()
    const { data: auth } = await sb.auth.getUser()
    if (!auth.user) return null

    const { data: mine, error } = await sb
      .from('agency_members')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('active', true)
      .order('created_at')
      .limit(1)
    fail(error)
    const me = mine?.[0]
    if (!me) return null

    const [{ data: agency, error: e1 }, { data: members, error: e2 }] = await Promise.all([
      sb.from('agencies').select('*').eq('id', me.agency_id).single(),
      sb.from('agency_members').select('*').eq('agency_id', me.agency_id).order('full_name'),
    ])
    fail(e1)
    fail(e2)
    return { userEmail: auth.user.email ?? '', agency: agency!, me, members: members ?? [], demo: false }
  },

  async listClients(): Promise<ClientSummary[]> {
    const sb = await supabaseServer()
    const [{ data: clients, error: e1 }, { data: recs, error: e2 }] = await Promise.all([
      sb.from('clients').select('*').is('archived_at', null).order('name'),
      sb.from('records').select('client_id,status,created_at,updated_at').is('deleted_at', null),
    ])
    fail(e1)
    fail(e2)
    return (clients ?? []).map((c) => {
      const mine = (recs ?? []).filter((r) => r.client_id === c.id)
      const last = mine.reduce<string | null>((acc, r) => (!acc || r.updated_at > acc ? r.updated_at : acc), null)
      return {
        ...c,
        record_count: mine.length,
        pending_count: mine.filter((r) => r.status === 'por_confirmar').length,
        last_activity: last,
      }
    })
  },

  async getClient(id) {
    const sb = await supabaseServer()
    const { data, error } = await sb.from('clients').select('*').eq('id', id).maybeSingle()
    fail(error)
    return data
  },

  async listAssignments(clientId) {
    const sb = await supabaseServer()
    const { data, error } = await sb.from('client_assignments').select('member_id').eq('client_id', clientId)
    fail(error)
    return (data ?? []).map((a) => a.member_id)
  },

  async listRecords(clientId) {
    const sb = await supabaseServer()
    const { data, error } = await sb
      .from('records')
      .select('*')
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    fail(error)
    return data ?? []
  },

  async getHistory(recordId): Promise<HistoryEntry[]> {
    const sb = await supabaseServer()
    const { data, error } = await sb
      .from('record_history')
      .select('id,changed_at,changed_by,old_values,new_values')
      .eq('record_id', recordId)
      .order('changed_at', { ascending: false })
    fail(error)
    return (data ?? []) as HistoryEntry[]
  },

  async listPending(): Promise<PendingRecord[]> {
    const sb = await supabaseServer()
    const { data, error } = await sb
      .from('records')
      .select('*, clients(name)')
      .eq('status', 'por_confirmar')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    fail(error)
    return (data ?? []).map(({ clients, ...r }) => ({ ...r, client_name: clients?.name ?? '' }))
  },

  async listInvitations() {
    const sb = await supabaseServer()
    const { data, error } = await sb
      .from('agency_invitations')
      .select('*')
      .is('accepted_at', null)
      .order('created_at', { ascending: false })
    fail(error)
    return data ?? []
  },

  async createAgency(name, fullName) {
    const sb = await supabaseServer()
    const { error } = await sb.rpc('create_agency', { p_name: name, p_full_name: fullName })
    fail(error)
  },

  async acceptInvitations() {
    const sb = await supabaseServer()
    const { data, error } = await sb.rpc('accept_invitations')
    fail(error)
    return data ?? 0
  },

  async createClient(input) {
    const sb = await supabaseServer()
    const ctx = await this.getContext()
    if (!ctx) throw new Error('Sin sesión')
    const { data, error } = await sb
      .from('clients')
      .insert({ agency_id: ctx.agency.id, ...input })
      .select('id')
      .single()
    fail(error)
    return data!.id
  },

  async createRecord({ confirmed, ...input }) {
    const sb = await supabaseServer()
    // agency_id lo asigna el trigger a partir del cliente
    const { error } = await sb.from('records').insert({
      ...input,
      agency_id: '00000000-0000-0000-0000-000000000000',
      status: confirmed ? 'confirmado' : 'por_confirmar',
    })
    fail(error)
  },

  async updateRecord(id, patch) {
    const sb = await supabaseServer()
    const { error, count } = await sb.from('records').update(patch, { count: 'exact' }).eq('id', id)
    fail(error)
    if (count === 0) throw new Error('No tienes permiso para editar este registro')
  },

  async confirmRecords(ids) {
    const sb = await supabaseServer()
    const { error, count } = await sb
      .from('records')
      .update({ status: 'confirmado' }, { count: 'exact' })
      .in('id', ids)
    fail(error)
    return count ?? 0
  },

  async deleteRecord(id) {
    const sb = await supabaseServer()
    const { error, count } = await sb
      .from('records')
      .update({ deleted_at: new Date().toISOString() }, { count: 'exact' })
      .eq('id', id)
    fail(error)
    if (count === 0) throw new Error('No tienes permiso para eliminar este registro')
  },

  async setAssignments(clientId, memberIds) {
    const sb = await supabaseServer()
    const current = await this.listAssignments(clientId)
    const toAdd = memberIds.filter((m) => !current.includes(m))
    const toRemove = current.filter((m) => !memberIds.includes(m))
    if (toAdd.length) {
      const { error } = await sb.from('client_assignments').insert(
        toAdd.map((member_id) => ({
          client_id: clientId,
          member_id,
          agency_id: '00000000-0000-0000-0000-000000000000', // lo asigna el trigger
        })),
      )
      fail(error)
    }
    if (toRemove.length) {
      const { error } = await sb.from('client_assignments').delete().eq('client_id', clientId).in('member_id', toRemove)
      fail(error)
    }
  },

  async inviteMember(input) {
    const sb = await supabaseServer()
    const ctx = await this.getContext()
    if (!ctx) throw new Error('Sin sesión')
    const { error } = await sb.from('agency_invitations').insert({ agency_id: ctx.agency.id, ...input })
    fail(error)
  },

  async setMemberActive(memberId, active) {
    const sb = await supabaseServer()
    const { error } = await sb.from('agency_members').update({ active }).eq('id', memberId)
    fail(error)
  },
}
