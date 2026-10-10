import { redirect } from 'next/navigation'
import { repo } from '@/lib/data'
import { CreateAgencyForm } from './CreateAgencyForm'

export const metadata = { title: 'Bienvenida · Memoria' }

export default async function Bienvenida() {
  const r = repo()
  if (!(await r.hasSession())) redirect('/login')
  if (await r.getContext()) redirect('/clientes')
  // Si alguien la invitó, entra directo a esa agencia
  if ((await r.acceptInvitations()) > 0) redirect('/clientes')

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand-mark" aria-hidden>M</div>
        <h1 className="auth-title">Crea el espacio de tu agencia</h1>
        <p className="auth-sub">
          Quedarás como administrador y podrás invitar a tu equipo. Si te invitaron a una agencia,
          pide que revisen que la invitación sea para este correo.
        </p>
        <CreateAgencyForm />
      </div>
    </main>
  )
}
