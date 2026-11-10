import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DatePicker from '../../../components/ui/DatePicker'
import { submitEmployerInquiry } from '../../../data/api'
import { formatDateDmy } from '../../../utils/dates'
import Navbar from '../../../components/public/Navbar'
import './Employers.css'

const processSteps = [
  {
    title: 'Tell us about your role',
    description: 'Share the job, location, number of hires and the skills you need.',
  },
  {
    title: 'Confirm the details',
    description: 'We check the job order with you and provide the recruitment agreement.',
  },
  {
    title: 'Pay the activation fee',
    description: 'Pay the fee for the job order before recruitment work begins.',
  },
  {
    title: 'We review the advert',
    description: 'An IMFORCE team member must approve the advert before it goes online.',
  },
]

const companyReviewFields = [
  ['legalName', 'Legal company name'],
  ['tradingName', 'Trading name'],
  ['registrationNumber', 'Company registration number'],
  ['vatNumber', 'VAT number'],
  ['companyAddress', 'Company street address'],
  ['contactName', 'Contact person'],
  ['email', 'Contact email'],
  ['phone', 'Contact phone'],
  ['billingContact', 'Billing contact'],
  ['billingAddress', 'Billing address'],
] as const

const jobReviewFields = [
  ['jobTitle', 'Job title'],
  ['jobLocation', 'Job location'],
  ['numberOfHires', 'Number of people to hire'],
  ['employmentType', 'Employment type'],
  ['workingHours', 'Working hours'],
  ['salary', 'Salary or salary range'],
  ['closingDate', 'Closing date'],
  ['duties', 'Main duties'],
  ['requirements', 'Skills and requirements'],
  ['qualifications', 'Qualifications and experience'],
  ['authorizedContact', 'Authority to share these details'],
] as const

type ReviewItem = {
  label: string
  value: string
}

type JobOrderReview = {
  company: ReviewItem[]
  job: ReviewItem[]
}

type StoredDraft = Record<string, string | boolean>

const draftStorageKey = 'imforce-employer-job-order-draft'

const salaryPrefillFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  currencyDisplay: 'code',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatSalaryPrefill(monthlySalary: string) {
  const salary = Number(monthlySalary)
  if (!Number.isFinite(salary) || salary <= 0) return monthlySalary.trim()
  return `${salaryPrefillFormatter.format(salary)} per month`
}

function isDraftControl(
  control: Element,
): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return (
    (control instanceof HTMLInputElement ||
      control instanceof HTMLSelectElement ||
      control instanceof HTMLTextAreaElement) &&
    Boolean(control.name) &&
    !(control instanceof HTMLInputElement && control.type === 'file')
  )
}

function applyControlValue(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string | boolean,
) {
  if (control instanceof HTMLInputElement && control.type === 'checkbox') {
    control.checked = value === true
    return
  }
  if (typeof value === 'string') {
    control.value = value
  }
}

function readFormDraft(form: HTMLFormElement): StoredDraft {
  const draft: StoredDraft = {}
  for (const control of Array.from(form.elements)) {
    if (!isDraftControl(control)) continue
    draft[control.name] =
      control instanceof HTMLInputElement && control.type === 'checkbox'
        ? control.checked
        : control.value
  }
  return draft
}

function isStoredDraft(value: unknown): value is StoredDraft {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (field) => typeof field === 'string' || typeof field === 'boolean',
    )
  )
}

function readStoredDraft(): { draft: StoredDraft | null; status: string } {
  let savedDraft: string | null
  try {
    savedDraft = sessionStorage.getItem(draftStorageKey)
  } catch {
    return {
      draft: null,
      status:
        'This browser could not access saved drafts. Keep this page open to avoid losing your answers.',
    }
  }

  if (!savedDraft) {
    return {
      draft: null,
      status:
        'Your answers are saved in this browser tab as you fill in the form.',
    }
  }

  let parsedDraft: unknown
  try {
    parsedDraft = JSON.parse(savedDraft)
  } catch {
    return {
      draft: null,
      status:
        'The saved draft could not be read. Clear it below before entering your details.',
    }
  }

  if (!isStoredDraft(parsedDraft)) {
    return {
      draft: null,
      status:
        'The saved draft has an invalid format. Clear it below before entering your details.',
    }
  }

  return {
    draft: parsedDraft,
    status:
      'Your saved answers were restored. Selected files must be added again.',
  }
}

function Employers() {
  const [searchParams] = useSearchParams()
  const jobTitlePrefill = searchParams.get('jobTitle')?.trim() ?? ''
  const monthlySalaryPrefill = searchParams.get('monthlySalary')?.trim() ?? ''
  const numberOfHiresPrefill = searchParams.get('numberOfHires')?.trim() ?? ''
  const hasPrefill = Boolean(
    jobTitlePrefill || monthlySalaryPrefill || numberOfHiresPrefill,
  )
  const [jobDescriptionName, setJobDescriptionName] = useState('')
  const [review, setReview] = useState<JobOrderReview | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submissionStatus, setSubmissionStatus] = useState('')
  const [initialDraft] = useState(readStoredDraft)
  const [closingDate, setClosingDate] = useState(
    typeof initialDraft.draft?.closingDate === 'string' ? initialDraft.draft.closingDate : '',
  )
  const [hasSavedDraft, setHasSavedDraft] = useState(
    initialDraft.draft !== null || hasPrefill,
  )
  const [draftStatus, setDraftStatus] = useState(
    hasPrefill
      ? 'The position title, salary and number of hires were filled from the fee calculator. Selected files are not saved.'
      : initialDraft.status,
  )
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const handleClosingDateChange = (value: string) => {
    setClosingDate(value)
    const form = formRef.current
    if (!form) return
    const draft = readFormDraft(form)
    draft.closingDate = value
    try {
      sessionStorage.setItem(draftStorageKey, JSON.stringify(draft))
      setHasSavedDraft(true)
      setDraftStatus('Your answers are saved in this browser tab. Selected files are not saved.')
    } catch {
      setDraftStatus('This browser could not save your draft. Keep this page open or copy your answers before refreshing.')
    }
  }

  useEffect(() => {
    const form = formRef.current
    if (!form) return

    if (initialDraft.draft) {
      for (const control of Array.from(form.elements)) {
        if (!isDraftControl(control)) continue
        const value = initialDraft.draft[control.name]
        if (value === undefined) continue
        applyControlValue(control, value)
      }
    }

    const prefill: Array<[string, string]> = []

    if (jobTitlePrefill) prefill.push(['jobTitle', jobTitlePrefill])
    if (monthlySalaryPrefill) {
      prefill.push(['salary', formatSalaryPrefill(monthlySalaryPrefill)])
    }
    if (numberOfHiresPrefill) {
      prefill.push(['numberOfHires', numberOfHiresPrefill])
    }

    if (prefill.length === 0) return

    for (const [name, value] of prefill) {
      const control = form.elements.namedItem(name)
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) {
        applyControlValue(control, value)
      }
    }

    try {
      sessionStorage.setItem(
        draftStorageKey,
        JSON.stringify(readFormDraft(form)),
      )
    } catch {
      queueMicrotask(() => {
        setDraftStatus(
          'The position details were filled from the fee calculator, but this browser could not save the draft.',
        )
      })
    }

    document.getElementById('job-order')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [
    initialDraft,
    jobTitlePrefill,
    monthlySalaryPrefill,
    numberOfHiresPrefill,
    searchParams,
  ])

  useEffect(() => {
    if (!review) return

    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()

    return () => {
      if (dialog.open) dialog.close()
    }
  }, [review])

  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    const previousDescription = description?.content

    document.title = 'For Employers | Permanent Staffing | IMFORCE Talent Recruitment'
    if (description) {
      description.content =
        'Hire permanent staff with IMFORCE Talent Recruitment. Share your job requirements, complete the job order process and track recruitment progress.'
    }

    return () => {
      document.title = previousTitle
      if (description && previousDescription !== undefined) {
        description.content = previousDescription
      }
    }
  }, [])

  return (
    <>
      <Navbar />
      <main className="employers-page">
        <section className="employers-hero" aria-labelledby="employers-title">
          <div className="employers-shell employers-hero__inner">
            <p className="employers-eyebrow">For employers</p>
            <h1 id="employers-title">Find the right people for your team.</h1>
            <p className="employers-hero__intro">
              IMFORCE helps South African businesses find staff for permanent
              roles. Tell us who you need, and we will guide you through the
              next steps.
            </p>
            <div className="employers-hero__actions">
              <a className="employers-button" href="#job-order">
                Start a job order
              </a>
              <Link
                className="employers-button employers-button--outline"
                to="/fee-calculator"
              >
                Estimate placement fees
              </Link>
            </div>
          </div>
        </section>

        <section
          className="employers-section employers-shell"
          aria-labelledby="how-it-works"
        >
          <div className="employers-section__heading">
            <p className="employers-eyebrow employers-eyebrow--blue">
              How it works
            </p>
            <h2 id="how-it-works">A clear path from job order to hiring.</h2>
            <p>
              You share the job details. Our team checks the advert before
              candidates can see it.
            </p>
          </div>

          <div className="employers-steps">
            {processSteps.map((step, index) => (
              <article className="employers-step" key={step.title}>
                <span className="employers-step__number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>

          <aside className="employers-warning">
            <strong>Important:</strong> Paying the activation fee does not
            publish your job automatically. An authorized IMFORCE team member
            must approve it first.
          </aside>
        </section>

        <section
          className="employers-fee"
          aria-labelledby="activation-fee-title"
        >
          <div className="employers-shell employers-fee__inner">
            <div>
              <p className="employers-eyebrow employers-eyebrow--blue">
                Job activation
              </p>
              <h2 id="activation-fee-title">
                One activation fee for each job order.
              </h2>
              <p>
                The ZAR 499 fee covers one job description, even if you are hiring
                more than one person for that role. The fee is separate from
                the placement fee. VAT treatment is still to be confirmed by
                IMFORCE Finance.
              </p>
              <p>
                If a job is paused or cancelled, the activation fee is not
                refunded. Restarting within 90 days does not need another fee.
                After 90 days, a new ZAR 499 fee is needed.
              </p>
            </div>
            <div className="employers-fee__amount" aria-label="ZAR 499 per job order">
              <strong>ZAR 499</strong>
              <span>per job order, not per hire</span>
            </div>
          </div>
        </section>

        <section
          className="employers-request employers-shell"
          id="job-order"
          aria-labelledby="job-order-title"
        >
          <div className="employers-request__heading">
            <p className="employers-eyebrow employers-eyebrow--blue">
              Job order
            </p>
            <h2 id="job-order-title">
              Tell us about your company and the role.
            </h2>
            <p>
              Add the details below to preview the job order. Fields marked
              required must be filled in.
            </p>
          </div>

          <aside className="employers-form-notice">
            Your answers are saved in this browser tab while you complete the
            form. They are sent to IMFORCE only when you confirm the job order.
            The selected job-description file is not uploaded. Clear your
            saved draft when finished.
          </aside>
          {hasSavedDraft && (
            <div className="employers-form__draft-controls">
              <p className="employers-form__draft-status" role="status" aria-live="polite">
                {draftStatus}
              </p>
              <button
                className="employers-form__clear-draft"
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.removeItem(draftStorageKey)
                  } catch {
                    setDraftStatus('This browser could not clear the saved draft.')
                    return
                  }
                  formRef.current?.reset()
                  setClosingDate('')
                  setJobDescriptionName('')
                  setReview(null)
                  setSubmissionStatus('')
                  setHasSavedDraft(false)
                }}
              >
                Clear saved draft
              </button>
            </div>
          )}

          <form
            className="employers-form"
            ref={formRef}
            onSubmit={(event) => {
              event.preventDefault()
              const formData = new FormData(event.currentTarget)
              const readFields = (
                fields: ReadonlyArray<readonly [string, string]>,
              ) =>
                fields.map(([name, label]) => {
                  const value = formData.get(name)
                  return {
                    label,
                    value:
                      name === 'authorizedContact'
                        ? value === 'on'
                          ? 'Confirmed'
                          : 'Not confirmed'
                        : name === 'closingDate'
                          ? formatDateDmy(String(value ?? '')) || 'Not provided'
                          : String(value ?? '').trim() || 'Not provided',
                  }
                })

              setSubmissionStatus('')
              setReview({
                company: readFields(companyReviewFields),
                job: readFields(jobReviewFields),
              })
            }}
            onChange={(event) => {
              const draft = readFormDraft(event.currentTarget)

              try {
                sessionStorage.setItem(draftStorageKey, JSON.stringify(draft))
                setHasSavedDraft(true)
                setDraftStatus(
                  'Your answers are saved in this browser tab. Selected files are not saved.',
                )
              } catch {
                setDraftStatus(
                  'This browser could not save your draft. Keep this page open or copy your answers before refreshing.',
                )
              }
            }}
          >
            <fieldset className="employers-form__section">
              <legend>1. Company and contact details</legend>
              <div className="employers-form__grid">
                <label className="employers-form__field">
                  Legal company name *
                  <input name="legalName" autoComplete="organization" required />
                </label>
                <label className="employers-form__field">
                  Trading name
                  <input name="tradingName" />
                </label>
                <label className="employers-form__field">
                  Company registration number *
                  <input name="registrationNumber" required />
                </label>
                <label className="employers-form__field">
                  VAT number
                  <input name="vatNumber" />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Company street address *
                  <input
                    name="companyAddress"
                    autoComplete="street-address"
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Contact person *
                  <input name="contactName" autoComplete="name" required />
                </label>
                <label className="employers-form__field">
                  Contact email *
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Contact phone *
                  <input name="phone" type="tel" autoComplete="tel" required />
                </label>
                <label className="employers-form__field">
                  Billing contact *
                  <input name="billingContact" required />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Billing address *
                  <input name="billingAddress" required />
                </label>
              </div>
            </fieldset>

            <fieldset className="employers-form__section">
              <legend>2. Job details</legend>
              <div className="employers-form__grid">
                <label className="employers-form__field">
                  Job title *
                  <input name="jobTitle" required />
                </label>
                <label className="employers-form__field">
                  Job location *
                  <input name="jobLocation" required />
                </label>
                <label className="employers-form__field">
                  Number of people to hire *
                  <input
                    name="numberOfHires"
                    type="number"
                    min="1"
                    step="1"
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Employment type *
                  <select name="employmentType" required defaultValue="">
                    <option value="" disabled>
                      Choose a type
                    </option>
                    <option value="Permanent">Permanent</option>
                    <option value="Fixed-term">Fixed-term</option>
                    <option value="Contract">Contract</option>
                  </select>
                </label>
                <label className="employers-form__field">
                  Working hours *
                  <input
                    name="workingHours"
                    placeholder="For example, Monday to Friday, 8 am to 5 pm"
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Salary option *
                  <select
                    name="salaryType"
                    defaultValue="specified"
                    required
                    onChange={(event) => {
                      const salaryField =
                        event.currentTarget.form?.elements.namedItem('salary')
                      if (!(salaryField instanceof HTMLInputElement)) return
                      salaryField.value =
                        event.currentTarget.value === 'market'
                          ? 'Market Related Salary'
                          : ''
                    }}
                  >
                    <option value="specified">Enter salary / range</option>
                    <option value="market">Market Related Salary</option>
                  </select>
                </label>
                <label className="employers-form__field">
                  Salary or salary range *
                  <input
                    name="salary"
                    placeholder="For example, ZAR 20,000 to ZAR 25,000 per month"
                    required
                  />
                </label>
                <DatePicker
                  id="employer-closing-date"
                  name="closingDate"
                  className="employers-form__field"
                  label="Closing date *"
                  value={closingDate}
                  onChange={handleClosingDateChange}
                  required
                />
                <label className="employers-form__field employers-form__field--full">
                  Main duties *
                  <textarea name="duties" rows={4} required />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Skills and requirements *
                  <textarea name="requirements" rows={4} required />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Qualifications and experience *
                  <textarea name="qualifications" rows={3} required />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Job description file (Word or PDF)
                  <input
                    className="employers-form__upload"
                    name="jobDescription"
                    type="file"
                    accept=".doc,.docx,.pdf"
                    onChange={(event) => {
                      setJobDescriptionName(event.target.files?.[0]?.name ?? '')
                    }}
                  />
                  <small>
                    {jobDescriptionName
                      ? `${jobDescriptionName} selected. It will not be uploaded.`
                      : 'Optional. Files are not uploaded.'}
                  </small>
                </label>
              </div>
            </fieldset>

            <div className="employers-form__terms">
              <p>
                <strong>Job order enquiry:</strong> Submitting sends these
                details to IMFORCE so the team can contact you about next steps.
              </p>
              <p>
                The ZAR 499 activation fee is charged once per job order. Any
                placement fee is separate and will follow the signed agreement.
              </p>
              <label className="employers-form__checkbox">
                <input type="checkbox" name="authorizedContact" required />
                <span>
                  I confirm I am allowed to share these job details with
                  IMFORCE for this job order enquiry.
                </span>
              </label>
            </div>

            <div className="employers-form__actions">
              <button
                className="employers-button employers-button--primary"
                type="submit"
              >
                Check job order
              </button>
            </div>
          </form>
        </section>
      </main>
      {review && (
        <dialog
          className="employers-review"
          ref={dialogRef}
          aria-labelledby="job-order-review-title"
          onClose={() => setReview(null)}
        >
          <div className="employers-review__header">
            <div>
              <p className="employers-eyebrow employers-eyebrow--blue">
                Job order preview
              </p>
              <h2 id="job-order-review-title">Check your details</h2>
            </div>
            <button
              className="employers-review__close"
              type="button"
              aria-label="Close job order review"
              onClick={() => dialogRef.current?.close()}
            >
              ×
            </button>
          </div>

          <p className="employers-review__notice">
            Check the information below. Confirming sends this job order enquiry to IMFORCE.
          </p>

          <section className="employers-review__section">
            <h3>Company and contact details</h3>
            <dl className="employers-review__details">
              {review.company.map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="employers-review__section">
            <h3>Job details</h3>
            <dl className="employers-review__details">
              {review.job.map(({ label, value }) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
              <div>
                <dt>Job description file</dt>
                <dd>{jobDescriptionName || 'Not provided'}</dd>
              </div>
            </dl>
          </section>

          <section className="employers-review__estimate" aria-label="Fee estimate">
            <div>
              <h3>Estimated activation fee</h3>
              <p>
                One fee per job order, regardless of the number of people hired.
              </p>
            </div>
            <strong>ZAR 499</strong>
            <p className="employers-review__vat-note">
              Estimate only. VAT treatment is still being confirmed by IMFORCE
              Finance, so VAT is not included in this estimate.
            </p>
          </section>

          <div className="employers-review__footer">
            {submissionStatus && <p role="status">{submissionStatus}</p>}
            <div className="employers-review__actions">
              <button
                className="employers-button employers-button--secondary"
                type="button"
                onClick={() => dialogRef.current?.close()}
              >
                Back to edit
              </button>
              <button
                className="employers-button employers-button--primary"
                type="button"
                disabled={submitting || submissionStatus.startsWith('Your job order enquiry has been sent.')}
                onClick={async () => {
                  const form = formRef.current
                  if (!form) return
                  setSubmitting(true); setSubmissionStatus('')
                  const values = Object.fromEntries(new FormData(form).entries())
                  const details = Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'jobDescription').map(([key, value]) => [key, key === 'authorizedContact' ? value === 'on' : String(value)]))
                  try {
                    await submitEmployerInquiry({ details })
                    setSubmissionStatus('Your job order enquiry has been sent. IMFORCE will contact you about next steps.')
                    sessionStorage.removeItem(draftStorageKey)
                    form.reset(); setClosingDate(''); setJobDescriptionName(''); setHasSavedDraft(false)
                  } catch (error) {
                    setSubmissionStatus(error instanceof Error ? error.message : 'Your enquiry could not be sent. Please try again.')
                  } finally { setSubmitting(false) }
                }}
              >
                {submitting ? 'Sending…' : submissionStatus.startsWith('Your job order enquiry has been sent.') ? 'Enquiry sent' : 'Submit job order enquiry'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  )
}

export default Employers
