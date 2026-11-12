import { useMemo, useState } from 'react'
import { FiCheckCircle, FiEdit3, FiRefreshCw, FiRotateCcw, FiXCircle } from 'react-icons/fi'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { reviewJobOrder, type ReviewDecision, type StaffInquiry } from '../data/api'
import { formatDateDmy } from '../utils/dates'
import ConfirmDialog from './ConfirmDialog'
import DataTable, { type Column, type Filter } from './DataTable'
import EnquiryDetails from './EnquiryDetails'
import { useAdmin } from './adminContext'
import { jobOrderReference, paymentBadge, paymentState, reviewBadge, reviewState, time, type ReviewState } from './jobOrders'

type Row = { id: string; reference: string; company: string; email: string; role: string; location: string; received: string; state: ReviewState; order: StaffInquiry }

const toRow = (order: StaffInquiry): Row => {
  const details = order.details ?? {}
  return {
    id: order.id,
    reference: jobOrderReference(order.id),
    company: String(details.legalName ?? ''),
    email: String(details.email ?? ''),
    role: String(details.jobTitle ?? 'Job order'),
    location: String(details.jobLocation ?? ''),
    received: order.created_at,
    state: reviewState(order),
    order,
  }
}

type PendingDecision = { row: Row; decision: Exclude<ReviewDecision, 'approve'> }
const decisionCopy: Record<PendingDecision['decision'], { title: string; confirm: string; busy: string; needsReason: boolean; tone: 'danger' | 'neutral' }> = {
  changes: { title: 'Request changes to this advert?', confirm: 'Request changes', busy: 'Saving…', needsReason: true, tone: 'neutral' },
  reject: { title: 'Reject this advert?', confirm: 'Reject advert', busy: 'Rejecting…', needsReason: true, tone: 'danger' },
  reopen: { title: 'Move this job order back to review?', confirm: 'Move back to review', busy: 'Saving…', needsReason: false, tone: 'neutral' },
}

/** /admin/review: approve employer adverts before they go online. */
export default function ReviewPage() {
  const { inquiries, inquiriesError, reloadInquiries, notify } = useAdmin()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const linkedId = searchParams.get('order') ?? ''
  const rows = useMemo(() => inquiries.filter((item) => item.kind === 'employer').map(toRow), [inquiries])
  const linkedRow = linkedId ? rows.find((row) => row.id === linkedId) : undefined
  const awaiting = rows.filter((row) => row.state === 'awaiting-review').length

  const [pending, setPending] = useState<PendingDecision | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const ask = (row: Row, decision: PendingDecision['decision']) => { setPending({ row, decision }); setReason(''); setError('') }
  const confirm = async () => {
    if (!pending || busy) return
    setBusy(true); setError('')
    try {
      await reviewJobOrder(pending.row.id, { decision: pending.decision, reason: reason.trim() || undefined })
      await reloadInquiries()
      notify({ changes: `Changes requested for “${pending.row.role}”.`, reject: `“${pending.row.role}” was rejected.`, reopen: `“${pending.row.role}” is back in the review queue.` }[pending.decision])
      setPending(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The decision could not be saved. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const columns: Array<Column<Row>> = [
    { key: 'received', header: 'Received', sortValue: (row) => time(row.received), render: (row) => formatDateDmy(row.received) },
    { key: 'company', header: 'Employer', sortValue: (row) => row.company, render: (row) => <><strong className="admin-cell__title">{row.company || '—'}</strong><span className="admin-cell__sub">{row.reference}</span></> },
    { key: 'role', header: 'Role', sortValue: (row) => row.role, render: (row) => <>{row.role}<span className="admin-cell__sub">{row.location}</span></> },
    {
      key: 'payment', header: 'Payment', sortValue: (row) => paymentState(row.order.details?.paymentStatus),
      render: (row) => { const badge = paymentBadge[paymentState(row.order.details?.paymentStatus)]; return <span className={`admin-badge admin-badge--${badge.tone}`}>{badge.text}</span> },
    },
    {
      key: 'review', header: 'Review', sortValue: (row) => ['awaiting-review', 'changes', 'awaiting-payment', 'approved', 'rejected'].indexOf(row.state),
      render: (row) => <span className={`admin-badge admin-badge--${reviewBadge[row.state].tone}`}>{reviewBadge[row.state].text}</span>,
    },
  ]

  const filters: Array<Filter<Row>> = [
    { id: 'state', label: 'Review', options: (Object.keys(reviewBadge) as ReviewState[]).map((value) => ({ value, label: reviewBadge[value].text })), matches: (row, value) => row.state === value },
  ]

  const renderDetails = (row: Row) => (
    <div className="review-panel">
      <EnquiryDetails inquiry={row.order} />
      <div className="review-panel__decision">
        {row.state === 'awaiting-review' && (
          <>
            <p>Check the details above, then approve the advert to publish it on the careers page, or ask the employer for changes.</p>
            <div className="review-panel__actions">
              <button type="button" className="admin__button admin__button--primary" onClick={() => navigate(`/admin/jobs?order=${encodeURIComponent(row.id)}`)}>
                <FiCheckCircle aria-hidden="true" /> Approve &amp; publish…
              </button>
              <button type="button" className="admin__button" onClick={() => ask(row, 'changes')}><FiEdit3 aria-hidden="true" /> Request changes</button>
              <button type="button" className="admin__button admin__button--danger" onClick={() => ask(row, 'reject')}><FiXCircle aria-hidden="true" /> Reject</button>
            </div>
          </>
        )}
        {row.state === 'awaiting-payment' && (
          <>
            <p>The R499 activation fee has not been paid yet, so this advert cannot be approved. You can still reject it, for example if it is a duplicate.</p>
            <div className="review-panel__actions">
              <button type="button" className="admin__button admin__button--danger" onClick={() => ask(row, 'reject')}><FiXCircle aria-hidden="true" /> Reject</button>
            </div>
          </>
        )}
        {(row.state === 'changes' || row.state === 'rejected') && (
          <>
            <p>
              <strong>{reviewBadge[row.state].text}</strong> by {row.order.reviewed_by_name ?? 'a staff member'}
              {row.order.reviewed_at ? ` on ${formatDateDmy(row.order.reviewed_at)}` : ''}.
            </p>
            {row.order.review_reason && <blockquote className="review-panel__reason">{row.order.review_reason}</blockquote>}
            <div className="review-panel__actions">
              <button type="button" className="admin__button" onClick={() => ask(row, 'reopen')}><FiRotateCcw aria-hidden="true" /> Move back to review</button>
            </div>
          </>
        )}
        {row.state === 'approved' && (
          <p>
            <strong>Approved</strong> by {row.order.reviewed_by_name ?? 'a staff member'}
            {row.order.reviewed_at ? ` on ${formatDateDmy(row.order.reviewed_at)}` : ''}.{' '}
            {row.order.vacancy_id && <Link to={`/admin/jobs?edit=${encodeURIComponent(row.order.vacancy_id)}`}>Open the live job post</Link>}
          </p>
        )}
      </div>
    </div>
  )

  const copy = pending ? decisionCopy[pending.decision] : null
  const reasonTooShort = Boolean(copy?.needsReason) && reason.trim().length < 5

  return (
    <div className="admin-page">
      <div className="admin-page__heading">
        <div>
          <h1>Advert review</h1>
          <p>An IMFORCE team member must approve each employer’s advert before it goes online. {awaiting === 0 ? 'Nothing is waiting right now.' : `${awaiting} waiting for review.`}</p>
        </div>
        <button type="button" className="admin__button" onClick={() => { void reloadInquiries().then(() => notify('Job orders refreshed.')) }}>
          <FiRefreshCw aria-hidden="true" /> Refresh
        </button>
      </div>

      <section className="admin-card" aria-label="Job orders">
        {inquiriesError && <p className="staff-access-error" role="alert">{inquiriesError}</p>}
        <DataTable
          // Remount when arriving from a different notification link.
          key={linkedId ? `${linkedId}:${linkedRow ? 'found' : 'loading'}` : 'queue'}
          label="Job orders"
          rows={rows}
          columns={columns}
          rowId={(row) => row.id}
          searchText={(row) => [row.reference, row.company, row.email, row.role, row.location].join(' ')}
          searchPlaceholder="Search employer, role, reference…"
          filters={filters}
          initialFilters={linkedRow ? {} : { state: 'awaiting-review' }}
          initialQuery={linkedRow ? linkedRow.reference : ''}
          initialExpandedId={linkedRow?.id}
          initialSort={{ key: 'received', direction: 'desc' }}
          emptyMessage="No employer job orders have been received yet."
          renderDetails={renderDetails}
        />
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={copy?.title ?? ''}
        confirmLabel={copy?.confirm ?? ''}
        busyLabel={copy?.busy}
        busy={busy}
        tone={copy?.tone}
        confirmDisabled={reasonTooShort}
        error={error}
        onConfirm={() => { void confirm() }}
        onCancel={() => { if (!busy) setPending(null) }}
      >
        {pending && (
          <>
            <p className="confirm-dialog__item">
              <strong>{pending.row.role}</strong>
              <span>{pending.row.company} · {pending.row.reference}</span>
            </p>
            {copy?.needsReason ? (
              <label className="confirm-dialog__field">
                {pending.decision === 'changes' ? 'What needs to change?' : 'Why is it rejected?'}
                <textarea value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
                <small>Recorded with your name in the job order and the audit log.</small>
              </label>
            ) : (
              <p>It will appear in the review queue again so a team member can approve it or ask for changes.</p>
            )}
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}
