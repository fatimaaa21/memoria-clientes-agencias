import { redirect } from 'next/navigation'
import { repo } from '@/lib/data'
import { canManageClient } from '@/lib/permissions'
import { Sidebar } from '@/components/Sidebar'
import { Toaster } from '@/components/ui'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const r = repo()
  if (!(await r.hasSession())) redirect('/login')
  const ctx = await r.getContext()
  if (!ctx) redirect('/bienvenida')

  const [clients, pending, projects] = await Promise.all([r.listClients(), r.listPending(), r.listProjects()])
  const byId = new Map(clients.map((c) => [c.id, c]))
  const myPending = pending.filter((p) => {
    const c = byId.get(p.client_id)
    return c && canManageClient(ctx.me, c)
  }).length

  return (
    <div className="shell">
      <Sidebar
        ctx={ctx}
        projects={projects}
        manageableClients={clients.filter((c) => canManageClient(ctx.me, c))}
        pendingCount={myPending}
      />
      <div className="main">{children}</div>
      <Toaster />
    </div>
  )
}
