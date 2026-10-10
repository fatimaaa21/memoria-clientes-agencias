import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabaseServer } from '@/lib/data/supabase'

// Destino de los enlaces de correo (entrar e invitaciones).
// Valida el token del correo y crea la sesión, sin importar en qué navegador se abra.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const token_hash = url.searchParams.get('token_hash')
  const type = (url.searchParams.get('type') ?? 'email') as EmailOtpType
  if (token_hash) {
    const sb = await supabaseServer()
    const { error } = await sb.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(new URL('/', url.origin))
  }
  return NextResponse.redirect(new URL('/login?error=enlace', url.origin))
}
