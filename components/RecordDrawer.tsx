'use client'

import { useEffect, useState, useTransition } from 'react'
import { Check, Trash2 } from 'lucide-react'
import type { ClientRecord, HistoryEntry, Member, Project } from '@/lib/types'
import { KIND_LABEL } from '@/lib/types'
import { fmtDateTime, fmtDayLong, fmtDue } from '@/lib/format'
import { Avatar, Drawer, KindTag, MemberSelect, StatusMarker, toast } from './ui'
import { confirmRecordsAction, deleteRecordAction, getHistoryAction, updateRecordAction } from '@/app/actions'
import type { Perms } from './ClientDossier'
import { ProjectSelect } from './QuickRecordDrawer'

const FIELD_LABEL: Record<string, string> = {
  content: 'Texto', kind: 'Tipo', status: 'Estado', responsible_member_id: 'Responsable',
  due_date: 'Fecha', is_internal: 'Solo para el equipo', deleted_at: 'Eliminado', project_id: 'Proyecto',
}

export function RecordDrawer({
  record, onClose, members, perms, clientName, projects,
}: { record: ClientRecord | null; onClose: () => void; members: Member[]; perms: Perms; clientName: string; projects: Project[] }) {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const byId = new Map(members.map((m) => [m.id, m]))

  useEffect(() => {
    setEditing(false)
    setError('')
    setHistory([])
    if (record && perms.manage) getHistoryAction(record.id).then(setHistory)
  }, [record?.id, record?.updated_at, perms.manage]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!record) return null
  const author = record.created_by ? byId.get(record.created_by) : null
  const confirmer = record.confirmed_by ? byId.get(record.confirmed_by) : null
  const resp = record.responsible_member_id ? byId.get(record.responsible_member_id) : null
  const due = record.due_date ? fmtDue(record.due_date) : null
  const project = record.project_id ? projects.find((p) => p.id === record.project_id) : null

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, close = false) =>
    start(async () => {
      setError('')
      const res = await fn()
      if (!res.ok) return setError(res.error ?? 'No se pudo guardar.')
      if (res.message) toast(res.message)
      setEditing(false)
      if (close) onClose()
    })

  const footer = perms.manage ? (
    editing ? (
      <>
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancelar</button>
        <button type="submit" form="edit-record" className="btn btn-primary" disabled={pending}>Guardar cambios</button>
      </>
    ) : (
      <>
        {perms.admin && (
          <button
            type="button" className="btn btn-ghost btn-danger" disabled={pending}
            onClick={() => { if (window.confirm('¿Eliminar este registro? El administrador puede restaurarlo después.')) act(() => deleteRecordAction(record.id), true) }}
          >
            <Trash2 size={15} aria-hidden /> Eliminar
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>Editar</button>
        {record.status === 'por_confirmar' && (
          <button type="button" className="btn btn-primary" disabled={pending} onClick={() => act(() => confirmRecordsAction([record.id]))}>
            <Check size={15} aria-hidden /> Confirmar
          </button>
        )}
      </>
    )
  ) : undefined

  return (
    <Drawer
      open onClose={onClose}
      title={<span className="drawer-title-row"><StatusMarker kind={record.kind} status={record.status} /> {KIND_LABEL[record.kind]}</span>}
      subtitle={clientName}
      footer={footer}
    >
      {editing ? (
        <form id="edit-record" action={(f) => act(() => updateRecordAction(record.id, f))} className="stack-16">
          <label className="field">
            <span className="field-label">Tipo</span>
            <select className="input" name="kind" defaultValue={record.kind}>
              {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Qué quedó</span>
            <textarea className="input textarea" name="content" defaultValue={record.content} rows={5} required maxLength={4000} data-autofocus />
          </label>
          {projects.length > 0 ? (
            <label className="field">
              <span className="field-label">Proyecto</span>
              <ProjectSelect projects={projects} defaultValue={record.project_id} />
            </label>
          ) : (
            <input type="hidden" name="project_id" value={record.project_id ?? ''} />
          )}
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Responsable</span>
              <MemberSelect name="responsible" members={members} defaultValue={record.responsible_member_id} />
            </label>
            <label className="field">
              <span className="field-label">Fecha</span>
              <input className="input" type="date" name="due_date" defaultValue={record.due_date ?? ''} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="is_internal" defaultChecked={record.is_internal} />
            <span>Solo para el equipo</span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
        </form>
      ) : (
        <div className="stack-24">
          <p className="record-text">{record.content}</p>

          <dl className="props props-stack">
            <div className="prop"><dt>Tipo</dt><dd><KindTag kind={record.kind} /></dd></div>
            <div className="prop"><dt>Proyecto</dt><dd>{project ? project.name : <span className="muted">Todo el cliente</span>}</dd></div>
            <div className="prop">
              <dt>Estado</dt>
              <dd>
                {record.status === 'confirmado'
                  ? <>Confirmado{confirmer ? ` por ${confirmer.full_name}` : ''}{record.confirmed_at ? `, ${fmtDateTime(record.confirmed_at)}` : ''}</>
                  : <span className="meta-pending">Por confirmar</span>}
              </dd>
            </div>
            <div className="prop"><dt>Responsable</dt><dd>{resp ? <><Avatar member={resp} /> {resp.full_name}</> : <span className="muted">Sin asignar</span>}</dd></div>
            {due && <div className="prop"><dt>Fecha</dt><dd className={due.overdue ? 'due-late' : ''}>{due.label}</dd></div>}
            {record.is_internal && <div className="prop"><dt>Visibilidad</dt><dd>Solo para el equipo</dd></div>}
            <div className="prop"><dt>Registró</dt><dd>{author?.full_name ?? 'Alguien del equipo'}, {fmtDayLong(record.created_at)}</dd></div>
          </dl>

          {record.status === 'por_confirmar' && !perms.manage && (
            <p className="note">El responsable del cliente debe confirmarlo antes de que cuente como acuerdo vigente.</p>
          )}

          {perms.manage && (
            <section>
              <h3 className="section-title">Historial</h3>
              {history.length === 0 ? (
                <p className="muted small">Sin cambios desde que se registró.</p>
              ) : (
                <ol className="history">
                  {history.map((h) => (
                    <li key={h.id}>
                      <p className="small">
                        <strong>{(h.changed_by && byId.get(h.changed_by)?.full_name) || 'Alguien'}</strong>
                        {' '}cambió {Object.keys(h.new_values ?? {}).map((k) => FIELD_LABEL[k] ?? k).join(', ').toLowerCase()}
                        <span className="muted">, {fmtDateTime(h.changed_at)}</span>
                      </p>
                      {typeof h.old_values?.content === 'string' && (
                        <p className="history-old">{h.old_values.content}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      )}
    </Drawer>
  )
}
