import { notFound } from 'next/navigation'
import { repo } from '@/lib/data'
import { canContributeClient, canManageClient, isAdmin } from '@/lib/permissions'
import { ClientDossier } from '@/components/ClientDossier'

export default async function ExpedientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = repo()
  const [ctx, client] = await Promise.all([r.getContext(), r.getClient(id)])
  if (!ctx || !client) notFound()
  const [records, assigned, allProjects] = await Promise.all([r.listRecords(id), r.listAssignments(id), r.listProjects()])
  const projects = allProjects.filter((p) => p.client_id === id)

  return (
    <ClientDossier
      client={client}
      records={records}
      projects={projects}
      assigned={assigned}
      members={ctx.members}
      me={ctx.me}
      perms={{
        manage: canManageClient(ctx.me, client),
        contribute: canContributeClient(ctx.me, client, assigned),
        admin: isAdmin(ctx.me),
      }}
    />
  )
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const client = await repo().getClient(id)
  return { title: client ? `${client.name} · Memoria` : 'Memoria' }
}
