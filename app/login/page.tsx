import Link from 'next/link'
import { isDemo } from '@/lib/data'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Entrar · Memoria' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand-mark" aria-hidden>M</div>
        <h1 className="auth-title">Entra a la memoria de tus clientes</h1>
        <p className="auth-sub">Acuerdos, consideraciones y pendientes de cada cliente, en un solo lugar.</p>
        {isDemo() ? (
          <Link href="/clientes" className="btn btn-primary btn-block">Entrar al demo</Link>
        ) : (
          <LoginForm linkError={error === 'enlace'} />
        )}
      </div>
    </main>
  )
}
