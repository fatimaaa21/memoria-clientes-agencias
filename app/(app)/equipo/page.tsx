import { repo } from '@/lib/data'
import { isAdmin } from '@/lib/permissions'
import { TeamView } from '@/components/TeamView'

export const metadata = { title: 'Equipo · Memoria' }

export default async function EquipoPage() {
  const r = repo()
  const ctx = await r.getContext()
  if (!ctx) return null
  const admin = isAdmin(ctx.me)
  const invitations = admin ? await r.listInvitations() : []
  return <TeamView members={ctx.members} me={ctx.me} admin={admin} invitations={invitations} demo={ctx.demo} />
}
