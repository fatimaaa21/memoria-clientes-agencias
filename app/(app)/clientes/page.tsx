import { repo } from '@/lib/data'
import { canCreateClients } from '@/lib/permissions'
import { ClientsView } from '@/components/ClientsView'

export const metadata = { title: 'Clientes · Memoria' }

export default async function ClientesPage() {
  const r = repo()
  const [ctx, clients] = await Promise.all([r.getContext(), r.listClients()])
  if (!ctx) return null
  return <ClientsView clients={clients} members={ctx.members} me={ctx.me} canCreate={canCreateClients(ctx.me)} />
}
