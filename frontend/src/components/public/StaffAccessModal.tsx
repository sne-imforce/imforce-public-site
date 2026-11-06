import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { FiEdit3, FiEye, FiLogOut, FiSettings, FiTrash2 } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { industries, type IndustryName } from '../../data/industries'
import {
  addRecruiterVacancy,
  deleteRecruiterVacancy,
  updateRecruiterVacancy,
  useRecruiterVacancies,
} from '../../data/recruiterVacancies'
import type { RecruiterVacancy } from '../../data/recruiterVacancies'
import './StaffAccessModal.css'

const authorizedStaff = [{ staffId: '12345', email: 'recruiter@imforce.co.za' }]
const employmentTypes = ['Permanent', 'Contract', 'Fixed-term', 'Temporary']
const adminSessionKey = 'imforce-admin-session'

type StaffMember = {
  staffId: string
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
  salary: string
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
  salary: '',
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
    industry: vacancy.industry ?? '',
    category: vacancy.category ?? '',
    employmentType: vacancy.employmentType ?? '',
    salary: vacancy.salary ?? '',
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

  useEffect(() => {
    const savedSession = window.localStorage.getItem(adminSessionKey)
    if (!savedSession) return

    try {
      const parsed = JSON.parse(savedSession) as Partial<StaffMember>
      if (
        typeof parsed.staffId === 'string' &&
        typeof parsed.email === 'string'
      ) {
        setStaffMember({ staffId: parsed.staffId, email: parsed.email })
      }
    } catch (error) {
      console.error('Unable to restore admin session.', error)
    }
  }, [])

  useEffect(() => {
    if (!snackbarMessage) return
    const timer = window.setTimeout(() => setSnackbarMessage(''), 4000)
    return () => window.clearTimeout(timer)
  }, [snackbarMessage])

  useEffect(() => {
    if (!staffMember) {
      window.localStorage.removeItem(adminSessionKey)
      return
    }

    window.localStorage.setItem(adminSessionKey, JSON.stringify(staffMember))
  }, [staffMember])

  const previewVacancy = useMemo<RecruiterVacancy | null>(() => {
    if (!draft.title && !draft.summary && !draft.location) return null

    return {
      id: editingId ?? 'draft-vacancy',
      source: 'recruiter',
      clientName: draft.clientName || 'Client preview',
      title: draft.title || 'Untitled vacancy',
      location: draft.location || 'Location pending',
      region: draft.region || 'Region pending',
      industry: (draft.industry || 'Finance') as IndustryName,
      category: draft.category || 'General',
      employmentType: draft.employmentType || 'Permanent',
      salary: draft.salary || 'Market Related Salary',
      posted: editingId ? 'Draft update' : 'Draft preview',
      applicationUrl: null,
      summary: draft.summary || 'Role summary preview will appear here once the draft is filled in.',
      responsibilities: draft.responsibilities
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    }
  }, [draft, editingId])

  const resetAccess = () => {
    setStaffMember(null)
    setLoginError('')
    setFormError('')
    setSnackbarMessage('')
    setEditingId(null)
    setDraft({ ...emptyDraft })
  }

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const staffId = String(formData.get('staffId') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const authorized = authorizedStaff.find(
      (staff) =>
        staff.staffId.toLowerCase() === staffId.toLowerCase() &&
        staff.email.toLowerCase() === email,
    )

    if (!authorized) {
      setLoginError('Those credentials do not match an authorized IMFORCE staff account.')
      return
    }

    setLoginError('')
    setStaffMember(authorized)
    setDraft({ ...emptyDraft })
  }

  const beginEdit = (vacancy: RecruiterVacancy) => {
    setEditingId(vacancy.id)
    setDraft(toDraft(vacancy))
    setFormError('')
  }

  const handleDelete = (vacancyId: string) => {
    if (!window.confirm('Delete this vacancy from the recruiter dashboard?')) return
    deleteRecruiterVacancy(vacancyId)
    if (editingId === vacancyId) {
      setEditingId(null)
      setDraft({ ...emptyDraft })
    }
    setSnackbarMessage('Vacancy removed from the recruiter board.')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
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
      salary: draft.salary.trim() || 'Market Related Salary',
      applicationUrl: null,
      summary: draft.summary.trim(),
      responsibilities,
    }

    try {
      if (editingId) {
        updateRecruiterVacancy(editingId, vacancyPayload)
        setSnackbarMessage('Vacancy updated and saved in the recruiter board.')
      } else {
        addRecruiterVacancy(vacancyPayload)
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
                Staff ID
                <input
                  name="staffId"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{1,5}"
                  maxLength={5}
                  title="Enter up to 5 digits."
                  autoComplete="username"
                  required
                />
              </label>

              <label>
                Company email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>

              {loginError && (
                <p className="staff-access-error" role="alert">
                  {loginError}
                </p>
              )}

              <button className="staff-access-submit" type="submit">
                Continue to recruiter dashboard
              </button>
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
                <button className="staff-access-signout" type="button" onClick={resetAccess}>
                  <FiLogOut aria-hidden="true" />
                  Sign out
                </button>
              </div>
            </div>

            <p className="staff-access-description">
              Signed in as <strong>{staffMember.email}</strong>. Create a new job,
              preview the public card, and update or delete existing recruiter posts.
            </p>

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

                    <label>
                      Salary or package
                      <input
                        value={draft.salary}
                        placeholder="For example, R20,000 to R25,000 per month"
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, salary: event.target.value }))
                        }
                      />
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
                      <h4>{previewVacancy.title}</h4>
                      <div className="staff-access-preview__meta">
                        <span>{previewVacancy.location}</span>
                        <span>{previewVacancy.employmentType}</span>
                        <span>{previewVacancy.salary}</span>
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
