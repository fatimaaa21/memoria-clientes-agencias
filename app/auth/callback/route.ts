import { NextResponse, type NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/data/supabase'

// Destino del enlace mágico: canjea el código por una sesión.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (code) {
    const sb = await supabaseServer()
    const { error } = await sb.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL('/', url.origin))
  }
  return NextResponse.redirect(new URL('/login?error=enlace', url.origin))
}
