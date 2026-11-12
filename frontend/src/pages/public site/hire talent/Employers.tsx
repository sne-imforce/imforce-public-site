import { useEffect, useRef, useState } from 'react'
import { FiCheckCircle } from 'react-icons/fi'
import { Link, useSearchParams } from 'react-router-dom'
import DatePicker from '../../../components/ui/DatePicker'
import { initializePaystackCheckout, verifyPaystackPayment } from '../../../data/api'
import { formatDateDmy } from '../../../utils/dates'
import Navbar from '../../../components/public/Navbar'
import './Employers.css'
import Spinner from '../../../components/ui/Spinner'

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
    Boolean(control.name)
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
      'Your saved answers were restored in this browser tab.',
  }
}

function Employers() {
  const [searchParams, setSearchParams] = useSearchParams()
  const jobTitlePrefill = searchParams.get('jobTitle')?.trim() ?? ''
  const monthlySalaryPrefill = searchParams.get('monthlySalary')?.trim() ?? ''
  const numberOfHiresPrefill = searchParams.get('numberOfHires')?.trim() ?? ''
  const hasPrefill = Boolean(
    jobTitlePrefill || monthlySalaryPrefill || numberOfHiresPrefill,
  )
  const [jobOrderIssues, setJobOrderIssues] = useState<Array<{ field: string; label: string; message: string }>>([])
  const [review, setReview] = useState<JobOrderReview | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submissionStatus, setSubmissionStatus] = useState('')
  const [checkoutFallbackUrl, setCheckoutFallbackUrl] = useState('')
  const [paymentNotice, setPaymentNotice] = useState('')
  const [paymentToastMessage, setPaymentToastMessage] = useState('')
  const [paymentToastMounted, setPaymentToastMounted] = useState(false)
  const [paymentToastVisible, setPaymentToastVisible] = useState(false)
  const paymentReference = searchParams.get('reference') ?? searchParams.get('trxref')
  const [initialDraft] = useState(readStoredDraft)
  const [closingDate, setClosingDate] = useState(
    typeof initialDraft.draft?.closingDate === 'string' ? initialDraft.draft.closingDate : '',
  )
  const [isMarketRelatedSalary, setIsMarketRelatedSalary] = useState(initialDraft.draft?.salaryType === 'market')
  const [hasSavedDraft, setHasSavedDraft] = useState(
    initialDraft.draft !== null || hasPrefill,
  )
  const [draftStatus, setDraftStatus] = useState(
    hasPrefill
      ? 'The position title, salary and number of hires were filled from the fee calculator.'
      : initialDraft.status,
  )
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!paymentToastMounted) return
    if (paymentToastVisible) {
      const hideTimer = window.setTimeout(() => setPaymentToastVisible(false), 3000)
      return () => window.clearTimeout(hideTimer)
    }
    const removeTimer = window.setTimeout(() => setPaymentToastMounted(false), 350)
    return () => window.clearTimeout(removeTimer)
  }, [paymentToastMounted, paymentToastVisible])

  useEffect(() => {
    if (!paymentReference) return
    let active = true
    void verifyPaystackPayment(paymentReference)
      .then(({ message }) => {
        if (!active) return
        setPaymentToastMessage(`${message} Paystack will email a copy of your proof of payment to your contact email.`)
        setPaymentToastMounted(true)
        window.requestAnimationFrame(() => setPaymentToastVisible(true))
        try { sessionStorage.removeItem(draftStorageKey) } catch { /* Payment is confirmed; draft cleanup is best effort. */ }
        formRef.current?.reset()
        setClosingDate('')
        setIsMarketRelatedSalary(false)
        setHasSavedDraft(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        const reason = error instanceof Error ? error.message : 'Payment could not be confirmed yet.'
        setPaymentNotice(`${reason} If your bank shows a debit, contact IMFORCE before trying to pay again.`)
      })
      .finally(() => {
        if (active) setSearchParams((current) => {
          current.delete('reference')
          current.delete('trxref')
          current.delete('status')
          return current
        }, { replace: true })
      })
    return () => { active = false }
  }, [paymentReference, setSearchParams])
  const handleClosingDateChange = (value: string) => {
    setClosingDate(value)
    const form = formRef.current
    if (!form) return
    const draft = readFormDraft(form)
    draft.closingDate = value
    try {
      sessionStorage.setItem(draftStorageKey, JSON.stringify(draft))
      setHasSavedDraft(true)
      setDraftStatus('Your answers are saved in this browser tab.')
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

    const salaryTypeControl = form.elements.namedItem('salaryType')
    const salaryControl = form.elements.namedItem('salary')
    if (salaryTypeControl instanceof HTMLSelectElement && salaryControl instanceof HTMLInputElement) {
      const marketRelated = salaryTypeControl.value === 'market'
      setIsMarketRelatedSalary(marketRelated)
      salaryControl.readOnly = marketRelated
      if (marketRelated) salaryControl.value = 'Market Related Salary'
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
      {paymentToastMounted && (
        <div className={`employers-payment-toast${paymentToastVisible ? ' is-visible' : ''}`} role="status" aria-live="polite" aria-atomic="true">
          <FiCheckCircle aria-hidden="true" />
          <span>{paymentToastMessage}</span>
        </div>
      )}
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
            Clear your saved draft when finished.
          </aside>
          {paymentNotice ? (
            <p className="employers-payment-notice" role="status" aria-live="polite">{paymentNotice}</p>
          ) : paymentReference ? (
            <p className="employers-payment-notice"><Spinner label="Confirming your payment with Paystack…" size="sm" /></p>
          ) : null}
          {jobOrderIssues.length > 0 && (
            <div className="employers-form-errors" role="alert" aria-labelledby="employers-form-errors-title">
              <h3 id="employers-form-errors-title">Please improve these job details</h3>
              <ul>
                {jobOrderIssues.map((issue) => (
                  <li key={issue.field}><a href={`#${issue.field}`}>{issue.label}: {issue.message}</a></li>
                ))}
              </ul>
            </div>
          )}

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
                  setIsMarketRelatedSalary(false)
                  setReview(null)
                  setJobOrderIssues([])
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
              const values = Object.fromEntries(formData.entries())
              const descriptionChecks = [
                { field: 'duties', label: 'Main duties', minimum: 40, message: 'Add more detail about the day-to-day responsibilities (at least 40 characters).' },
                { field: 'requirements', label: 'Skills and requirements', minimum: 25, message: 'Describe the skills or experience a suitable candidate needs (at least 25 characters).' },
                { field: 'qualifications', label: 'Qualifications and experience', minimum: 20, message: 'Add the required qualifications or relevant experience (at least 20 characters).' },
              ]
              const issues = descriptionChecks
                .filter(({ field, minimum }) => String(values[field] ?? '').trim().length < minimum)
                .map(({ field, label, message }) => ({ field, label, message }))
              setJobOrderIssues(issues)
              if (issues.length) {
                document.getElementById(issues[0].field)?.focus()
                return
              }

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
              setJobOrderIssues([])
              const draft = readFormDraft(event.currentTarget)

              try {
                sessionStorage.setItem(draftStorageKey, JSON.stringify(draft))
                setHasSavedDraft(true)
                setDraftStatus(
                  'Your answers are saved in this browser tab.',
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
              {/* Bot trap: hidden from people and screen readers; bots that fill every field reveal themselves. */}
              <label
                aria-hidden="true"
                style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap' }}
              >
                Leave this field empty
                <input type="text" name="extraNotesHp" tabIndex={-1} autoComplete="off" defaultValue="" />
              </label>
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
                      const salaryField = event.currentTarget.form?.elements.namedItem('salary')
                      if (!(salaryField instanceof HTMLInputElement)) return
                      const marketRelated = event.currentTarget.value === 'market'
                      setIsMarketRelatedSalary(marketRelated)
                      salaryField.readOnly = marketRelated
                      salaryField.value = marketRelated ? 'Market Related Salary' : ''
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
                    readOnly={isMarketRelatedSalary}
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
                  <textarea id="duties" name="duties" maxLength={5000} rows={4} required />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Skills and requirements *
                  <textarea id="requirements" name="requirements" maxLength={5000} rows={4} required />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Qualifications and experience *
                  <textarea id="qualifications" name="qualifications" maxLength={5000} rows={3} required />
                </label>
              </div>
            </fieldset>

            <div className="employers-form__terms">
              <p>
                <strong>Job order enquiry:</strong> Submitting sends these
                details to IMFORCE so the team can contact you about next steps.
                See our <Link to="/privacy">privacy notice</Link> for how we use
                and protect this information.
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
              {checkoutFallbackUrl && (
                <a className="employers-button employers-button--secondary" href={checkoutFallbackUrl} target="_blank" rel="noopener noreferrer">
                  Continue to Paystack checkout
                </a>
              )}
              <button
                className="employers-button employers-button--primary"
                type="button"
                disabled={submitting || Boolean(checkoutFallbackUrl)}
                onClick={async () => {
                  const form = formRef.current
                  if (!form) return
                  const checkoutWindow = window.open('about:blank', '_blank')
                  if (!checkoutWindow) {
                    setSubmissionStatus('Your browser blocked the Paystack tab. Allow pop-ups for this site, then try checkout again.')
                    return
                  }
                  setCheckoutFallbackUrl('')
                  checkoutWindow.opener = null
                  checkoutWindow.document.title = 'Secure Paystack checkout'
                  const checkoutMessage = checkoutWindow.document.createElement('p')
                  checkoutMessage.textContent = 'Connecting securely to Paystack…'
                  checkoutMessage.style.cssText = 'margin:15vh auto;max-width:32rem;padding:2rem;color:#123;font:600 1.1rem/1.6 system-ui,sans-serif;text-align:center'
                  checkoutWindow.document.body.replaceChildren(checkoutMessage)
                  setSubmitting(true); setSubmissionStatus('')
                  const values = Object.fromEntries(new FormData(form).entries())
                  const details = Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'salaryType').map(([key, value]) => [key, key === 'authorizedContact' ? value === 'on' : String(value)]))
                  try {
                    const { authorizationUrl } = await initializePaystackCheckout(details)
                    const checkoutUrl = new URL(authorizationUrl)
                    if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.paystack.com') {
                      throw new Error('Paystack returned an invalid checkout address. Please contact IMFORCE.')
                    }
                    if (checkoutWindow.closed) {
                      setCheckoutFallbackUrl(checkoutUrl.toString())
                      setSubmissionStatus('The checkout tab closed before it opened. Continue using the secure checkout link below.')
                      return
                    }
                    checkoutWindow.location.replace(checkoutUrl.toString())
                    setSubmissionStatus('Paystack checkout opened in a new tab. Keep this tab open while you complete payment.')
                  } catch (error) {
                    if (!checkoutWindow.closed) checkoutWindow.close()
                    setSubmissionStatus(error instanceof Error ? error.message : 'Paystack checkout could not be started. Please try again.')
                  } finally { setSubmitting(false) }
                }}
              >
                {submitting ? <Spinner label="Opening Paystack…" size="sm" tone="light" /> : 'Checkout'}
              </button>
            </div>
          </div>
        </dialog>
      )}
    </>
  )
}

export default Employers
