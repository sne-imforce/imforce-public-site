import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { FiEdit3, FiEye, FiLogOut, FiSettings, FiTrash2 } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useContactEnquiries } from '../../data/contactEnquiries'
import { industries, type IndustryName } from '../../data/industries'
import {
  createJobOrderAttachmentUrl,
  useJobOrders,
} from '../../data/jobOrders'
import type { JobOrder } from '../../data/jobOrders'
import { useHoneytokenEvents } from '../../data/honeytokens'
import {
  deleteRecruiterVacancy,
  saveRecruiterVacancy,
  useRecruiterVacancies,
} from '../../data/recruiterVacancies'
import type { RecruiterVacancy } from '../../data/recruiterVacancies'
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase'
import './StaffAccessModal.css'

const employmentTypes = ['Permanent', 'Contract', 'Fixed-term', 'Temporary']

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
  salary: string
  urgent: boolean
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
  urgent: false,
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
    urgent: vacancy.urgent ?? false,
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

function shouldSetPasswordFromCurrentUrl() {
  const fragmentType = new URLSearchParams(window.location.hash.slice(1)).get(
    'type',
  )
  const queryType = new URLSearchParams(window.location.search).get('type')
  return ['invite', 'recovery'].includes(fragmentType ?? queryType ?? '')
}

export function StaffAccessPage() {
  const {
    vacancies: recruiterVacancies,
    isLoading: isVacanciesLoading,
    error: vacancyLoadError,
    reload: reloadVacancies,
  } = useRecruiterVacancies()
  const [staffMember, setStaffMember] = useState<StaffMember | null>(null)
  const {
    enquiries,
    isLoading: areEnquiriesLoading,
    error: enquiryLoadError,
    reload: reloadEnquiries,
  } = useContactEnquiries(Boolean(staffMember))
  const {
    jobOrders,
    isLoading: areJobOrdersLoading,
    error: jobOrderLoadError,
    reload: reloadJobOrders,
  } = useJobOrders(Boolean(staffMember))
  const {
    events: trapEvents,
    isLoading: areTrapEventsLoading,
    error: trapEventLoadError,
    reload: reloadTrapEvents,
  } = useHoneytokenEvents(Boolean(staffMember))
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(
    shouldSetPasswordFromCurrentUrl,
  )
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState(
    isSupabaseConfigured()
      ? ''
      : 'Supabase is not configured. Add the project URL and public key to frontend/.env.local.',
  )
  const [loginEmail, setLoginEmail] = useState('')
  const [passwordDraft, setPasswordDraft] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [formError, setFormError] = useState('')
  const [snackbarMessage, setSnackbarMessage] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<VacancyDraft>({ ...emptyDraft })
  const [attachmentLinks, setAttachmentLinks] = useState<Record<string, string>>({})
  const [attachmentLoadingId, setAttachmentLoadingId] = useState('')
  const [attachmentError, setAttachmentError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured()) return

    let active = true
    const supabase = getSupabaseClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setNeedsPasswordSetup(true)
      }
      if (event === 'SIGNED_OUT' && active) {
        setStaffMember(null)
        setAttachmentLinks({})
        setAuthLoading(false)
      }
    })

    void supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (!active) return
        if (error) {
          setLoginError(`Unable to restore the staff session: ${error.message}`)
          return
        }

        const user = data.session?.user
        if (!user) {
          setStaffMember(null)
          return
        }

        const { data: isStaff, error: roleError } =
          await supabase.rpc('is_staff')
        if (!active) return
        if (roleError || !isStaff) {
          await supabase.auth.signOut()
          setLoginError(
            roleError
              ? `Unable to verify staff access: ${roleError.message}`
              : 'This account does not have recruiter access.',
          )
          return
        }

        setStaffMember({ email: user.email ?? '' })
      })
      .catch((error: unknown) => {
        if (!active) return
        setLoginError(
          error instanceof Error
            ? `Unable to restore the staff session: ${error.message}`
            : 'Unable to restore the staff session.',
        )
      })
      .finally(() => {
        if (active) setAuthLoading(false)
      })

    return () => {
      active = false
      subscription.unsubscribe()
    }
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
      urgent: draft.urgent,
    }
  }, [draft, editingId])

  const resetAccess = async () => {
    try {
      const { error } = await getSupabaseClient().auth.signOut()
      if (error) throw error
      setStaffMember(null)
      setAttachmentLinks({})
    } catch (error) {
      setSnackbarMessage(
        error instanceof Error ? error.message : 'Unable to sign out.',
      )
    }
    setLoginError('')
    setFormError('')
    setEditingId(null)
    setDraft({ ...emptyDraft })
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '')
    setLoginEmail(email)

    setLoginLoading(true)
    setLoginError('')
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error || !data.user) {
        throw new Error(error?.message ?? 'Unable to sign in.')
      }

      const { data: isStaff, error: roleError } =
        await supabase.rpc('is_staff')
      if (roleError || !isStaff) {
        await supabase.auth.signOut()
        throw new Error(
          roleError?.message ??
            'This account does not have recruiter access. Contact an administrator.',
        )
      }

      setStaffMember({ email: data.user.email ?? email })
      setDraft({ ...emptyDraft })
      await reloadVacancies()
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : 'Unable to sign in.',
      )
    } finally {
      setLoginLoading(false)
    }
  }

  const handlePasswordReset = async () => {
    const email = loginEmail.trim().toLowerCase()
    if (!email) {
      setLoginError('Enter your company email address first.')
      return
    }

    try {
      const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
        email,
        { redirectTo: `${window.location.origin}/admin` },
      )
      if (error) throw error
      setLoginError(
        'If that account exists, a password setup link has been sent to its email.',
      )
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : 'Unable to send a password setup link.',
      )
    }
  }

  const handlePasswordSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginError('')
    if (passwordDraft.length < 12) {
      setLoginError('Choose a password with at least 12 characters.')
      return
    }
    if (passwordDraft !== passwordConfirmation) {
      setLoginError('The password entries do not match.')
      return
    }

    try {
      const { error } = await getSupabaseClient().auth.updateUser({
        password: passwordDraft,
      })
      if (error) throw error
      setPasswordDraft('')
      setPasswordConfirmation('')
      setNeedsPasswordSetup(false)
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}`,
      )
      setSnackbarMessage('Your password has been updated.')
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : 'Unable to update password.',
      )
    }
  }

  const beginEdit = (vacancy: RecruiterVacancy) => {
    setEditingId(vacancy.id)
    setDraft(toDraft(vacancy))
    setFormError('')
  }

  const handleDelete = async (vacancyId: string) => {
    if (!window.confirm('Delete this vacancy from the recruiter dashboard?')) return
    try {
      await deleteRecruiterVacancy(vacancyId)
      await reloadVacancies()
      if (editingId === vacancyId) {
        setEditingId(null)
        setDraft({ ...emptyDraft })
      }
      setSnackbarMessage('Vacancy removed from the recruiter board.')
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to delete vacancy.',
      )
    }
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

    const vacancyPayload = {
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
      urgent: draft.urgent,
    }

    try {
      await saveRecruiterVacancy(vacancyPayload, editingId)
      await reloadVacancies()
      setSnackbarMessage(
        editingId
          ? 'Vacancy updated in the public listings.'
          : 'Vacancy published to the public listings.',
      )

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

  const openJobOrderAttachment = async (jobOrder: JobOrder) => {
    if (!jobOrder.attachment_path || !jobOrder.attachment_name) return

    setAttachmentLoadingId(jobOrder.id)
    setAttachmentError('')
    try {
      const url = await createJobOrderAttachmentUrl(
        jobOrder.attachment_path,
        jobOrder.attachment_name,
      )
      setAttachmentLinks((current) => ({ ...current, [jobOrder.id]: url }))
    } catch (error) {
      setAttachmentError(
        error instanceof Error ? error.message : 'Unable to open attachment.',
      )
    } finally {
      setAttachmentLoadingId('')
    }
  }

  return (
    <main className="staff-access-page">
      <div className="staff-access-page__shell">
        {authLoading ? (
          <section className="staff-access-panel staff-access-panel--page staff-access-panel--login">
            <p className="staff-access-description" role="status">
              Checking your secure staff session…
            </p>
          </section>
        ) : needsPasswordSetup && staffMember ? (
          <section className="staff-access-panel staff-access-panel--page staff-access-panel--login">
            <div className="staff-access-page__topbar">
              <div>
                <p className="staff-access-eyebrow">IMFORCE team</p>
                <h1>Set your password</h1>
              </div>
              <Link className="staff-access-home" to="/">
                HOME
              </Link>
            </div>
            <p className="staff-access-description">
              Choose a password for your recruiter account.
            </p>
            <form className="staff-access-form" onSubmit={handlePasswordSetup}>
              <label>
                New password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={passwordDraft}
                  onChange={(event) => setPasswordDraft(event.target.value)}
                  required
                />
              </label>
              <label>
                Confirm password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={passwordConfirmation}
                  onChange={(event) =>
                    setPasswordConfirmation(event.target.value)
                  }
                  required
                />
              </label>
              {loginError && (
                <p className="staff-access-error" role="alert">
                  {loginError}
                </p>
              )}
              <button className="staff-access-submit" type="submit">
                Save password
              </button>
            </form>
          </section>
        ) : !staffMember ? (
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
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>

              {loginError && (
                <p className="staff-access-error" role="alert">
                  {loginError}
                </p>
              )}

              <button
                className="staff-access-submit"
                type="submit"
                disabled={loginLoading || !isSupabaseConfigured()}
              >
                {loginLoading ? 'Signing in…' : 'Sign in'}
              </button>
              <button
                className="staff-access-secondary"
                type="button"
                onClick={() => void handlePasswordReset()}
                disabled={!isSupabaseConfigured()}
              >
                Set or reset password by email
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
              Signed in as <strong>{staffMember.email}</strong>
            </p>

            <section className="staff-access-page__list" aria-labelledby="trap-alerts-title">
              <div className="staff-access-page__list-header">
                <h2 id="trap-alerts-title">Trap alerts</h2>
                <span>{trapEvents.length}</span>
              </div>
              <p className="staff-access-description">
                These are decoy paths, fake secrets, and hidden form fields.
                A hit means someone probed a trap, not a real system.
              </p>
              {trapEventLoadError && (
                <p className="staff-access-error" role="alert">
                  {trapEventLoadError}
                </p>
              )}
              {areTrapEventsLoading ? (
                <p className="staff-access-description" role="status">
                  Loading trap alerts…
                </p>
              ) : trapEvents.length === 0 ? (
                <p className="staff-access-description">
                  No trap alerts have been recorded.
                </p>
              ) : (
                <>
                  {trapEvents.map((event) => (
                    <article className="staff-access-enquiry" key={event.id}>
                      <div className="staff-access-enquiry__heading">
                        <strong>{event.trap_id}</strong>
                        <time dateTime={event.created_at}>
                          {new Date(event.created_at).toLocaleString('en-ZA')}
                        </time>
                      </div>
                      <p>{event.path}</p>
                      <p>
                        {event.client_ip ?? 'Unknown IP'}
                        {event.detail ? ` · ${event.detail}` : ''}
                      </p>
                      {event.user_agent && (
                        <p className="staff-access-enquiry__message">
                          {event.user_agent}
                        </p>
                      )}
                    </article>
                  ))}
                  <button
                    className="staff-access-secondary"
                    type="button"
                    onClick={() => void reloadTrapEvents()}
                    disabled={areTrapEventsLoading}
                  >
                    Refresh trap alerts
                  </button>
                </>
              )}
            </section>

            <section className="staff-access-page__list" aria-labelledby="enquiries-title">
              <div className="staff-access-page__list-header">
                <h2 id="enquiries-title">Recent contact enquiries</h2>
                <span>{enquiries.length}</span>
              </div>
              {enquiryLoadError && (
                <p className="staff-access-error" role="alert">
                  {enquiryLoadError}
                </p>
              )}
              {areEnquiriesLoading ? (
                <p className="staff-access-description" role="status">
                  Loading contact enquiries…
                </p>
              ) : enquiries.length === 0 ? (
                <p className="staff-access-description">
                  No contact enquiries have been received.
                </p>
              ) : (
                <>
                  {enquiries.map((enquiry) => (
                    <article className="staff-access-enquiry" key={enquiry.id}>
                      <div className="staff-access-enquiry__heading">
                        <strong>{enquiry.subject}</strong>
                        <time dateTime={enquiry.created_at}>
                          {new Date(enquiry.created_at).toLocaleString('en-ZA')}
                        </time>
                      </div>
                      <p>
                        {enquiry.name} ·{' '}
                        <a href={`mailto:${encodeURIComponent(enquiry.email)}`}>
                          {enquiry.email}
                        </a>
                        {enquiry.phone && ` · ${enquiry.phone}`}
                      </p>
                      <p>{enquiry.enquiry_type}</p>
                      <p className="staff-access-enquiry__message">
                        {enquiry.message}
                      </p>
                    </article>
                  ))}
                  <button
                    className="staff-access-secondary"
                    type="button"
                    onClick={() => void reloadEnquiries()}
                    disabled={areEnquiriesLoading}
                  >
                    Refresh enquiries
                  </button>
                </>
              )}
            </section>

            <section className="staff-access-page__list" aria-labelledby="job-orders-title">
              <div className="staff-access-page__list-header">
                <h2 id="job-orders-title">Recent job-order requests</h2>
                <span>{jobOrders.length}</span>
              </div>
              {jobOrderLoadError && (
                <p className="staff-access-error" role="alert">
                  {jobOrderLoadError}
                </p>
              )}
              {attachmentError && (
                <p className="staff-access-error" role="alert">
                  {attachmentError}
                </p>
              )}
              {areJobOrdersLoading ? (
                <p className="staff-access-description" role="status">
                  Loading job-order requests…
                </p>
              ) : jobOrders.length === 0 ? (
                <p className="staff-access-description">
                  No job-order requests have been received.
                </p>
              ) : (
                <>
                  {jobOrders.map((jobOrder) => (
                    <article className="staff-access-enquiry" key={jobOrder.id}>
                      <div className="staff-access-enquiry__heading">
                        <strong>{jobOrder.job_title} · {jobOrder.legal_company_name}</strong>
                        <time dateTime={jobOrder.created_at}>
                          {new Date(jobOrder.created_at).toLocaleString('en-ZA')}
                        </time>
                      </div>
                      <p>
                        {jobOrder.contact_name} ·{' '}
                        <a href={`mailto:${encodeURIComponent(jobOrder.contact_email)}`}>
                          {jobOrder.contact_email}
                        </a>
                        {' · '}{jobOrder.contact_phone}
                      </p>
                      <p>
                        Registration: {jobOrder.registration_number}
                        {jobOrder.vat_number && ` · VAT: ${jobOrder.vat_number}`}
                      </p>
                      {jobOrder.trading_name && <p>Trading as: {jobOrder.trading_name}</p>}
                      <p>Company address: {jobOrder.company_address}</p>
                      <p>
                        {jobOrder.number_of_hires} hire(s) · {jobOrder.employment_type}
                        {' · '}{jobOrder.job_location} · {jobOrder.salary}
                        {' · '}Closing: {jobOrder.closing_date}
                      </p>
                      <p>Working hours: {jobOrder.working_hours}</p>
                      <p>
                        Billing: {jobOrder.billing_contact} · {jobOrder.billing_address}
                      </p>
                      <p className="staff-access-enquiry__message">
                        <strong>Duties:</strong> {jobOrder.duties}
                      </p>
                      <p className="staff-access-enquiry__message">
                        <strong>Requirements:</strong> {jobOrder.requirements}
                      </p>
                      <p className="staff-access-enquiry__message">
                        <strong>Qualifications:</strong> {jobOrder.qualifications}
                      </p>
                      {jobOrder.attachment_path && jobOrder.attachment_name && (
                        <>
                          {attachmentLinks[jobOrder.id] && (
                          <a
                            href={attachmentLinks[jobOrder.id]}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Download {jobOrder.attachment_name} (link expires in 60 seconds)
                          </a>
                          )}
                          <button
                            className="staff-access-secondary"
                            type="button"
                            onClick={() => void openJobOrderAttachment(jobOrder)}
                            disabled={attachmentLoadingId === jobOrder.id}
                          >
                            {attachmentLoadingId === jobOrder.id
                              ? 'Preparing secure download…'
                              : attachmentLinks[jobOrder.id]
                                ? 'Generate a new download link'
                                : `Prepare download: ${jobOrder.attachment_name}`}
                          </button>
                        </>
                      )}
                    </article>
                  ))}
                  <button
                    className="staff-access-secondary"
                    type="button"
                    onClick={() => void reloadJobOrders()}
                    disabled={areJobOrdersLoading}
                  >
                    Refresh job-order requests
                  </button>
                </>
              )}
            </section>

            <div className="staff-access-page__layout">
              <div className="staff-access-page__main">
                {vacancyLoadError && (
                  <p className="staff-access-error" role="alert">
                    {vacancyLoadError}
                  </p>
                )}
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

                    <label className="staff-access-paid-check">
                      <input
                        type="checkbox"
                        checked={draft.urgent}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            urgent: event.target.checked,
                          }))
                        }
                      />
                      <span>Mark this vacancy as urgent</span>
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

                  {isVacanciesLoading ? (
                    <p className="staff-access-description" role="status">
                      Loading vacancies…
                    </p>
                  ) : recruiterVacancies.length === 0 ? (
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
