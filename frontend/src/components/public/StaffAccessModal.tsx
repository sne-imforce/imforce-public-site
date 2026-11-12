import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { FiEdit3, FiEye, FiLogOut, FiSettings, FiTrash2 } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import DatePicker from '../ui/DatePicker'
import { industries, type IndustryName } from '../../data/industries'
import { formatDateDmy, formatSalary } from '../../utils/dates'
import { getStaffAudit, getStaffIdentity, getStaffInquiries, getStaffToken, getStaffTokenExpiry, onStaffSessionExpired, saveStaffToken, staffLogin, staffLogout, type StaffAuditEntry, type StaffInquiry } from '../../data/api'
import {
  addRecruiterVacancy,
  deleteRecruiterVacancy,
  loadStaffVacancies,
  updateRecruiterVacancy,
  useRecruiterVacancies,
} from '../../data/recruiterVacancies'
import type { RecruiterVacancy } from '../../data/recruiterVacancies'
import './StaffAccessModal.css'

const employmentTypes = ['Permanent', 'Contract', 'Fixed-term', 'Temporary']
const idleTimeoutMs = 15 * 60 * 1000
const hiddenInquiryFields = new Set(['authorizedContact', 'paymentAmountMinor', 'paymentCurrency', 'paystackTransactionId'])

function humanizeField(key: string) {
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function paymentLabel(status: unknown): { text: string; tone: 'success' | 'warning' | 'danger' } {
  if (status === 'paid') return { text: 'Paid', tone: 'success' }
  if (status === 'initialization_failed') return { text: 'Checkout failed', tone: 'danger' }
  return { text: 'Awaiting payment', tone: 'warning' }
}

const auditActionLabels: Record<string, string> = {
  'staff.login': 'Signed in',
  'staff.logout': 'Signed out',
  'enquiries.view': 'Viewed enquiries',
  'vacancy.create': 'Created vacancy',
  'vacancy.update': 'Updated vacancy',
  'vacancy.delete': 'Deleted vacancy',
}

function describeAudit(entry: StaffAuditEntry) {
  const label = auditActionLabels[entry.action] ?? entry.action
  const title = typeof entry.detail?.title === 'string' ? ` “${entry.detail.title}”` : ''
  const fields = Array.isArray(entry.detail?.changedFields) && entry.detail.changedFields.length
    ? ` (${(entry.detail.changedFields as string[]).map((field) => field.replace(/_/g, ' ')).join(', ')})`
    : ''
  return `${label}${title}${fields}`
}

const formatAuditTime = (value: string) => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

// Only build a mailto: link from a plain, single address (no header injection).
const isSafeEmail = (value: string) => /^[^\s@<>"?&,;:]+@[^\s@<>"?&,;:]+\.[^\s@<>"?&,;:]+$/.test(value) && value.length <= 254

type StaffMember = {
  email: string
}

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
  clientName: '',
  title: '',
  location: '',
  region: '',
  industry: '',
  category: '',
  employmentType: '',
  isUrgent: false,
  closingDate: '',
  salary: '',
  applicationUrl: '',
  summary: '',
  responsibilities: '',
}

function toDraft(vacancy: Partial<RecruiterVacancy> | null | undefined): VacancyDraft {
  if (!vacancy) return { ...emptyDraft }

  return {
    clientName: vacancy.clientName ?? '',
    title: vacancy.title ?? '',
    location: vacancy.location ?? '',
    region: vacancy.region ?? '',
    industry: industries.some((industry) => industry.name === vacancy.industry)
      ? vacancy.industry as IndustryName
      : '',
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

function StaffAccessModal() {
  return (
    <Link
      className="staff-access-trigger"
      to="/admin"
      aria-label="Open admin portal"
      title="Admin portal"
    >
      <FiSettings aria-hidden="true" />
    </Link>
  )
}

export function StaffAccessPage() {
  const recruiterVacancies = useRecruiterVacancies()
  const [staffMember, setStaffMember] = useState<StaffMember | null>(null)
  const [loginError, setLoginError] = useState('')
  const [formError, setFormError] = useState('')
  const [snackbarMessage, setSnackbarMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<VacancyDraft>({ ...emptyDraft })
  const [inquiries, setInquiries] = useState<StaffInquiry[]>([])
  const [signingIn, setSigningIn] = useState(false)
  const [auditEntries, setAuditEntries] = useState<StaffAuditEntry[] | null>(null)
  const [auditError, setAuditError] = useState('')

  const loadAudit = async () => {
    setAuditError('')
    try { setAuditEntries((await getStaffAudit()).entries) } catch (error) {
      setAuditError(error instanceof Error ? error.message : 'The activity log could not be loaded.')
    }
  }

  useEffect(() => {
    if (!getStaffToken()) return
    void getStaffIdentity().then(async (identity) => {
      const [, result] = await Promise.all([loadStaffVacancies(), getStaffInquiries()])
      setStaffMember(identity)
      setInquiries(result.inquiries)
    }).catch(() => { saveStaffToken(null) })
  }, [])

  useEffect(() => {
    if (!snackbarMessage) return
    const timer = window.setTimeout(() => setSnackbarMessage(''), 4000)
    return () => window.clearTimeout(timer)
  }, [snackbarMessage])

  const previewVacancy = useMemo<RecruiterVacancy | null>(() => {
    if (!draft.title && !draft.summary && !draft.location) return null

    return {
      id: editingId ?? 'draft-vacancy',
      source: 'recruiter',
      clientName: draft.clientName || 'Client preview',
      title: draft.title || 'Untitled vacancy',
      location: draft.location || 'Location pending',
      region: draft.region || 'Region pending',
      industry: draft.industry,
      category: draft.category || 'General',
      employmentType: draft.employmentType || 'Permanent',
      isUrgent: draft.isUrgent,
      closingDate: draft.closingDate || null,
      salary: draft.salary || 'Market Related Salary',
      posted: editingId ? 'Draft update' : 'Draft preview',
      applicationUrl: draft.applicationUrl.trim() || null,
      summary: draft.summary || 'Role summary preview will appear here once the draft is filled in.',
      responsibilities: draft.responsibilities
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    }
  }, [draft, editingId])

  const resetAccess = useCallback((notice = '') => {
    saveStaffToken(null)
    setStaffMember(null)
    setInquiries([])
    setLoginError(notice)
    setFormError('')
    setSnackbarMessage('')
    setEditingId(null)
    setDraft({ ...emptyDraft })
    setAuditEntries(null)
    setAuditError('')
  }, [])

  const signOut = async () => {
    // Revoke the session on the server so a copied token stops working too.
    try { await staffLogout() } catch { /* The local session is cleared regardless. */ }
    resetAccess()
  }

  useEffect(() => onStaffSessionExpired(() => resetAccess('Your session has expired. Sign in again to continue.')), [resetAccess])

  // Sign out automatically after inactivity or when the token expires, so an
  // unattended office computer does not stay signed in to the dashboard.
  useEffect(() => {
    if (!staffMember) return
    let idleTimer = 0
    const expireIdle = () => {
      void staffLogout().catch(() => undefined)
      resetAccess('You were signed out after 15 minutes of inactivity.')
    }
    const resetIdle = () => { window.clearTimeout(idleTimer); idleTimer = window.setTimeout(expireIdle, idleTimeoutMs) }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((name) => window.addEventListener(name, resetIdle, { passive: true }))
    resetIdle()
    const expiresAt = getStaffTokenExpiry()
    const expiryTimer = expiresAt
      ? window.setTimeout(() => resetAccess('Your session has expired. Sign in again to continue.'), Math.max(0, expiresAt - Date.now()))
      : 0
    return () => {
      window.clearTimeout(idleTimer)
      window.clearTimeout(expiryTimer)
      events.forEach((name) => window.removeEventListener(name, resetIdle))
    }
  }, [staffMember, resetAccess])

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '')
    if (signingIn) return
    setSigningIn(true)
    setLoginError('')
    try {
      const session = await staffLogin(email, password)
      saveStaffToken(session.accessToken, session.expiresIn)
      const [, result] = await Promise.all([loadStaffVacancies(), getStaffInquiries()])
      setLoginError('')
      setStaffMember({ email: session.email })
      setInquiries(result.inquiries)
      setDraft({ ...emptyDraft })
    } catch (error) {
      saveStaffToken(null)
      setLoginError(error instanceof Error ? error.message : 'Sign in could not be completed.')
    } finally {
      setSigningIn(false)
    }
  }

  const beginEdit = (vacancy: RecruiterVacancy) => {
    setEditingId(vacancy.id)
    setDraft(toDraft(vacancy))
    setFormError('')
  }

  const handleDelete = async (vacancyId: string) => {
    if (!window.confirm('Delete this vacancy from the recruiter dashboard?')) return
    try { await deleteRecruiterVacancy(vacancyId) } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Vacancy could not be deleted.')
      return
    }
    if (editingId === vacancyId) {
      setEditingId(null)
      setDraft({ ...emptyDraft })
    }
    setSnackbarMessage('Vacancy removed from the recruiter board.')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    const responsibilities = draft.responsibilities
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)

    if (!draft.clientName.trim() || !draft.title.trim() || !draft.location.trim()) {
      setFormError('Client name, job title and location are required.')
      return
    }

    if (!draft.industry || !draft.category || !draft.employmentType) {
      setFormError('Please complete the industry, category and employment type.')
      return
    }

    if (!draft.summary.trim() || responsibilities.length === 0) {
      setFormError('Add a summary and at least one responsibility for the role.')
      return
    }

    const vacancyPayload: Omit<RecruiterVacancy, 'id' | 'source' | 'posted'> = {
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

    try {
      if (editingId) {
        await updateRecruiterVacancy(editingId, vacancyPayload)
        setSnackbarMessage('Vacancy updated and saved in the recruiter board.')
      } else {
        await addRecruiterVacancy(vacancyPayload)
        setSnackbarMessage('Vacancy created and published to the public listings.')
      }

      setDraft({ ...emptyDraft })
      setEditingId(null)
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Unable to save this vacancy right now.',
      )
    }
  }

  return (
    <main className="staff-access-page">
      <div className="staff-access-page__shell">
        {!staffMember ? (
          <section className="staff-access-panel staff-access-panel--page staff-access-panel--login">
            <div className="staff-access-page__topbar">
              <div>
                <p className="staff-access-eyebrow">IMFORCE team</p>
                <h1>Admin Login</h1>
              </div>
              <Link className="staff-access-home" to="/">
                HOME
              </Link>
            </div>

            <form className="staff-access-form" onSubmit={handleLogin}>
              <label>
                Company email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
              <label>
                Password
                <input name="password" type="password" autoComplete="current-password" required />
              </label>

              {loginError && (
                <p className="staff-access-error" role="alert">
                  {loginError}
                </p>
              )}

              <button className="staff-access-submit" type="submit" disabled={signingIn} aria-busy={signingIn}>
                {signingIn ? 'Signing in…' : 'Continue to recruiter dashboard'}
              </button>
              <p className="staff-access-description">
                For authorised IMFORCE staff only. Sign-in attempts are monitored and logged.
              </p>
            </form>
          </section>
        ) : (
          <section className="staff-access-panel staff-access-panel--page staff-access-panel--dashboard">
            <div className="staff-access-form-heading">
              <div>
                <p className="staff-access-eyebrow">Recruiter workspace</p>
                <h1>Vacancy management</h1>
              </div>
              <div className="staff-access-page__actions-row">
                <Link className="staff-access-home" to="/">
                  HOME
                </Link>
                <button className="staff-access-signout" type="button" onClick={() => { void signOut() }}>
                  <FiLogOut aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>

            <p className="staff-access-description">
              Signed in as <strong>{staffMember.email}</strong>. Create a new job,
              preview the public card, and update or delete existing recruiter posts.
            </p>

            <section className="staff-access-page__list" aria-labelledby="staff-inquiries-title">
              <div className="staff-access-page__list-header">
                <h2 id="staff-inquiries-title">Recent enquiries</h2>
                <span>{inquiries.length}</span>
              </div>
              {inquiries.length === 0 ? (
                <p className="staff-access-description">No enquiries have been received.</p>
              ) : (
                <ul className="staff-access-page__entries">
                  {inquiries.map((inquiry) => {
                    const details = inquiry.details ?? {}
                    const isContact = inquiry.kind === 'contact'
                    const title = isContact
                      ? inquiry.subject ?? 'Contact enquiry'
                      : `${String(details.jobTitle ?? 'Job order')} · ${String(details.legalName ?? '')}`
                    const email = isContact ? inquiry.email ?? '' : String(details.email ?? '')
                    const payment = isContact ? null : paymentLabel(details.paymentStatus)
                    return (
                      <li key={`${inquiry.kind}-${inquiry.id}`} className="staff-enquiry">
                        <details>
                          <summary>
                            <span className="staff-enquiry__heading">
                              <strong>{title}</strong>
                              <span className="staff-enquiry__badges">
                                <span className="staff-enquiry__badge">{isContact ? 'Contact' : 'Job order'}</span>
                                {payment && <span className={`staff-enquiry__badge staff-enquiry__badge--${payment.tone}`}>{payment.text}</span>}
                              </span>
                            </span>
                            <span>{email} · {formatDateDmy(inquiry.created_at)}</span>
                          </summary>
                          <dl className="staff-enquiry__details">
                            {isContact ? (
                              <>
                                {inquiry.name && <div><dt>Name</dt><dd>{inquiry.name}</dd></div>}
                                {inquiry.phone && <div><dt>Phone</dt><dd>{inquiry.phone}</dd></div>}
                                {inquiry.enquiry_type && <div><dt>Enquiry type</dt><dd>{inquiry.enquiry_type}</dd></div>}
                                <div className="staff-enquiry__wide"><dt>Message</dt><dd>{inquiry.message}</dd></div>
                              </>
                            ) : (
                              Object.entries(details).filter(([key]) => !hiddenInquiryFields.has(key)).map(([key, value]) => (
                                <div key={key} className={String(value).length > 80 ? 'staff-enquiry__wide' : undefined}>
                                  <dt>{humanizeField(key)}</dt><dd>{String(value)}</dd>
                                </div>
                              ))
                            )}
                          </dl>
                          {isSafeEmail(email) && (
                            <a className="staff-enquiry__reply" href={`mailto:${email}`}>Reply by email</a>
                          )}
                        </details>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <details
              className="staff-access-page__list staff-activity"
              onToggle={(event) => { if (event.currentTarget.open && auditEntries === null) void loadAudit() }}
            >
              <summary>
                <h2>Recent staff activity</h2>
                <span className="staff-activity__hint">Who changed what, and when</span>
              </summary>
              {auditError && <p className="staff-access-error" role="alert">{auditError}</p>}
              {auditEntries === null && !auditError && <p className="staff-access-description">Loading activity…</p>}
              {auditEntries?.length === 0 && <p className="staff-access-description">No staff activity has been recorded yet.</p>}
              {auditEntries && auditEntries.length > 0 && (
                <ol className="staff-activity__list">
                  {auditEntries.map((entry, index) => (
                    <li key={`${entry.occurred_at}-${index}`}>
                      <time dateTime={entry.occurred_at}>{formatAuditTime(entry.occurred_at)}</time>
                      <span>{describeAudit(entry)}</span>
                      <span className="staff-activity__actor">{entry.actor_email ?? 'Unknown user'}</span>
                    </li>
                  ))}
                </ol>
              )}
            </details>

            <div className="staff-access-page__layout">
              <div className="staff-access-page__main">
                <form className="staff-access-form staff-access-form--post" onSubmit={handleSubmit}>
                  <div className="staff-access-page__toolbar">
                    <h2>{editingId ? 'Update vacancy' : 'Add a vacancy'}</h2>
                    {editingId && (
                      <button
                        type="button"
                        className="staff-access-secondary"
                        onClick={() => {
                          setEditingId(null)
                          setDraft({ ...emptyDraft })
                        }}
                      >
                        New vacancy
                      </button>
                    )}
                  </div>

                  <div className="staff-access-fields">
                    <label>
                      Client company
                      <input
                        value={draft.clientName}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, clientName: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label>
                      Job title
                      <input
                        value={draft.title}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, title: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label>
                      Location
                      <input
                        value={draft.location}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, location: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label>
                      Province / region
                      <input
                        value={draft.region}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, region: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label>
                      Industry
                      <select
                        value={draft.industry}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            industry: event.target.value as IndustryName | '',
                          }))
                        }
                        required
                      >
                        <option value="">Select an industry</option>
                        {industries.map((industry) => (
                          <option key={industry.slug} value={industry.name}>
                            {industry.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Job category
                      <input
                        value={draft.category}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, category: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label>
                      Employment type
                      <select
                        value={draft.employmentType}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            employmentType: event.target.value,
                          }))
                        }
                        required
                      >
                        <option value="">Select employment type</option>
                        {employmentTypes.map((employmentType) => (
                          <option key={employmentType} value={employmentType}>
                            {employmentType}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="staff-access-fields__wide staff-access-urgent-toggle">
                      <input
                        type="checkbox"
                        checked={draft.isUrgent}
                        onChange={(event) => setDraft((current) => ({ ...current, isUrgent: event.target.checked }))}
                      />
                      Mark this vacancy as urgent
                    </label>

                    <label>
                      Salary or package
                      <input
                        value={draft.salary}
                        placeholder="For example, ZAR 20,000 to ZAR 25,000 per month"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, salary: event.target.value }))
                        }
                      />
                    </label>

                    <DatePicker
                      id="vacancy-closing-date"
                      label="Closing date (optional)"
                      value={draft.closingDate}
                      onChange={(closingDate) => setDraft((current) => ({ ...current, closingDate }))}
                    />

                    <label className="staff-access-fields__wide">
                      Nexora AI application URL (optional)
                      <input
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        placeholder="https://nexora.ai/jobs/…"
                        value={draft.applicationUrl}
                        onChange={(event) => setDraft((current) => ({ ...current, applicationUrl: event.target.value }))}
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
                      <textarea
                        rows={3}
                        value={draft.summary}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, summary: event.target.value }))
                        }
                        required
                      />
                    </label>

                    <label className="staff-access-fields__wide">
                      Key responsibilities (one per line)
                      <textarea
                        rows={5}
                        value={draft.responsibilities}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            responsibilities: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
                  </div>

                  {formError && (
                    <p className="staff-access-error" role="alert">
                      {formError}
                    </p>
                  )}

                  <button className="staff-access-submit" type="submit">
                    {editingId ? 'Save changes' : 'Publish vacancy'}
                  </button>
                </form>
              </div>

              <aside className="staff-access-page__sidebar">
                <div className="staff-access-preview">
                  <p className="staff-access-eyebrow">Live preview</p>
                  <h3>Public job card</h3>
                  {previewVacancy ? (
                    <article className="staff-access-preview__card">
                      <span className="staff-access-preview__label">{previewVacancy.clientName}</span>
                      {previewVacancy.isUrgent && <span className="staff-access-urgent-badge">Urgent</span>}
                      <h4>{previewVacancy.title}</h4>
                      <div className="staff-access-preview__meta">
                        <span>{previewVacancy.location}</span>
                        <span>{previewVacancy.employmentType}</span>
                        <span>{formatSalary(previewVacancy.salary)}</span>
                        {previewVacancy.closingDate && <span>Closes {formatDateDmy(previewVacancy.closingDate)}</span>}
                      </div>
                      <p>{previewVacancy.summary}</p>
                      <div className="staff-access-preview__footer">
                        <span>{previewVacancy.posted}</span>
                        <FiEye aria-hidden="true" />
                      </div>
                    </article>
                  ) : (
                    <p className="staff-access-description">
                      Fill in the vacancy details to preview the public card before publishing.
                    </p>
                  )}
                </div>

                <div className="staff-access-page__list">
                  <div className="staff-access-page__list-header">
                    <h3>Existing jobs</h3>
                    <span>{recruiterVacancies.length}</span>
                  </div>

                  {recruiterVacancies.length === 0 ? (
                    <p className="staff-access-description">
                      No recruiter vacancies yet.
                    </p>
                  ) : (
                    <ul className="staff-access-page__entries">
                      {recruiterVacancies.map((vacancy) => (
                        <li key={vacancy.id}>
                          <div>
                            <strong>{vacancy.title}</strong>
                            <span>{vacancy.location}</span>
                          </div>
                          <div className="staff-access-page__actions">
                            <button type="button" onClick={() => beginEdit(vacancy)} aria-label={`Edit ${vacancy.title}`}>
                              <FiEdit3 aria-hidden="true" />
                            </button>
                            <button type="button" onClick={() => handleDelete(vacancy.id)} aria-label={`Delete ${vacancy.title}`}>
                              <FiTrash2 aria-hidden="true" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </aside>
            </div>
          </section>
        )}
      </div>

      {snackbarMessage && (
        <div className="staff-access-snackbar" role="status" aria-live="polite">
          {snackbarMessage}
        </div>
      )}
    </main>
  )
}

export default StaffAccessModal
