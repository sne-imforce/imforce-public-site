import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { HoneyField } from '../../../components/public/HoneyField'
import Navbar from '../../../components/public/Navbar'
import { TurnstileVerification } from '../../../components/public/TurnstileVerification'
import {
  getSupabaseClient,
  isSupabaseConfigured,
  readFunctionErrorMessage,
} from '../../../lib/supabase'
import './Employers.css'

const maxAttachmentSize = 10 * 1024 * 1024

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

function Employers() {
  const [searchParams] = useSearchParams()
  const monthlySalary = searchParams.get('monthlySalary') ?? ''
  const [salaryType, setSalaryType] = useState(
    monthlySalary ? 'specified' : 'market',
  )
  const [salary, setSalary] = useState(monthlySalary)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [turnstileVersion, setTurnstileVersion] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formMessage, setFormMessage] = useState('')
  const [formError, setFormError] = useState(false)
  const formReady = isSupabaseConfigured()

  const handleTurnstileError = useCallback((message: string) => {
    setTurnstileToken('')
    setFormMessage(message)
    setFormError(true)
  }, [setTurnstileToken, setFormMessage, setFormError])

  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    const previousDescription = description?.content

    document.title = 'For Employers | Permanent Staffing | IMFORCE Talent Recruitment'
    if (description) {
      description.content =
        'Submit a job-order request to IMFORCE Talent Recruitment. Our team will confirm the details, agreement and payment steps with you.'
    }

    return () => {
      document.title = previousTitle
      if (description && previousDescription !== undefined) {
        description.content = previousDescription
      }
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormMessage('')
    setFormError(false)

    if (!formReady) {
      setFormMessage(
        'The job-order form is not available right now. Please email info@imforce.co.za.',
      )
      setFormError(true)
      return
    }

    if (!turnstileToken) {
      setFormMessage('Complete the security check before submitting the form.')
      setFormError(true)
      return
    }

    const form = event.currentTarget
    const formData = new FormData(form)
    const attachment = formData.get('jobDescription')
    if (attachment instanceof File && attachment.size > maxAttachmentSize) {
      setFormMessage('The job description file must be 10 MB or smaller.')
      setFormError(true)
      return
    }
    formData.set('turnstileToken', turnstileToken)
    setIsSubmitting(true)

    try {
      const { data, error } = await getSupabaseClient().functions.invoke<{
        ok: boolean
        error?: string
      }>('job-order', { body: formData })

      if (error) {
        throw new Error(
          await readFunctionErrorMessage(
            error,
            'Unable to submit the job order. Please try again or email us.',
          ),
        )
      }
      if (!data?.ok) {
        throw new Error(data?.error ?? 'Unable to submit the job order.')
      }

      form.reset()
      setSalaryType('market')
      setSalary('')
      setFormMessage(
        'Thank you. Your job-order request has been sent to IMFORCE. Our team will contact you about the agreement and payment steps.',
      )
    } catch (error) {
      setFormMessage(
        error instanceof Error
          ? error.message
          : 'Unable to submit the job order. Please try again or email us.',
      )
      setFormError(true)
    } finally {
      setIsSubmitting(false)
      setTurnstileToken('')
      setTurnstileVersion((version) => version + 1)
    }
  }

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
                The R499 fee covers one job description, even if you are hiring
                more than one person for that role. The fee is separate from
                the placement fee. VAT treatment is still to be confirmed by
                IMFORCE Finance.
              </p>
              <p>
                If a job is paused or cancelled, the activation fee is not
                refunded. Restarting within 90 days does not need another fee.
                After 90 days, a new R499 fee is needed.
              </p>
            </div>
            <div className="employers-fee__amount" aria-label="R499 per job order">
              <strong>R499</strong>
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
            <h2 id="job-order-title">Tell us about your company and the role.</h2>
            <p>
              Share your company and role details securely. This request is
              private and does not publish a vacancy, start recruitment, create
              an agreement, or charge a payment.
            </p>
            <p>Fields marked with * are required.</p>
          </div>
          <aside className="employers-form-notice">
            <strong>What happens next?</strong> IMFORCE will review your request
            and contact you to confirm the details, provide the recruitment
            agreement, and explain payment. No payment is taken through this
            form. Only authorized IMFORCE staff can access the submitted
            company information and any attached job description.
          </aside>

          <form className="employers-form" onSubmit={handleSubmit}>
            <HoneyField />
            <fieldset className="employers-form__section">
              <legend>1. Company and contact details</legend>
              <div className="employers-form__grid">
                <label className="employers-form__field">
                  Legal company name *
                  <input
                    name="legalCompanyName"
                    autoComplete="organization"
                    maxLength={200}
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Trading name
                  <input name="tradingName" maxLength={200} />
                </label>
                <label className="employers-form__field">
                  Company registration number *
                  <input name="registrationNumber" maxLength={80} required />
                </label>
                <label className="employers-form__field">
                  VAT number
                  <input name="vatNumber" maxLength={80} />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Company address *
                  <textarea
                    name="companyAddress"
                    rows={2}
                    maxLength={500}
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Contact name *
                  <input name="contactName" autoComplete="name" maxLength={120} required />
                </label>
                <label className="employers-form__field">
                  Contact email *
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Contact phone *
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={40}
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Billing contact *
                  <input name="billingContact" maxLength={120} required />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Billing address *
                  <textarea
                    name="billingAddress"
                    rows={2}
                    maxLength={500}
                    required
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="employers-form__section">
              <legend>2. Job details</legend>
              <div className="employers-form__grid">
                <label className="employers-form__field">
                  Job title *
                  <input
                    name="jobTitle"
                    defaultValue={searchParams.get('jobTitle') ?? ''}
                    maxLength={160}
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Job location *
                  <input name="jobLocation" maxLength={200} required />
                </label>
                <label className="employers-form__field">
                  Number of people to hire *
                  <input
                    name="numberOfHires"
                    type="number"
                    min="1"
                    max="500"
                    step="1"
                    defaultValue={searchParams.get('numberOfHires') ?? ''}
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Employment type *
                  <select name="employmentType" required defaultValue="">
                    <option value="" disabled>Choose a type</option>
                    <option value="Permanent">Permanent</option>
                    <option value="Fixed-term">Fixed-term</option>
                    <option value="Contract">Contract</option>
                    <option value="Temporary">Temporary</option>
                  </select>
                </label>
                <label className="employers-form__field">
                  Working hours *
                  <input
                    name="workingHours"
                    placeholder="For example, Monday to Friday, 8 am to 5 pm"
                    maxLength={120}
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Salary option *
                  <select
                    name="salaryType"
                    value={salaryType}
                    onChange={(event) => setSalaryType(event.target.value)}
                    required
                  >
                    <option value="specified">Enter salary / range</option>
                    <option value="market">Market Related Salary</option>
                  </select>
                </label>
                <label className="employers-form__field">
                  Salary or salary range *
                  <input
                    name="salary"
                    placeholder="For example, R20,000 to R25,000 per month"
                    maxLength={120}
                    value={salaryType === 'market' ? 'Market Related Salary' : salary}
                    onChange={(event) => setSalary(event.target.value)}
                    disabled={salaryType === 'market'}
                    required={salaryType === 'specified'}
                  />
                </label>
                <label className="employers-form__field">
                  Closing date *
                  <input
                    name="closingDate"
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Main duties *
                  <textarea name="duties" rows={4} maxLength={4000} required />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Skills and requirements *
                  <textarea
                    name="requirements"
                    rows={4}
                    maxLength={4000}
                    required
                  />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Qualifications and experience *
                  <textarea
                    name="qualifications"
                    rows={3}
                    maxLength={3000}
                    required
                  />
                </label>
                <label className="employers-form__field employers-form__field--full">
                  Job description file (Word or PDF, optional)
                  <input
                    className="employers-form__upload"
                    name="jobDescription"
                    type="file"
                    accept=".doc,.docx,.pdf,application/msword,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  />
                  <small>Private attachment, maximum 10 MB. Accepted formats: DOC, DOCX and PDF.</small>
                </label>
              </div>
            </fieldset>

            <div className="employers-form__terms">
              <p>
                Submitting a job order is a request for IMFORCE to contact you.
                It is not a signed recruitment agreement, does not publish a job,
                and does not trigger a payment.
              </p>
              <label className="employers-form__checkbox">
                <input type="checkbox" name="authorizedContact" required />
                <span>
                  I confirm I am authorized to share these company and job
                  details, and agree IMFORCE may contact me about this request.
                </span>
              </label>
            </div>

            {formReady ? (
              <TurnstileVerification
                key={turnstileVersion}
                action="job-order"
                onToken={setTurnstileToken}
                onError={handleTurnstileError}
              />
            ) : (
              <p className="employers-form-notice" role="status">
                The secure form is temporarily unavailable. Please email{' '}
                <a href="mailto:info@imforce.co.za">info@imforce.co.za</a>.
              </p>
            )}

            {formMessage && (
              <p
                className="employers-form-notice"
                role={formError ? 'alert' : 'status'}
              >
                {formMessage}
              </p>
            )}

            <div className="employers-form__actions">
              <button
                className="employers-button employers-button--primary"
                type="submit"
                disabled={isSubmitting || !formReady || !turnstileToken}
              >
                {isSubmitting ? 'Submitting…' : 'Submit job-order request'}
              </button>
            </div>
          </form>
        </section>
      </main>
    </>
  )
}

export default Employers
