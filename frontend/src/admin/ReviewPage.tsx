import { useMemo, useState } from 'react'
import { FiCheckCircle, FiCopy, FiCreditCard, FiEdit3, FiMail, FiRefreshCw, FiRotateCcw } from 'react-icons/fi'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { resendChangeLink, reviewJobOrder, sendPaymentLink, type ChangeLinkResult, type ReviewDecision, type StaffInquiry } from '../data/api'
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
  // Shown when the update link could not be emailed, so staff can send it themselves.
  const [now] = useState(() => Date.now())
  const [manualLink, setManualLink] = useState<(ChangeLinkResult & { role: string; kind: 'update' | 'payment' }) | null>(null)
  const [copied, setCopied] = useState(false)
  const [resending, setResending] = useState<string | null>(null)

  const announceLink = (result: ChangeLinkResult | null, role: string) => {
    if (result?.emailStatus === 'sent') notify(`Changes requested for “${role}”. The employer was emailed a private link at ${result.sentTo}.`)
    else if (result?.link) { setCopied(false); setManualLink({ ...result, role, kind: 'update' }) }
    else notify(result?.error ?? `Changes requested for “${role}”, but the update link could not be created. Use “Send a new link”.`)
  }
  const resend = async (row: Row) => {
    setResending(row.id)
    try {
      const { changeLink } = await resendChangeLink(row.id)
      await reloadInquiries()
      if (changeLink.emailStatus === 'sent') notify(`A new link was emailed to ${changeLink.sentTo}. The previous link no longer works.`)
      else announceLink(changeLink, row.role)
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'A new link could not be sent.')
    } finally {
      setResending(null)
    }
  }

  const emailPaymentLink = async (row: Row) => {
    setResending(row.id)
    try {
      const { paymentLink } = await sendPaymentLink(row.id)
      await reloadInquiries()
      if (paymentLink.emailStatus === 'sent') notify(`A payment link was emailed to ${paymentLink.sentTo}. Any earlier payment link you sent no longer works.`)
      else if (paymentLink.link) { setCopied(false); setManualLink({ ...paymentLink, role: row.role, kind: 'payment' }) }
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'The payment link could not be sent.')
    } finally {
      setResending(null)
    }
  }

  const ask = (row: Row, decision: PendingDecision['decision']) => { setPending({ row, decision }); setReason(''); setError('') }
  const confirm = async () => {
    if (!pending || busy) return
    setBusy(true); setError('')
    try {
      const result = await reviewJobOrder(pending.row.id, { decision: pending.decision, reason: reason.trim() || undefined })
      await reloadInquiries()
      if (pending.decision === 'changes') announceLink(result.changeLink, pending.row.role)
      else notify(`“${pending.row.role}” is back in the review queue.`)
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
      render: (row) => (
        <span className="admin-badges">
          <span className={`admin-badge admin-badge--${reviewBadge[row.state].tone}`}>{reviewBadge[row.state].text}</span>
          {row.state === 'awaiting-review' && row.order.details?.resubmittedAt && <span className="admin-badge admin-badge--success">Updated by employer</span>}
        </span>
      ),
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
            {typeof row.order.details?.resubmittedAt === 'string' && (
              <div className="review-panel__resubmitted">
                <strong>The employer updated this job order on {formatDateDmy(String(row.order.details.resubmittedAt))}</strong> after being asked:
                {row.order.details?.lastChangeRequest && <blockquote className="review-panel__reason">{String(row.order.details.lastChangeRequest)}</blockquote>}
                <ChangedFields value={row.order.details?.lastChangedFields} />
              </div>
            )}
            <p>Check the details above, then approve the advert to publish it on the careers page, or ask the employer for changes.</p>
            <div className="review-panel__actions">
              <button type="button" className="admin__button admin__button--primary" onClick={() => navigate(`/admin/jobs?order=${encodeURIComponent(row.id)}`)}>
                <FiCheckCircle aria-hidden="true" /> Approve &amp; publish…
              </button>
              <button type="button" className="admin__button" onClick={() => ask(row, 'changes')}><FiEdit3 aria-hidden="true" /> Request changes</button>
            </div>
          </>
        )}
        {row.state === 'awaiting-payment' && (
          <>
            <p>The R499 activation fee has not been paid yet, so this advert cannot be approved. Email the employer a private link to pay for this job order. It does not create a new order.</p>
            <PaymentLinkStatus order={row.order} now={now} />
            <div className="review-panel__actions">
              <button type="button" className="admin__button" disabled={resending === row.id} onClick={() => { void emailPaymentLink(row) }}>
                <FiCreditCard aria-hidden="true" /> {resending === row.id ? 'Sending…' : row.order.payment_link ? 'Send a new payment link' : 'Send payment link'}
              </button>
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
            {row.state === 'changes' && <ChangeLinkStatus order={row.order} now={now} />}
            <div className="review-panel__actions">
              {row.state === 'changes' && (
                <button type="button" className="admin__button" disabled={resending === row.id} onClick={() => { void resend(row) }}>
                  <FiMail aria-hidden="true" /> {resending === row.id ? 'Sending…' : 'Send a new link'}
                </button>
              )}
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
                Message to the employer: what needs to change?
                <textarea value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} placeholder="For example: Please add the salary range and the working hours." />
                <small>
                  We email this message to {pending.row.email || 'the employer'} with a private link to update the job order. They do not pay again.
                  Write it for the employer. It is also recorded with your name in the audit log.
                </small>
              </label>
            ) : (
              <p>It will appear in the review queue again so a team member can approve it or ask for changes.</p>
            )}
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={manualLink !== null}
        title={manualLink?.kind === 'payment' ? 'Send the payment link to the employer' : 'Send the update link to the employer'}
        confirmLabel="Done"
        tone="neutral"
        onConfirm={() => setManualLink(null)}
        onCancel={() => setManualLink(null)}
      >
        {manualLink && (
          <>
            <p>
              {manualLink.emailStatus === 'failed'
                ? 'The email could not be sent.'
                : 'Email sending is not set up yet.'}{' '}
              Copy this private link and send it to {manualLink.sentTo ?? 'the employer'} yourself, so they can {manualLink.kind === 'payment' ? 'pay for' : 'update'} “{manualLink.role}”.
            </p>
            <label className="confirm-dialog__field">
              {manualLink.kind === 'payment' ? 'Private payment link' : 'Private update link'}
              <input readOnly value={manualLink.link ?? ''} onFocus={(event) => event.currentTarget.select()} />
              <small>
                {manualLink.kind === 'payment'
                  ? `It expires on ${manualLink.expiresAt ? formatDateDmy(manualLink.expiresAt) : 'in 7 days'}. Send it only to the employer.`
                  : `It works once and expires on ${manualLink.expiresAt ? formatDateDmy(manualLink.expiresAt) : 'in 7 days'}. Send it only to the employer; anyone with it can edit this job order.`}
              </small>
            </label>
            <button
              type="button"
              className="admin__button confirm-dialog__copy"
              onClick={() => { void navigator.clipboard?.writeText(manualLink.link ?? '').then(() => setCopied(true)) }}
            >
              <FiCopy aria-hidden="true" /> {copied ? 'Copied' : 'Copy link'}
            </button>
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}

/** Where the employer's update link stands. */
function ChangeLinkStatus({ order, now }: { order: StaffInquiry; now: number }) {
  const link = order.change_request
  if (!link) return <p className="review-panel__link">No update link has been sent yet. Use “Send a new link”.</p>
  const expired = !link.responded_at && !link.revoked_at && Date.parse(link.expires_at) < now
  const status = link.revoked_at ? 'Replaced or cancelled'
    : expired ? `Expired on ${formatDateDmy(link.expires_at)}. Send a new link if the employer still needs to update it`
      : link.email_status === 'sent' ? `Emailed to ${String(order.details?.email ?? 'the employer')} on ${formatDateDmy(link.emailed_at ?? link.requested_at)} · expires ${formatDateDmy(link.expires_at)}`
        : `Not emailed (${link.email_status === 'failed' ? 'email failed' : 'email not set up'}). Send a new link to get a link you can copy · expires ${formatDateDmy(link.expires_at)}`
  return <p className={`review-panel__link${expired ? ' is-expired' : ''}`}><FiMail aria-hidden="true" /> Update link: {status}.</p>
}

/** Which fields the employer changed when they resubmitted. */
function ChangedFields({ value }: { value: unknown }) {
  if (!Array.isArray(value)) return null
  const fields = value.filter((item): item is string => typeof item === 'string')
  return (
    <p className="review-panel__changed">
      {fields.length ? <><strong>Changed:</strong> {fields.join(', ')}.</> : 'The employer resubmitted without changing any fields.'}
    </p>
  )
}

/** Where the staff-sent payment link stands. */
function PaymentLinkStatus({ order, now }: { order: StaffInquiry; now: number }) {
  const link = order.payment_link
  if (!link) return null
  const expired = !link.revoked_at && Date.parse(link.expires_at) < now
  const by = link.created_by_name ? ` by ${link.created_by_name}` : ''
  const status = link.revoked_at ? 'Replaced or cancelled'
    : expired ? `Expired on ${formatDateDmy(link.expires_at)}. Send a new payment link if they still want to pay`
      : link.email_status === 'sent' ? `Emailed${by} on ${formatDateDmy(link.emailed_at ?? link.created_at)} · expires ${formatDateDmy(link.expires_at)}`
        : `Not emailed (${link.email_status === 'failed' ? 'email failed' : 'email not set up'}). Send a new payment link to get a link you can copy`
  return <p className={`review-panel__link${expired ? ' is-expired' : ''}`}><FiCreditCard aria-hidden="true" /> Payment link: {status}.</p>
}
