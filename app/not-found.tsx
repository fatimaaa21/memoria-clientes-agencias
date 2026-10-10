import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="auth">
      <div className="auth-card">
        <h1 className="auth-title">No encontramos esta página</h1>
        <p className="auth-sub">Puede que el cliente no exista o que no tengas acceso a él.</p>
        <Link href="/clientes" className="btn btn-primary btn-block">Ir a clientes</Link>
      </div>
    </main>
  )
}
