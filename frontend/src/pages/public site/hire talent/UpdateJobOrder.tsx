import { useEffect, useState, type FormEvent } from 'react'
import { FiAlertCircle, FiCheck, FiPhone } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import Navbar from '../../../components/public/Navbar'
import DatePicker from '../../../components/ui/DatePicker'
import Spinner, { LoadingBlock } from '../../../components/ui/Spinner'
import { openJobOrderChanges, submitJobOrderChanges, type FieldIssue, type JobOrderChanges } from '../../../data/api'
import { formatDateDmy } from '../../../utils/dates'
import './Employers.css'
import './UpdateJobOrder.css'

type Field = { name: string; label: string; required?: boolean; multiline?: boolean; type?: 'select' | 'date' | 'number'; hint?: string; maxLength?: number }

const sections: Array<{ title: string; fields: Field[] }> = [
  {
    title: 'Company and contact details',
    fields: [
      { name: 'legalName', label: 'Legal company name', required: true },
      { name: 'tradingName', label: 'Trading name' },
      { name: 'registrationNumber', label: 'Company registration number', required: true },
      { name: 'vatNumber', label: 'VAT number' },
      { name: 'companyAddress', label: 'Company street address', required: true },
      { name: 'contactName', label: 'Contact person', required: true },
      { name: 'phone', label: 'Contact phone', required: true },
      { name: 'billingContact', label: 'Billing contact', required: true },
      { name: 'billingAddress', label: 'Billing address', required: true },
    ],
  },
  {
    title: 'Job details',
    fields: [
      { name: 'jobTitle', label: 'Job title', required: true },
      { name: 'jobLocation', label: 'Job location', required: true },
      { name: 'numberOfHires', label: 'Number of people to hire', required: true, type: 'number' },
      { name: 'employmentType', label: 'Employment type', required: true, type: 'select' },
      { name: 'workingHours', label: 'Working hours', required: true },
      { name: 'salary', label: 'Salary or salary range', required: true },
      { name: 'closingDate', label: 'Closing date', required: true, type: 'date' },
      { name: 'duties', label: 'Main duties', required: true, multiline: true, hint: 'At least 40 characters.' },
      { name: 'requirements', label: 'Skills and requirements', required: true, multiline: true, hint: 'At least 25 characters.' },
      { name: 'qualifications', label: 'Qualifications and experience', required: true, multiline: true, hint: 'At least 20 characters.' },
    ],
  },
]
const employmentTypes = ['Permanent', 'Fixed-term', 'Contract', 'Temporary']

type State =
  | { phase: 'loading' }
  | { phase: 'invalid'; message: string }
  | { phase: 'editing'; order: JobOrderChanges }
  | { phase: 'done'; reference: string }

// Read the private token once, then remove it from the address bar so it is not
// left in browser history, screenshots or a shared screen.
function takeTokenFromUrl() {
  const match = window.location.hash.match(/token=([A-Za-z0-9_-]{43})/)
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  return match?.[1] ?? ''
}

/** /employers/update-job-order#token=…: the employer updates a job order after IMFORCE asked for changes. */
export default function UpdateJobOrder() {
  const [token] = useState(takeTokenFromUrl)
  const [state, setState] = useState<State>(token ? { phase: 'loading' } : { phase: 'invalid', message: 'This page needs the private link from your IMFORCE email.' })
  const [values, setValues] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState(false)
  const [issues, setIssues] = useState<FieldIssue[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token) return
    let active = true
    openJobOrderChanges(token).then(
      (order) => { if (active) { setValues(order.details); setState({ phase: 'editing', order }) } },
      (cause: unknown) => { if (active) setState({ phase: 'invalid', message: cause instanceof Error ? cause.message : 'This link could not be opened.' }) },
    )
    return () => { active = false }
  }, [token])

  const set = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }))
  const issueFor = (name: string) => issues.find((issue) => issue.field === name)?.message

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    setSaving(true); setError(''); setIssues([])
    const { email, ...editable } = values
    void email // The contact email cannot be changed here.
    try {
      const result = await submitJobOrderChanges(token, { ...editable, authorizedContact: confirmed })
      setState({ phase: 'done', reference: result.reference })
      window.scrollTo({ top: 0 })
    } catch (cause) {
      const failure = cause as Error & { issues?: FieldIssue[]; status?: number }
      if (failure.status === 404) setState({ phase: 'invalid', message: failure.message })
      setIssues(failure.issues ?? [])
      setError(failure.message)
      document.getElementById('update-errors')?.focus()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Navbar />
      <main className="employers-page update-order">
        <section className="employers-hero" aria-labelledby="update-title">
          <div className="employers-shell employers-hero__inner">
            <p className="employers-eyebrow">For employers</p>
            <h1 id="update-title">Update your job order</h1>
            <p className="employers-hero__intro">Make the changes our team asked for and send your job order back for review. You do not need to pay again.</p>
          </div>
        </section>

        <section className="employers-request employers-shell" aria-live="polite">
          {state.phase === 'loading' && <LoadingBlock label="Opening your job order…" />}

          {state.phase === 'invalid' && (
            <div className="update-order__message update-order__message--warning" role="alert">
              <FiAlertCircle aria-hidden="true" />
              <div>
                <h2>This link can’t be used</h2>
                <p>{state.message}</p>
                <p>Links work once and expire after 7 days. Reply to the IMFORCE email or call <a href="tel:0334920600">033 492 0600</a> and we’ll send you a new one.</p>
                <Link className="employers-button employers-button--primary" to="/contact">Contact IMFORCE</Link>
              </div>
            </div>
          )}

          {state.phase === 'done' && (
            <div className="update-order__message update-order__message--success" role="status">
              <span className="update-order__tick" aria-hidden="true"><FiCheck /></span>
              <div>
                <h2>Thank you. Your job order is back with our team.</h2>
                <p>We’ll review your changes ({state.reference}) and let you know once your advert is approved. This link has now been used and no longer works.</p>
                <p className="update-order__phone"><FiPhone aria-hidden="true" /> <span>Questions? Call <a href="tel:0334920600">033 492 0600</a>.</span></p>
              </div>
            </div>
          )}

          {state.phase === 'editing' && (
            <form className="employers-form" onSubmit={handleSubmit} noValidate>
              <div className="update-order__request">
                <h2>What IMFORCE asked you to change</h2>
                <blockquote>{state.order.reason}</blockquote>
                <p>Job order {state.order.reference} · This private link expires on {formatDateDmy(state.order.expiresAt)}. Do not forward it.</p>
              </div>

              {(error || issues.length > 0) && (
                <div className="employers-form-errors" id="update-errors" tabIndex={-1} role="alert">
                  <h3>{error || 'Please correct the highlighted fields.'}</h3>
                  {issues.length > 0 && (
                    <ul>
                      {issues.map((issue) => <li key={`${issue.field}-${issue.message}`}><a href={`#field-${issue.field}`}>{issue.message}</a></li>)}
                    </ul>
                  )}
                </div>
              )}

              {sections.map((section) => (
                <fieldset key={section.title} className="employers-form__section">
                  <legend>{section.title}</legend>
                  <div className="employers-form__grid">
                    {section.fields.map((field) => {
                      const problem = issueFor(field.name)
                      const describedBy = [field.hint ? `hint-${field.name}` : '', problem ? `error-${field.name}` : ''].filter(Boolean).join(' ') || undefined
                      if (field.type === 'date') {
                        return (
                          <div key={field.name} className="employers-form__field" id={`field-${field.name}`}>
                            <DatePicker id={`input-${field.name}`} label={`${field.label} *`} value={values[field.name] ?? ''} onChange={(value) => set(field.name, value)} required />
                            {problem && <span className="update-order__field-error" id={`error-${field.name}`}>{problem}</span>}
                          </div>
                        )
                      }
                      return (
                        <label key={field.name} id={`field-${field.name}`} className={`employers-form__field${field.multiline ? ' employers-form__field--full' : ''}`}>
                          {field.label}{field.required ? ' *' : ''}
                          {field.type === 'select' ? (
                            <select value={values[field.name] ?? ''} onChange={(event) => set(field.name, event.target.value)} aria-invalid={Boolean(problem)} aria-describedby={describedBy}>
                              <option value="" disabled>Choose a type</option>
                              {employmentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                            </select>
                          ) : field.multiline ? (
                            <textarea rows={4} maxLength={5000} value={values[field.name] ?? ''} onChange={(event) => set(field.name, event.target.value)} aria-invalid={Boolean(problem)} aria-describedby={describedBy} />
                          ) : (
                            <input
                              value={values[field.name] ?? ''}
                              inputMode={field.type === 'number' ? 'numeric' : undefined}
                              maxLength={field.type === 'number' ? 4 : 500}
                              onChange={(event) => set(field.name, event.target.value)}
                              aria-invalid={Boolean(problem)}
                              aria-describedby={describedBy}
                            />
                          )}
                          {field.hint && <span className="update-order__hint" id={`hint-${field.name}`}>{field.hint}</span>}
                          {problem && <span className="update-order__field-error" id={`error-${field.name}`}>{problem}</span>}
                        </label>
                      )
                    })}
                    {section.title === 'Company and contact details' && (
                      <label className="employers-form__field">
                        Contact email
                        <input value={values.email ?? ''} readOnly aria-describedby="hint-email" />
                        <span className="update-order__hint" id="hint-email">To change the email address, contact IMFORCE.</span>
                      </label>
                    )}
                  </div>
                </fieldset>
              ))}

              <label className="employers-form__checkbox" id="field-authorizedContact">
                <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                I confirm I am allowed to share these job details with IMFORCE for this job order.
              </label>
              {issueFor('authorizedContact') && <p className="update-order__field-error">{issueFor('authorizedContact')}</p>}

              <div className="employers-form__actions">
                <button className="employers-button employers-button--primary" type="submit" disabled={saving} aria-busy={saving}>
                  {saving ? <Spinner label="Sending…" size="sm" tone="light" /> : 'Send my changes for review'}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </>
  )
}
