import { useMemo, useState, type FormEvent } from 'react'
import { FiArrowLeft, FiEye } from 'react-icons/fi'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import DatePicker from '../components/ui/DatePicker'
import { industries, type IndustryName } from '../data/industries'
import {
  addRecruiterVacancy, updateRecruiterVacancy, useRecruiterVacancies, type RecruiterVacancy,
} from '../data/recruiterVacancies'
import { formatDateDmy, formatSalary } from '../utils/dates'
import { useAdmin } from './adminContext'
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
  const { notify } = useAdmin()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const vacancies = useRecruiterVacancies()
  const editingId = searchParams.get('edit')
  const editing = editingId ? vacancies.find((vacancy) => vacancy.id === editingId) : undefined
  // Re-mount the form when switching between "new" and a specific post.
  return <JobPostForm key={editingId ?? 'new'} editing={editing} missing={Boolean(editingId && !editing)} onDone={(message) => { notify(message); navigate('/admin') }} />
}

type FormProps = { editing: RecruiterVacancy | undefined; missing: boolean; onDone: (message: string) => void }

function JobPostForm({ editing, missing, onDone }: FormProps) {
  const [draft, setDraft] = useState<VacancyDraft>(() => toDraft(editing))
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
      if (editing) {
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
          <h1>{editing ? 'Edit job post' : 'New job post'}</h1>
          <p>{editing ? 'Changes go live on the careers page as soon as you save.' : 'Published job posts appear on the careers page straight away.'}</p>
        </div>
        <Link className="admin__button" to="/admin"><FiArrowLeft aria-hidden="true" /> Back to inventory</Link>
      </div>

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
              <Link className="admin__button" to="/admin">Cancel</Link>
              <button className="staff-access-submit" type="submit" disabled={saving} aria-busy={saving}>
                {saving ? <Spinner label="Saving…" size="sm" tone="light" /> : editing ? 'Save changes' : 'Publish job post'}
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
