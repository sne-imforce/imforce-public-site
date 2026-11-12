import { useMemo, useState, type FormEvent } from 'react'
import { FiArrowLeft, FiEye } from 'react-icons/fi'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import DatePicker from '../components/ui/DatePicker'
import { industries, type IndustryName } from '../data/industries'
import {
  addRecruiterVacancy, loadStaffVacancies, updateRecruiterVacancy, useRecruiterVacancies, type RecruiterVacancy,
} from '../data/recruiterVacancies'
import { reviewJobOrder, type StaffInquiry } from '../data/api'
import { formatDateDmy, formatSalary } from '../utils/dates'
import { useAdmin } from './adminContext'
import { jobOrderReference, jobOrderToDraft, reviewState } from './jobOrders'
import Spinner from '../components/ui/Spinner'

const employmentTypes = ['Permanent', 'Contract', 'Fixed-term', 'Temporary']

type VacancyDraft = {
  clientName: string
  title: string
  location: string
  region: string
  industry: IndustryName | ''
  category: string
  employmentType: string
  isUrgent: boolean
  closingDate: string
  salary: string
  applicationUrl: string
  summary: string
  responsibilities: string
}

const emptyDraft: VacancyDraft = {
  clientName: '', title: '', location: '', region: '', industry: '', category: '', employmentType: '',
  isUrgent: false, closingDate: '', salary: '', applicationUrl: '', summary: '', responsibilities: '',
}

function toDraft(vacancy: RecruiterVacancy | undefined): VacancyDraft {
  if (!vacancy) return { ...emptyDraft }
  return {
    clientName: vacancy.clientName ?? '',
    title: vacancy.title ?? '',
    location: vacancy.location ?? '',
    region: vacancy.region ?? '',
    industry: industries.some((industry) => industry.name === vacancy.industry) ? vacancy.industry as IndustryName : '',
    category: vacancy.category ?? '',
    employmentType: vacancy.employmentType ?? '',
    isUrgent: vacancy.isUrgent ?? false,
    closingDate: vacancy.closingDate ?? '',
    salary: formatSalary(vacancy.salary),
    applicationUrl: vacancy.applicationUrl ?? '',
    summary: vacancy.summary ?? '',
    responsibilities: (vacancy.responsibilities ?? []).join('\n'),
  }
}

/** /admin/jobs — create a job post, or edit one with ?edit=<id>. */
export default function JobPostsPage() {
  const { notify, inquiries, reloadInquiries } = useAdmin()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const vacancies = useRecruiterVacancies()
  const editingId = searchParams.get('edit')
  const orderId = searchParams.get('order')
  const editing = editingId ? vacancies.find((vacancy) => vacancy.id === editingId) : undefined
  const order = orderId ? inquiries.find((item) => item.kind === 'employer' && item.id === orderId) : undefined
  // Re-mount the form when switching between "new", an edit and an approval.
  return (
    <JobPostForm
      key={editingId ?? (orderId ? `order-${orderId}` : 'new')}
      editing={editing}
      order={order}
      missing={Boolean((editingId && !editing) || (orderId && !order))}
      onDone={(message) => { notify(message); navigate('/admin/inventory') }}
      onApproved={async (message) => { await Promise.all([reloadInquiries(), loadStaffVacancies()]); notify(message); navigate('/admin/review') }}
    />
  )
}

type FormProps = {
  editing: RecruiterVacancy | undefined
  /** Employer job order being approved (Approve & publish from Advert review). */
  order: StaffInquiry | undefined
  missing: boolean
  onDone: (message: string) => void
  onApproved: (message: string) => Promise<void>
}

function JobPostForm({ editing, order, missing, onDone, onApproved }: FormProps) {
  const [draft, setDraft] = useState<VacancyDraft>(() => (order ? jobOrderToDraft(order) : toDraft(editing)))
  const approving = Boolean(order)
  const canApprove = order ? reviewState(order) === 'awaiting-review' : false
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof VacancyDraft>(key: K, value: VacancyDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const responsibilities = useMemo(
    () => draft.responsibilities.split('\n').map((item) => item.trim()).filter(Boolean),
    [draft.responsibilities],
  )
  const hasPreview = Boolean(draft.title || draft.summary || draft.location)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    setError('')
    if (!draft.clientName.trim() || !draft.title.trim() || !draft.location.trim()) return setError('Client name, job title and location are required.')
    if (!draft.industry || !draft.category || !draft.employmentType) return setError('Please complete the industry, category and employment type.')
    if (!draft.summary.trim() || responsibilities.length === 0) return setError('Add a summary and at least one responsibility for the role.')

    const payload: Omit<RecruiterVacancy, 'id' | 'source' | 'posted'> = {
      clientName: draft.clientName.trim(),
      title: draft.title.trim(),
      location: draft.location.trim(),
      region: draft.region.trim(),
      industry: draft.industry as IndustryName,
      category: draft.category.trim(),
      employmentType: draft.employmentType,
      isUrgent: draft.isUrgent,
      closingDate: draft.closingDate || null,
      salary: draft.salary.trim() || 'Market Related Salary',
      applicationUrl: draft.applicationUrl.trim() || null,
      summary: draft.summary.trim(),
      responsibilities,
    }

    setSaving(true)
    try {
      if (order) {
        await reviewJobOrder(order.id, { decision: 'approve', vacancy: payload })
        await onApproved(`Approved. “${payload.title}” is now live on the careers page.`)
      } else if (editing) {
        await updateRecruiterVacancy(editing.id, payload)
        onDone(`“${payload.title}” was updated.`)
      } else {
        await addRecruiterVacancy(payload)
        onDone(`“${payload.title}” was published to the careers page.`)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save this job post right now.')
      setSaving(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page__heading">
        <div>
          <h1>{approving ? 'Approve & publish advert' : editing ? 'Edit job post' : 'New job post'}</h1>
          <p>{approving
            ? `From ${String(order?.details?.legalName ?? 'the employer')}'s job order ${order ? jobOrderReference(order.id) : ''}. Complete the region, industry and category, check the wording, then publish.`
            : editing ? 'Changes go live on the careers page as soon as you save.' : 'Published job posts appear on the careers page straight away.'}</p>
        </div>
        {approving
          ? <Link className="admin__button" to="/admin/review"><FiArrowLeft aria-hidden="true" /> Back to advert review</Link>
          : <Link className="admin__button" to="/admin/inventory"><FiArrowLeft aria-hidden="true" /> Back to inventory</Link>}
      </div>

      {approving && !canApprove && (
        <p className="staff-access-error" role="alert">
          This job order is not waiting for review (it may be unpaid or already reviewed), so it cannot be approved here.
        </p>
      )}

      {missing && (
        <p className="staff-access-error" role="alert">
          That job post could not be found. It may have been deleted. You can create a new one below.
        </p>
      )}

      <div className="staff-access-page__layout">
        <div className="staff-access-page__main">
          <form className="staff-access-form staff-access-form--post admin-card" onSubmit={handleSubmit}>
            <div className="staff-access-fields">
              <label>
                Client company
                <input value={draft.clientName} onChange={(event) => set('clientName', event.target.value)} maxLength={160} required />
              </label>
              <label>
                Job title
                <input value={draft.title} onChange={(event) => set('title', event.target.value)} maxLength={160} required />
              </label>
              <label>
                Location
                <input value={draft.location} onChange={(event) => set('location', event.target.value)} maxLength={160} required />
              </label>
              <label>
                Province / region
                <input value={draft.region} onChange={(event) => set('region', event.target.value)} maxLength={100} required />
              </label>
              <label>
                Industry
                <select value={draft.industry} onChange={(event) => set('industry', event.target.value as IndustryName | '')} required>
                  <option value="">Select an industry</option>
                  {industries.map((industry) => <option key={industry.slug} value={industry.name}>{industry.name}</option>)}
                </select>
              </label>
              <label>
                Job category
                <input value={draft.category} onChange={(event) => set('category', event.target.value)} maxLength={100} required />
              </label>
              <label>
                Employment type
                <select value={draft.employmentType} onChange={(event) => set('employmentType', event.target.value)} required>
                  <option value="">Select employment type</option>
                  {employmentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="staff-access-fields__wide staff-access-urgent-toggle">
                <input type="checkbox" checked={draft.isUrgent} onChange={(event) => set('isUrgent', event.target.checked)} />
                Mark this vacancy as urgent
              </label>
              <label>
                Salary or package
                <input
                  value={draft.salary}
                  maxLength={120}
                  placeholder="For example, ZAR 20,000 to ZAR 25,000 per month"
                  onChange={(event) => set('salary', event.target.value)}
                />
              </label>
              <DatePicker
                id="vacancy-closing-date"
                label="Closing date (optional)"
                value={draft.closingDate}
                onChange={(closingDate) => set('closingDate', closingDate)}
              />
              <label className="staff-access-fields__wide">
                Nexora AI application URL (optional)
                <input
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://nexora.ai/jobs/…"
                  value={draft.applicationUrl}
                  maxLength={500}
                  onChange={(event) => set('applicationUrl', event.target.value)}
                  aria-describedby="vacancy-application-url-help"
                  pattern="https://.*"
                  title="Enter the full HTTPS URL for this vacancy on Nexora AI."
                />
                <span className="staff-access-field-help" id="vacancy-application-url-help">
                  Candidates will use this link to apply to this specific vacancy.
                </span>
              </label>
              <label className="staff-access-fields__wide">
                Role summary
                <textarea rows={3} value={draft.summary} maxLength={3000} onChange={(event) => set('summary', event.target.value)} required />
              </label>
              <label className="staff-access-fields__wide">
                Key responsibilities (one per line)
                <textarea rows={5} value={draft.responsibilities} onChange={(event) => set('responsibilities', event.target.value)} required />
              </label>
            </div>

            {error && <p className="staff-access-error" role="alert">{error}</p>}

            <div className="admin-form-actions">
              <Link className="admin__button" to={approving ? '/admin/review' : '/admin/inventory'}>Cancel</Link>
              <button className="staff-access-submit" type="submit" disabled={saving || (approving && !canApprove)} aria-busy={saving}>
                {saving ? <Spinner label={approving ? 'Publishing…' : 'Saving…'} size="sm" tone="light" /> : approving ? 'Approve & publish' : editing ? 'Save changes' : 'Publish job post'}
              </button>
            </div>
          </form>
        </div>

        <aside className="staff-access-page__sidebar">
          <div className="staff-access-preview">
            <p className="staff-access-eyebrow">Live preview</p>
            <h2>Public job card</h2>
            {hasPreview ? (
              <article className="staff-access-preview__card">
                <span className="staff-access-preview__label">{draft.clientName || 'Client preview'}</span>
                {draft.isUrgent && <span className="staff-access-urgent-badge">Urgent</span>}
                <h3>{draft.title || 'Untitled vacancy'}</h3>
                <div className="staff-access-preview__meta">
                  <span>{draft.location || 'Location pending'}</span>
                  <span>{draft.employmentType || 'Permanent'}</span>
                  <span>{formatSalary(draft.salary || 'Market Related Salary')}</span>
                  {draft.closingDate && <span>Closes {formatDateDmy(draft.closingDate)}</span>}
                </div>
                <p>{draft.summary || 'Role summary preview will appear here once the draft is filled in.'}</p>
                <div className="staff-access-preview__footer">
                  <span>{editing ? 'Draft update' : 'Draft preview'}</span>
                  <FiEye aria-hidden="true" />
                </div>
              </article>
            ) : (
              <p className="staff-access-description">Fill in the vacancy details to preview the public card before publishing.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
