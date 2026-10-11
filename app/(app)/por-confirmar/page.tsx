import { repo } from '@/lib/data'
import { canManageClient, isAdmin } from '@/lib/permissions'
import { PendingQueue } from '@/components/PendingQueue'

export const metadata = { title: 'Por confirmar · Memoria' }

export default async function PorConfirmarPage() {
  const r = repo()
  const [ctx, clients, pending, projects] = await Promise.all([r.getContext(), r.listClients(), r.listPending(), r.listProjects()])
  if (!ctx) return null
  const byId = new Map(clients.map((c) => [c.id, c]))
  // Solo lo que esta persona puede confirmar
  const mine = pending.filter((p) => {
    const c = byId.get(p.client_id)
    return c && canManageClient(ctx.me, c)
  })
  return <PendingQueue records={mine} projects={projects} members={ctx.members} admin={isAdmin(ctx.me)} canConfirm={ctx.me.role === 'admin' || ctx.me.role === 'ejecutivo'} />
}
