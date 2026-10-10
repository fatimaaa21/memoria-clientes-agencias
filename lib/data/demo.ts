import 'server-only'
import { cookies } from 'next/headers'
import type {
  Agency, Client, ClientRecord, ClientSummary, HistoryEntry, Invitation, Member, PendingRecord,
} from '../types'
import { canContributeClient, canManageClient, recordsStartConfirmed } from '../permissions'
import type { Repo } from './repo'

// -----------------------------------------------------------------------------
// Modo demo: datos de ejemplo en memoria, sin Supabase.
// Sirve para probar la interfaz y para mostrarla a agencias sin crear cuentas.
// Los cambios viven mientras el servidor esté encendido.
// -----------------------------------------------------------------------------

export const DEMO_COOKIE = 'demo_member'

type Store = {
  agency: Agency
  members: Member[]
  clients: Client[]
  assignments: { client_id: string; member_id: string }[]
  records: ClientRecord[]
  history: (HistoryEntry & { record_id: string })[]
  invitations: Invitation[]
  seq: number
}

const g = globalThis as unknown as { __demoStore?: Store }

function daysAgo(n: number, hour = 11) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, 15, 0, 0)
  return d.toISOString()
}
function dayOnly(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

function seed(): Store {
  const agency: Agency = { id: 'ag-1', name: 'Agencia Colmena', created_at: daysAgo(200) }
  const m = (id: string, full_name: string, role: Member['role'], email: string, extra: Partial<Member> = {}): Member => ({
    id, agency_id: agency.id, user_id: `u-${id}`, role, full_name, email, active: true,
    access_expires_at: null, created_at: daysAgo(180), ...extra,
  })
  const members = [
    m('m-mariana', 'Mariana Robles', 'admin', 'mariana@colmena.mx'),
    m('m-diego', 'Diego Herrera', 'ejecutivo', 'diego@colmena.mx'),
    m('m-sofia', 'Sofía Lara', 'ejecutivo', 'sofia@colmena.mx'),
    m('m-andres', 'Andrés Pineda', 'colaborador', 'andres@colmena.mx'),
    m('m-valeria', 'Valeria Cruz', 'colaborador', 'valeria@colmena.mx'),
    m('m-tomas', 'Tomás Ibarra', 'externo', 'tomas.foto@gmail.com', { access_expires_at: dayOnly(62) }),
  ]
  const c = (id: string, name: string, owner: string, backup: string | null): Client => ({
    id, agency_id: agency.id, name, owner_member_id: owner, backup_member_id: backup,
    archived_at: null, created_by: 'm-mariana', created_at: daysAgo(150),
  })
  const clients = [
    c('c-cafe', 'Café Altura', 'm-diego', 'm-sofia'),
    c('c-dental', 'Clínica Dental Sonríe', 'm-diego', null),
    c('c-puerta', 'Inmobiliaria Puerta Norte', 'm-sofia', 'm-diego'),
    c('c-espiga', 'Panadería La Espiga', 'm-sofia', null),
    c('c-pulso', 'Gimnasio Pulso', 'm-diego', null),
    c('c-lirio', 'Hotel Casa Lirio', 'm-sofia', null),
  ]
  const assignments = [
    { client_id: 'c-cafe', member_id: 'm-andres' },
    { client_id: 'c-cafe', member_id: 'm-valeria' },
    { client_id: 'c-cafe', member_id: 'm-tomas' },
    { client_id: 'c-dental', member_id: 'm-valeria' },
    { client_id: 'c-puerta', member_id: 'm-andres' },
    { client_id: 'c-lirio', member_id: 'm-tomas' },
  ]
  let n = 0
  const r = (
    client_id: string, kind: ClientRecord['kind'], content: string, created: string, opts: Partial<ClientRecord> = {},
  ): ClientRecord => {
    const confirmed = (opts.status ?? 'confirmado') === 'confirmado'
    return {
      id: `r-${++n}`, agency_id: agency.id, client_id, source_id: null, kind,
      status: 'confirmado', content, responsible_member_id: null, due_date: null, is_internal: false,
      external_task_url: null, created_by: 'm-diego',
      confirmed_by: confirmed ? (opts.created_by ?? 'm-diego') : null,
      confirmed_at: confirmed ? created : null,
      created_at: created, updated_at: created, deleted_at: null, deleted_by: null, ...opts,
    }
  }
  const records: ClientRecord[] = [
    // Café Altura
    r('c-cafe', 'consideracion', 'No usar fotos de stock. Todo el contenido visual debe salir de la sesión en la tostadora.', daysAgo(96)),
    r('c-cafe', 'consideracion', 'La dueña (Lucía) aprueba todo lo que se publica; el gerente no puede autorizar cambios.', daysAgo(96)),
    r('c-cafe', 'acuerdo', 'Paquete mensual: 12 publicaciones en Instagram y 4 reels. Presupuesto de pauta: $6,000 MXN al mes.', daysAgo(95)),
    r('c-cafe', 'consideracion', 'Paga a 45 días aunque el contrato dice 30. Facturar el día 1 para no atrasar la nómina.', daysAgo(80), { is_internal: true, created_by: 'm-mariana', confirmed_by: 'm-mariana' }),
    r('c-cafe', 'acuerdo', 'La campaña de temporada de lluvias arranca el 15 de junio con el lanzamiento del café de olla frío.', daysAgo(41)),
    r('c-cafe', 'consideracion', 'No mencionar precios en las publicaciones; cambian por sucursal.', daysAgo(41)),
    r('c-cafe', 'pendiente', 'Mandar propuesta de 3 conceptos para la campaña de diciembre.', daysAgo(9), { responsible_member_id: 'm-andres', due_date: dayOnly(3) }),
    r('c-cafe', 'acuerdo', 'Se sube a 4 publicaciones por semana durante noviembre y diciembre; el costo extra se cobra aparte.', daysAgo(9)),
    r('c-cafe', 'pendiente', 'Agendar sesión de fotos en la sucursal Centro antes del 30.', daysAgo(9), { responsible_member_id: 'm-tomas', due_date: dayOnly(12) }),
    r('c-cafe', 'acuerdo', 'Cambio de color en las historias: usar el verde olivo del empaque nuevo, no el café.', daysAgo(1, 16), { status: 'por_confirmar', created_by: 'm-valeria', confirmed_by: null, confirmed_at: null }),
    r('c-cafe', 'pendiente', 'Lucía pidió ver los textos de diciembre antes del viernes.', daysAgo(0, 10), { status: 'por_confirmar', created_by: 'm-andres', confirmed_by: null, confirmed_at: null, due_date: dayOnly(2) }),
    // Clínica Dental
    r('c-dental', 'acuerdo', 'Campaña de blanqueamiento con 20% de descuento durante octubre.', daysAgo(30)),
    r('c-dental', 'consideracion', 'Nunca mostrar fotos de pacientes reales sin su carta de consentimiento firmada.', daysAgo(60)),
    r('c-dental', 'pendiente', 'Actualizar horarios en Google Maps y en la web.', daysAgo(3), { responsible_member_id: 'm-valeria', due_date: dayOnly(-1), status: 'por_confirmar', created_by: 'm-valeria', confirmed_by: null, confirmed_at: null }),
    // Puerta Norte
    r('c-puerta', 'acuerdo', 'Tres recorridos virtuales al mes para desarrollos en preventa.', daysAgo(20), { created_by: 'm-sofia', confirmed_by: 'm-sofia' }),
    r('c-puerta', 'consideracion', 'El área legal revisa cualquier texto que mencione plazos de entrega.', daysAgo(20), { created_by: 'm-sofia', confirmed_by: 'm-sofia' }),
    // La Espiga
    r('c-espiga', 'acuerdo', 'Rosca de reyes: preventa en línea a partir del 15 de diciembre.', daysAgo(5), { created_by: 'm-sofia', confirmed_by: 'm-sofia' }),
    // Pulso
    r('c-pulso', 'pendiente', 'Enviar reporte de resultados de septiembre.', daysAgo(12), { responsible_member_id: 'm-diego', due_date: dayOnly(-4) }),
  ]
  const history = [
    {
      id: 1, record_id: 'r-3', changed_at: daysAgo(60), changed_by: 'm-diego',
      old_values: { content: 'Paquete mensual: 10 publicaciones en Instagram y 4 reels.' },
      new_values: { content: records[2].content },
    },
  ]
  return { agency, members, clients, assignments, records, history, invitations: [], seq: 1000 }
}

function store(): Store {
  if (!g.__demoStore) g.__demoStore = seed()
  return g.__demoStore
}

async function currentMember(): Promise<Member> {
  const s = store()
  const id = (await cookies()).get(DEMO_COOKIE)?.value ?? 'm-diego'
  return s.members.find((m) => m.id === id) ?? s.members[1]
}

function canView(me: Member, client: Client, s: Store) {
  if (me.role === 'admin') return true
  if (client.archived_at) return false
  return (
    client.owner_member_id === me.id ||
    client.backup_member_id === me.id ||
    s.assignments.some((a) => a.client_id === client.id && a.member_id === me.id)
  )
}

function assigned(s: Store, clientId: string) {
  return s.assignments.filter((a) => a.client_id === clientId).map((a) => a.member_id)
}

function visibleRecords(me: Member, s: Store) {
  return s.records.filter((r) => {
    const c = s.clients.find((x) => x.id === r.client_id)!
    return canView(me, c, s) && !r.deleted_at && !(r.is_internal && me.role === 'externo')
  })
}

function now() {
  return new Date().toISOString()
}

function logHistory(s: Store, me: Member, rec: ClientRecord, patch: Partial<ClientRecord>) {
  const old: Record<string, unknown> = {}
  const neu: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    const before = rec[k as keyof ClientRecord]
    if (before !== v) {
      old[k] = before
      neu[k] = v
    }
  }
  if (Object.keys(neu).length) {
    s.history.push({ id: ++s.seq, record_id: rec.id, changed_at: now(), changed_by: me.id, old_values: old, new_values: neu })
  }
}

export const demoRepo: Repo = {
  async hasSession() {
    return true
  },

  async getContext() {
    const s = store()
    const me = await currentMember()
    return { userEmail: me.email ?? '', agency: s.agency, me, members: s.members, demo: true }
  },

  async listClients(): Promise<ClientSummary[]> {
    const s = store()
    const me = await currentMember()
    const recs = visibleRecords(me, s)
    return s.clients
      .filter((c) => !c.archived_at && canView(me, c, s))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((c) => {
        const mine = recs.filter((r) => r.client_id === c.id)
        return {
          ...c,
          record_count: mine.length,
          pending_count: mine.filter((r) => r.status === 'por_confirmar').length,
          last_activity: mine.reduce<string | null>((a, r) => (!a || r.updated_at > a ? r.updated_at : a), null),
        }
      })
  },

  async getClient(id) {
    const s = store()
    const me = await currentMember()
    const c = s.clients.find((x) => x.id === id)
    return c && canView(me, c, s) ? c : null
  },

  async listAssignments(clientId) {
    return assigned(store(), clientId)
  },

  async listRecords(clientId) {
    const s = store()
    const me = await currentMember()
    return visibleRecords(me, s)
      .filter((r) => r.client_id === clientId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
  },

  async getHistory(recordId) {
    return store()
      .history.filter((h) => h.record_id === recordId)
      .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
  },

  async listPending(): Promise<PendingRecord[]> {
    const s = store()
    const me = await currentMember()
    return visibleRecords(me, s)
      .filter((r) => r.status === 'por_confirmar')
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((r) => ({ ...r, client_name: s.clients.find((c) => c.id === r.client_id)!.name }))
  },

  async listInvitations() {
    return store().invitations.filter((i) => !i.accepted_at)
  },

  async createAgency() {
    throw new Error('En el modo demo la agencia ya existe')
  },

  async acceptInvitations() {
    return 0
  },

  async createClient(input) {
    const s = store()
    const me = await currentMember()
    if (me.role !== 'admin' && me.role !== 'ejecutivo') throw new Error('No tienes permiso para crear clientes')
    const owner = me.role === 'ejecutivo' && !input.owner_member_id ? me.id : input.owner_member_id
    const id = `c-${++s.seq}`
    s.clients.push({
      id, agency_id: s.agency.id, name: input.name, owner_member_id: owner,
      backup_member_id: input.backup_member_id, archived_at: null, created_by: me.id, created_at: now(),
    })
    return id
  },

  async createRecord({ confirmed, ...input }) {
    const s = store()
    const me = await currentMember()
    const client = s.clients.find((c) => c.id === input.client_id)
    if (!client || !canContributeClient(me, client, assigned(s, client.id))) {
      throw new Error('No tienes permiso para registrar información en este cliente')
    }
    const isConfirmed = confirmed && recordsStartConfirmed(me)
    s.records.push({
      ...input, id: `r-${++s.seq}`, agency_id: s.agency.id, source_id: null,
      status: isConfirmed ? 'confirmado' : 'por_confirmar', external_task_url: null,
      created_by: me.id, confirmed_by: isConfirmed ? me.id : null, confirmed_at: isConfirmed ? now() : null,
      created_at: now(), updated_at: now(), deleted_at: null, deleted_by: null,
    })
  },

  async updateRecord(id, patch) {
    const s = store()
    const me = await currentMember()
    const rec = s.records.find((r) => r.id === id)
    const client = rec && s.clients.find((c) => c.id === rec.client_id)
    if (!rec || !client || !canManageClient(me, client)) throw new Error('No tienes permiso para editar este registro')
    logHistory(s, me, rec, patch)
    Object.assign(rec, patch, { updated_at: now() })
  },

  async confirmRecords(ids) {
    const s = store()
    const me = await currentMember()
    let count = 0
    for (const rec of s.records.filter((r) => ids.includes(r.id) && r.status === 'por_confirmar')) {
      const client = s.clients.find((c) => c.id === rec.client_id)!
      if (!canManageClient(me, client)) continue
      logHistory(s, me, rec, { status: 'confirmado' })
      Object.assign(rec, { status: 'confirmado', confirmed_by: me.id, confirmed_at: now(), updated_at: now() })
      count++
    }
    return count
  },

  async deleteRecord(id) {
    const s = store()
    const me = await currentMember()
    if (me.role !== 'admin') throw new Error('Solo un administrador puede eliminar registros')
    const rec = s.records.find((r) => r.id === id)
    if (rec) Object.assign(rec, { deleted_at: now(), deleted_by: me.id })
  },

  async setAssignments(clientId, memberIds) {
    const s = store()
    const me = await currentMember()
    const client = s.clients.find((c) => c.id === clientId)
    if (!client || !canManageClient(me, client)) throw new Error('No tienes permiso para cambiar el equipo de este cliente')
    s.assignments = s.assignments.filter((a) => a.client_id !== clientId)
    memberIds.forEach((member_id) => s.assignments.push({ client_id: clientId, member_id }))
  },

  async inviteMember(input) {
    const s = store()
    const me = await currentMember()
    if (me.role !== 'admin') throw new Error('Solo un administrador puede invitar personas')
    s.invitations.unshift({
      id: `i-${++s.seq}`, agency_id: s.agency.id, email: input.email.toLowerCase(), role: input.role,
      full_name: input.full_name, access_expires_at: null, invited_by: me.id, accepted_at: null, created_at: now(),
    })
  },

  async setMemberActive(memberId, active) {
    const s = store()
    const me = await currentMember()
    if (me.role !== 'admin') throw new Error('Solo un administrador puede desactivar personas')
    const target = s.members.find((m) => m.id === memberId)
    if (!target) return
    if (!active && target.role === 'admin' && s.members.filter((m) => m.role === 'admin' && m.active).length <= 1) {
      throw new Error('La agencia debe conservar al menos un administrador activo')
    }
    target.active = active
  },
}
