import 'server-only'
import type { Repo } from './repo'
import { demoRepo } from './demo'
import { supabaseRepo } from './supabase'

export const isDemo = () => process.env.DEMO_MODE === '1'

export function repo(): Repo {
  return isDemo() ? demoRepo : supabaseRepo
}
