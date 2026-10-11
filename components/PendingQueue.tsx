'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { Check, FolderOpen } from 'lucide-react'
import type { Member, PendingRecord, Project } from '@/lib/types'
import { relative, swatch } from '@/lib/format'
import { Avatar, KindTag, StatusMarker, toast } from './ui'
import { RecordDrawer } from './RecordDrawer'
import { confirmRecordsAction } from '@/app/actions'

export function PendingQueue({
  records, projects, members, admin, canConfirm,
}: { records: PendingRecord[]; projects: Project[]; members: Member[]; admin: boolean; canConfirm: boolean }) {
  const [sel, setSel] = useState<string[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  const groups = useMemo(() => {
    const map = new Map<string, PendingRecord[]>()
    for (const r of records) map.set(r.client_id, [...(map.get(r.client_id) ?? []), r])
    return [...map.values()]
  }, [records])

  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const allOn = sel.length === records.length && records.length > 0

  function confirm(ids: string[]) {
    start(async () => {
      const res = await confirmRecordsAction(ids)
      if (!res.ok) return toast(res.error, 'error')
      toast(res.message ?? 'Confirmado')
      setSel([])
    })
  }

  const open = records.find((r) => r.id === openId) ?? null

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Por confirmar</h1>
          <p className="page-sub">
            {canConfirm
              ? 'Lo que registró tu equipo o propuso alguien más y todavía no validas. Confirma lo que es correcto; abre lo demás para corregirlo.'
              : 'Aquí aparece lo que te toca validar. Con tu rol, lo que registras lo confirma el responsable del cliente.'}
          </p>
        </div>
        {records.length > 0 && (
          <button className="btn btn-primary" disabled={!sel.length || pending} onClick={() => confirm(sel)}>
            <Check size={16} aria-hidden /> {sel.length ? `Confirmar ${sel.length}` : 'Confirmar'}
          </button>
        )}
      </header>

      {records.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Nada por confirmar</p>
          <p className="empty-text">Cuando alguien registre un acuerdo en tus clientes, aparecerá aquí para que lo valides.</p>
        </div>
      ) : (
        <>
          <label className="check select-all">
            <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : records.map((r) => r.id))} />
            Seleccionar todo ({records.length})
          </label>
          <div className="queue">
            {groups.map((items) => (
              <section key={items[0].client_id} className="queue-group" aria-label={items[0].client_name}>
                <Link href={`/clientes/${items[0].client_id}`} className="queue-client">
                  <span className={`swatch swatch-${swatch(items[0].client_id)}`} aria-hidden>{items[0].client_name.charAt(0)}</span>
                  {items[0].client_name}
                </Link>
                <ul>
                  {items.map((r) => {
                    const author = r.created_by ? byId.get(r.created_by) : null
                    const proj = r.project_id ? projects.find((p) => p.id === r.project_id) : null
                    return (
                      <li key={r.id} className="queue-row">
                        <input type="checkbox" aria-label="Seleccionar" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />
                        <button className="queue-main" onClick={() => setOpenId(r.id)}>
                          <StatusMarker kind={r.kind} status={r.status} />
                          <span className="tl-body">
                            <span className="tl-text">{r.content}</span>
                            <span className="tl-meta">
                              <KindTag kind={r.kind} />
                              {proj && <span className="meta-project"><FolderOpen size={12} aria-hidden /> {proj.name}</span>}
                              {author && <span className="meta-person"><Avatar member={author} size={18} /> Registró {author.full_name}</span>}
                              <span className="muted">{relative(r.created_at)}</span>
                            </span>
                          </span>
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => confirm([r.id])}>Confirmar</button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <RecordDrawer
        record={open} onClose={() => setOpenId(null)} members={members}
        perms={{ manage: true, contribute: true, admin }} clientName={open?.client_name ?? ''}
        projects={open ? projects.filter((p) => p.client_id === open.client_id) : []}
      />
    </div>
  )
}
