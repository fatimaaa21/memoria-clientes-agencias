import { notFound } from 'next/navigation'
import { repo } from '@/lib/data'
import { canContributeClient, canManageClient, isAdmin } from '@/lib/permissions'
import { ClientDossier } from '@/components/ClientDossier'

export default async function ProyectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = repo()
  const [ctx, project] = await Promise.all([r.getContext(), r.getProject(id)])
  if (!ctx || !project) notFound()
  const [client, records, assigned, allProjects] = await Promise.all([
    r.getClient(project.client_id),
    r.listRecords(project.client_id),
    r.listAssignments(project.client_id),
    r.listProjects(),
  ])
  if (!client) notFound()

  return (
    <ClientDossier
      client={client}
      project={project}
      projects={allProjects.filter((p) => p.client_id === client.id)}
      records={records}
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
  const project = await repo().getProject(id)
  return { title: project ? `${project.name} · Memoria` : 'Memoria' }
}
