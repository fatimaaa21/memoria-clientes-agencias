import { NextResponse, type NextRequest } from 'next/server'
import { supabaseServer } from '@/lib/data/supabase'

export async function POST(request: NextRequest) {
  if (process.env.DEMO_MODE !== '1') {
    const sb = await supabaseServer()
    await sb.auth.signOut()
  }
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
