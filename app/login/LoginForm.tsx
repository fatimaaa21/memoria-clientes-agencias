'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'

export function LoginForm({ linkError }: { linkError: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(linkError ? 'El enlace venció o ya se usó. Pide uno nuevo.' : '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const sb = supabaseBrowser()
    if (mode === 'link') {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) setError(error.message.includes('rate') ? 'Se enviaron demasiados enlaces. Espera unos minutos e inténtalo de nuevo.' : error.message)
      else setSent(true)
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) setError('El correo o la contraseña no coinciden.')
      else router.replace('/')
    }
    setBusy(false)
  }

  if (sent) {
    return (
      <div className="auth-note" role="status">
        <p className="auth-note-title">Revisa tu correo</p>
        <p>Te enviamos un enlace a <strong>{email}</strong>. Ábrelo para entrar; si no lo ves, revisa spam.</p>
        <button className="btn-link" onClick={() => setSent(false)}>Usar otro correo</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="stack-16">
      <label className="field">
        <span className="field-label">Correo de trabajo</span>
        <input className="input" type="email" required autoComplete="email" autoFocus
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@agencia.mx" />
      </label>
      {mode === 'password' && (
        <label className="field">
          <span className="field-label">Contraseña</span>
          <input className="input" type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-primary btn-block" disabled={busy}>
        {busy ? 'Un momento…' : mode === 'link' ? 'Enviarme un enlace para entrar' : 'Entrar'}
      </button>
      <button type="button" className="btn-link" onClick={() => { setMode(mode === 'link' ? 'password' : 'link'); setError('') }}>
        {mode === 'link' ? 'Prefiero usar contraseña' : 'Prefiero recibir un enlace por correo'}
      </button>
    </form>
  )
}
