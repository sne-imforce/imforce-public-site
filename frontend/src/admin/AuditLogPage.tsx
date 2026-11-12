import { useEffect, useState } from 'react'
import { FiRefreshCw } from 'react-icons/fi'
import { getStaffAudit, type StaffAuditEntry } from '../data/api'
import DataTable, { type Column, type Filter } from './DataTable'
import { LoadingBlock } from '../components/ui/Spinner'

const actionLabels: Record<string, string> = {
  'staff.login': 'Signed in',
  'staff.logout': 'Signed out',
  'enquiries.view': 'Viewed enquiries',
  'vacancy.create': 'Created job post',
  'vacancy.update': 'Updated job post',
  'vacancy.delete': 'Deleted job post',
  'advert.approve': 'Approved advert',
  'advert.request_changes': 'Requested advert changes',
  'advert.reject': 'Rejected advert',
  'advert.reopen': 'Moved advert back to review',
  'device.trust': 'Remembered a device',
  'device.forget': 'Forgot remembered device',
}

const actionTone: Record<string, string> = {
  'vacancy.create': 'success',
  'vacancy.update': 'info',
  'vacancy.delete': 'danger',
  'advert.approve': 'success',
  'advert.request_changes': 'warning',
  'advert.reject': 'danger',
  'advert.reopen': 'info',
}

const formatWhen = (value: string) => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

type Row = StaffAuditEntry & { rowKey: string }

// Agent name for new entries; email for entries recorded before names existed.
const actorLabel = (entry: StaffAuditEntry) => entry.actor_name || entry.actor_email || 'Unknown'

const itemText = (entry: StaffAuditEntry) => (typeof entry.detail?.title === 'string' ? entry.detail.title : '')
const detailText = (entry: StaffAuditEntry) => {
  const changed = entry.detail?.changedFields
  if (Array.isArray(changed)) return changed.length ? `Changed: ${changed.map((field) => String(field).replace(/_/g, ' ')).join(', ')}` : 'No changes'
  if (typeof entry.detail?.count === 'number') return `${entry.detail.count} enquiries`
  if (entry.detail?.mfa === true) return 'With two-step sign-in'
  if (typeof entry.detail?.client === 'string') return `Client: ${entry.detail.client}`
  const parts: string[] = []
  if (typeof entry.detail?.company === 'string') parts.push(`Employer: ${entry.detail.company}`)
  if (typeof entry.detail?.reason === 'string') parts.push(`Reason: ${entry.detail.reason}`)
  if (typeof entry.detail?.device === 'string') parts.push(entry.detail.device)
  if (entry.detail?.scope === 'all') parts.push('All devices')
  if (entry.detail?.mfa === 'remembered-device') parts.push('From a remembered device')
  return parts.join(' · ')
}

/** /admin/audit — who did what, and when. */
export default function AuditLogPage() {
  const [entries, setEntries] = useState<Row[] | null>(null)
  const [error, setError] = useState('')

  const fetchEntries = () => getStaffAudit().then(
    (result) => ({ rows: result.entries.map((entry, index) => ({ ...entry, rowKey: `${entry.occurred_at}-${index}` })), error: '' }),
    (cause: unknown) => ({ rows: null, error: cause instanceof Error ? cause.message : 'The audit log could not be loaded.' }),
  )
  const apply = ({ rows, error: message }: { rows: Row[] | null; error: string }) => {
    setError(message)
    setEntries((current) => rows ?? current ?? [])
  }
  const load = () => { void fetchEntries().then(apply) }

  useEffect(() => {
    let active = true
    void fetchEntries().then((result) => { if (active) apply(result) })
    return () => { active = false }
  }, [])

  const rows = entries ?? []
  const staffOptions = [...new Set(rows.map(actorLabel).filter((name) => name !== 'Unknown'))]
    .sort().map((name) => ({ value: name, label: name }))

  const columns: Array<Column<Row>> = [
    { key: 'when', header: 'When', sortValue: (row) => Date.parse(row.occurred_at) || 0, render: (row) => <time dateTime={row.occurred_at}>{formatWhen(row.occurred_at)}</time> },
    {
      key: 'who', header: 'Staff member', sortValue: (row) => actorLabel(row),
      render: (row) => <><span className="admin-cell__title">{actorLabel(row)}</span>{row.actor_name && row.actor_email && <span className="admin-cell__sub">{row.actor_email}</span>}</>,
    },
    {
      key: 'action', header: 'Action', sortValue: (row) => actionLabels[row.action] ?? row.action,
      render: (row) => <span className={`admin-badge${actionTone[row.action] ? ` admin-badge--${actionTone[row.action]}` : ''}`}>{actionLabels[row.action] ?? row.action}</span>,
    },
    { key: 'item', header: 'Item', sortValue: (row) => itemText(row), render: (row) => itemText(row) || <span className="admin-cell__sub">—</span> },
    { key: 'detail', header: 'Details', render: (row) => <span className="admin-cell__sub admin-cell__wrap">{detailText(row)}</span> },
  ]

  const filters: Array<Filter<Row>> = [
    { id: 'action', label: 'Action', options: Object.entries(actionLabels).map(([value, label]) => ({ value, label })), matches: (row, value) => row.action === value },
    { id: 'who', label: 'Staff member', options: staffOptions, matches: (row, value) => actorLabel(row) === value },
  ]

  return (
    <div className="admin-page">
      <div className="admin-page__heading">
        <div>
          <h1>Audit log</h1>
          <p>A permanent record of staff actions. Entries cannot be edited or deleted.</p>
        </div>
        <button type="button" className="admin__button" onClick={load}>
          <FiRefreshCw aria-hidden="true" /> Refresh
        </button>
      </div>

      <section className="admin-card" aria-label="Audit log entries">
        {error && <p className="staff-access-error" role="alert">{error}</p>}
        {entries === null ? (
          <LoadingBlock label="Loading the audit log…" />
        ) : (
          <DataTable
            label="Audit log"
            rows={rows}
            columns={columns}
            rowId={(row) => row.rowKey}
            searchText={(row) => [row.actor_name, row.actor_email, actionLabels[row.action], itemText(row), detailText(row)].join(' ')}
            searchPlaceholder="Search staff, action, job post…"
            filters={filters}
            initialSort={{ key: 'when', direction: 'desc' }}
            emptyMessage="No staff activity has been recorded yet."
          />
        )}
        <p className="admin-footnote">Shows the most recent 500 entries. Older entries remain in the database (table <code>staff_audit_log</code>).</p>
      </section>
    </div>
  )
}
