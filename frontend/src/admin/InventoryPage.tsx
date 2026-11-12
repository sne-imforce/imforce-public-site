import { useEffect, useMemo, useState } from 'react'
import { FiEdit3, FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { StaffInquiry } from '../data/api'
import { deleteRecruiterVacancy, useRecruiterVacancies, type RecruiterVacancy } from '../data/recruiterVacancies'
import { formatDateDmy } from '../utils/dates'
import ConfirmDialog from './ConfirmDialog'
import DataTable, { type Column, type Filter } from './DataTable'
import EnquiryDetails from './EnquiryDetails'
import { addDays, dateInSouthAfrica, enquiryReference, isLiveVacancy, paymentState, reviewBadge, reviewState, time, type PaymentState, type ReviewState } from './jobOrders'
import { useAdmin } from './adminContext'

type EnquiryRow = {
  id: string
  kind: 'contact' | 'employer'
  received: string
  from: string
  email: string
  subject: string
  payment: PaymentState | null
  review: ReviewState | null
  source: StaffInquiry
}

function toEnquiryRow(inquiry: StaffInquiry): EnquiryRow {
  const details = inquiry.details ?? {}
  const isContact = inquiry.kind === 'contact'
  return {
    id: `${inquiry.kind}-${inquiry.id}`,
    kind: inquiry.kind,
    received: inquiry.created_at,
    from: isContact ? inquiry.name ?? '' : String(details.legalName ?? details.contactName ?? ''),
    email: isContact ? inquiry.email ?? '' : String(details.email ?? ''),
    subject: isContact ? inquiry.subject ?? 'Contact enquiry' : String(details.jobTitle ?? 'Job order'),
    payment: isContact ? null : paymentState(details.paymentStatus),
    review: isContact ? null : reviewState(inquiry),
    source: inquiry,
  }
}


/** /admin — overview of everything the team manages. */
export default function InventoryPage() {
  const { inquiries, inquiriesError, reloadInquiries, notify } = useAdmin()
  const vacancies = useRecruiterVacancies()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const linkedEnquiry = searchParams.get('enquiry') ?? ''
  // Arriving from a notification: bring the enquiries table into view.
  useEffect(() => {
    if (linkedEnquiry) document.getElementById('inventory-enquiries')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [linkedEnquiry])
  // Captured once per visit so the figures stay stable while the page is open.
  const [now] = useState(() => Date.now())
  const today = dateInSouthAfrica(now)
  const isLive = (vacancy: RecruiterVacancy) => isLiveVacancy(vacancy, today)

  const enquiryRows = useMemo(() => inquiries.map(toEnquiryRow), [inquiries])
  const linkedEnquiryRow = linkedEnquiry ? enquiryRows.find((row) => row.kind === 'contact' && row.source.id === linkedEnquiry) : undefined

  const stats = useMemo(() => {
    const live = vacancies.filter((vacancy) => !vacancy.closingDate || vacancy.closingDate >= today)
    const weekAhead = addDays(today, 7)
    const monthAgo = now - 30 * 86_400_000
    return [
      { label: 'Live job posts', value: live.length },
      { label: 'Urgent', value: live.filter((vacancy) => vacancy.isUrgent).length },
      { label: 'Closing within 7 days', value: live.filter((vacancy) => vacancy.closingDate && vacancy.closingDate <= weekAhead).length },
      { label: 'Enquiries (30 days)', value: enquiryRows.filter((row) => time(row.received) >= monthAgo).length },
      { label: 'Adverts awaiting review', value: enquiryRows.filter((row) => row.review === 'awaiting-review').length },
      { label: 'Job orders awaiting payment', value: enquiryRows.filter((row) => row.review === 'awaiting-payment').length },
    ]
  }, [vacancies, enquiryRows, today, now])

  const [pendingDelete, setPendingDelete] = useState<RecruiterVacancy | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const askToDelete = (vacancy: RecruiterVacancy) => { setDeleteError(''); setPendingDelete(vacancy) }
  const cancelDelete = () => { if (!deleting) setPendingDelete(null) }
  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteRecruiterVacancy(pendingDelete.id)
      notify(`“${pendingDelete.title}” was deleted.`)
      setPendingDelete(null)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'The vacancy could not be deleted. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const unique = (values: Array<string | undefined>) =>
    [...new Set(values.filter((value): value is string => Boolean(value)))].sort().map((value) => ({ value, label: value }))

  const vacancyColumns: Array<Column<RecruiterVacancy>> = [
    {
      key: 'title', header: 'Job post', sortValue: (row) => row.title,
      render: (row) => <><strong className="admin-cell__title">{row.title}</strong><span className="admin-cell__sub">{row.clientName}</span></>,
    },
    { key: 'location', header: 'Location', sortValue: (row) => row.location, render: (row) => <>{row.location}<span className="admin-cell__sub">{row.region}</span></> },
    { key: 'type', header: 'Type', sortValue: (row) => row.employmentType, render: (row) => row.employmentType },
    {
      key: 'status', header: 'Status', sortValue: (row) => (isLive(row) ? (row.isUrgent ? 0 : 1) : 2),
      render: (row) => (
        <span className="admin-badges">
          <span className={`admin-badge admin-badge--${isLive(row) ? 'success' : 'muted'}`}>{isLive(row) ? 'Live' : 'Closed'}</span>
          {row.isUrgent && <span className="admin-badge admin-badge--danger">Urgent</span>}
        </span>
      ),
    },
    { key: 'posted', header: 'Posted', sortValue: (row) => time(row.posted), render: (row) => formatDateDmy(row.posted) },
    { key: 'closes', header: 'Closes', sortValue: (row) => row.closingDate ?? '9999-12-31', render: (row) => (row.closingDate ? formatDateDmy(row.closingDate) : 'Open') },
  ]

  const vacancyFilters: Array<Filter<RecruiterVacancy>> = [
    { id: 'status', label: 'Status', options: [{ value: 'live', label: 'Live' }, { value: 'closed', label: 'Closed' }, { value: 'urgent', label: 'Urgent' }],
      matches: (row, value) => (value === 'urgent' ? row.isUrgent && isLive(row) : (value === 'live') === isLive(row)) },
    { id: 'industry', label: 'Industry', options: unique(vacancies.map((vacancy) => vacancy.industry)), matches: (row, value) => row.industry === value },
    { id: 'type', label: 'Type', options: unique(vacancies.map((vacancy) => vacancy.employmentType)), matches: (row, value) => row.employmentType === value },
  ]

  const enquiryColumns: Array<Column<EnquiryRow>> = [
    { key: 'received', header: 'Received', sortValue: (row) => time(row.received), render: (row) => formatDateDmy(row.received) },
    {
      key: 'kind', header: 'Type', sortValue: (row) => row.kind,
      render: (row) => <span className="admin-badge">{row.kind === 'contact' ? 'Contact' : 'Job order'}</span>,
    },
    { key: 'from', header: 'From', sortValue: (row) => row.from || row.email, render: (row) => <><strong className="admin-cell__title">{row.from || '—'}</strong><span className="admin-cell__sub">{row.email}</span></> },
    { key: 'subject', header: 'Subject / role', sortValue: (row) => row.subject, render: (row) => row.subject },
    {
      key: 'status', header: 'Status', sortValue: (row) => row.review ?? 'z',
      render: (row) => (row.review
        ? <span className={`admin-badge admin-badge--${reviewBadge[row.review].tone}`}>{reviewBadge[row.review].text}</span>
        : <span className="admin-cell__sub">Contact enquiry</span>),
    },
  ]

  const enquiryFilters: Array<Filter<EnquiryRow>> = [
    { id: 'kind', label: 'Type', options: [{ value: 'contact', label: 'Contact' }, { value: 'employer', label: 'Job order' }], matches: (row, value) => row.kind === value },
    { id: 'status', label: 'Status', options: (Object.keys(reviewBadge) as ReviewState[]).map((value) => ({ value, label: reviewBadge[value].text })), matches: (row, value) => row.review === value },
  ]

  return (
    <div className="admin-page">
      <div className="admin-page__heading">
        <div>
          <h1>Inventory</h1>
          <p>Everything the team manages, at a glance.</p>
        </div>
        <Link className="admin__button admin__button--primary" to="/admin/jobs"><FiPlus aria-hidden="true" /> New job post</Link>
      </div>

      <ul className="admin-stats" aria-label="Summary">
        {stats.map((stat) => (
          <li key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></li>
        ))}
      </ul>

      <section className="admin-card" aria-labelledby="inventory-jobs">
        <div className="admin-card__heading">
          <h2 id="inventory-jobs">Job posts</h2>
        </div>
        <DataTable
          label="Job posts"
          rows={vacancies}
          columns={vacancyColumns}
          rowId={(row) => row.id}
          searchText={(row) => [row.title, row.clientName, row.location, row.region, row.category, row.industry].join(' ')}
          searchPlaceholder="Search title, client, location…"
          filters={vacancyFilters}
          initialSort={{ key: 'posted', direction: 'desc' }}
          emptyMessage="No job posts yet. Use “New job post” to publish the first one."
          renderActions={(row) => (
            <span className="admin-row-actions">
              <button type="button" onClick={() => navigate(`/admin/jobs?edit=${encodeURIComponent(row.id)}`)} aria-label={`Edit ${row.title}`} title="Edit">
                <FiEdit3 aria-hidden="true" />
              </button>
              <button type="button" onClick={() => askToDelete(row)} aria-label={`Delete ${row.title}`} title="Delete">
                <FiTrash2 aria-hidden="true" />
              </button>
            </span>
          )}
        />
      </section>

      <section className="admin-card" aria-labelledby="inventory-enquiries">
        <div className="admin-card__heading">
          <h2 id="inventory-enquiries">Enquiries</h2>
          <button type="button" className="admin__button" onClick={() => { void reloadInquiries().then(() => notify('Enquiries refreshed.')) }}>
            <FiRefreshCw aria-hidden="true" /> Refresh
          </button>
        </div>
        {inquiriesError && <p className="staff-access-error" role="alert">{inquiriesError}</p>}
        <DataTable
          label="Enquiries"
          rows={enquiryRows}
          columns={enquiryColumns}
          rowId={(row) => row.id}
          searchText={(row) => [row.from, row.email, row.subject, row.source.message, row.source.phone, row.kind === 'contact' ? enquiryReference(row.source.id) : ''].join(' ')}
          searchPlaceholder="Search name, email, subject, reference…"
          key={linkedEnquiry ? `${linkedEnquiry}:${linkedEnquiryRow ? 'found' : 'loading'}` : 'all'}
          initialQuery={linkedEnquiryRow ? enquiryReference(linkedEnquiryRow.source.id) : ''}
          initialExpandedId={linkedEnquiryRow?.id}
          filters={enquiryFilters}
          initialSort={{ key: 'received', direction: 'desc' }}
          emptyMessage="No enquiries have been received yet."
          renderDetails={(row) => <EnquiryDetails inquiry={row.source} />}
        />
      </section>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this vacancy from the recruiter dashboard?"
        confirmLabel="Delete vacancy"
        busyLabel="Deleting…"
        busy={deleting}
        error={deleteError}
        onConfirm={() => { void confirmDelete() }}
        onCancel={cancelDelete}
      >
        {pendingDelete && (
          <>
            <p className="confirm-dialog__item">
              <strong>{pendingDelete.title}</strong>
              <span>{[pendingDelete.clientName, pendingDelete.location].filter(Boolean).join(' · ')}</span>
            </p>
            <p>It will also be removed from the public careers page. This cannot be undone.</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  )
}
