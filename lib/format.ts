const TZ = 'America/Mexico_City'

export function fmtDay(iso: string) {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(iso))
}

export function fmtDayLong(iso: string) {
  return new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date(iso))
}

export function fmtMonth(iso: string) {
  const s = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: TZ }).format(new Date(iso))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ,
  }).format(new Date(iso))
}

/** Fecha de vencimiento (YYYY-MM-DD) en texto corto y si ya pasó. */
export function fmtDue(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const due = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
  const label =
    diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : diff === -1 ? 'Ayer'
      : new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(due)
  return { label, overdue: diff < 0, soon: diff >= 0 && diff <= 2 }
}

export function relative(iso: string | null) {
  if (!iso) return 'Sin actividad'
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 60) return 'Hace un momento'
  const h = Math.round(diffMin / 60)
  if (h < 24) return `Hace ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return 'Ayer'
  if (d < 30) return `Hace ${d} días`
  return fmtDay(iso)
}

export function initials(name: string | null | undefined) {
  if (!name) return '·'
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('')
}

const SWATCHES = ['sage', 'clay', 'sky', 'plum', 'sand', 'moss'] as const
export function swatch(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return SWATCHES[h % SWATCHES.length]
}
