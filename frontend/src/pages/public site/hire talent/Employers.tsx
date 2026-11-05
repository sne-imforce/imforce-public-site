import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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

function Employers() {
  const [jobDescriptionName, setJobDescriptionName] = useState('')
  const [previewReady, setPreviewReady] = useState(false)

  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    const previousDescription = description?.content

    document.title = 'For Employers | Permanent Staffing | IMFORCE Consolidated'
    if (description) {
      description.content =
        'Hire permanent staff with IMFORCE Consolidated. Share your job requirements, complete the job order process and track recruitment progress.'
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
            <h2 id="job-order-title">
              Tell us about your company and the role.
            </h2>
            <p>
              Add the details below to preview the job order. Fields marked
              required must be filled in.
            </p>
          </div>

          <aside className="employers-form-notice">
            <strong>This form is a preview only.</strong> It does not send or
            save your details. Email verification, the approved agreement,
            invoices, payment and job tracking are not connected yet. Do not
            enter real private or payment information here.
          </aside>

          <form
            className="employers-form"
            onSubmit={(event) => {
              event.preventDefault()
              setPreviewReady(true)
            }}
            onChange={() => setPreviewReady(false)}
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
                  <small>Leave blank if it does not apply.</small>
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
                  Salary or salary range *
                  <input
                    name="salary"
                    placeholder="For example, R20,000 to R25,000 per month"
                    required
                  />
                </label>
                <label className="employers-form__field">
                  Closing date *
                  <input name="closingDate" type="date" required />
                </label>
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
                      ? `${jobDescriptionName} selected. It will not be sent or saved.`
                      : 'Optional in this preview. Files are not uploaded.'}
                  </small>
                </label>
              </div>
            </fieldset>

            <div className="employers-form__terms">
              <p>
                <strong>Agreement and payment:</strong> The approved recruitment
                agreement and its version must be provided before you can
                accept it. PayPod invoices and NetCash payments are not
                connected on this preview page.
              </p>
              <p>
                The R499 activation fee is charged once per job order. Any
                placement fee is separate and will follow the signed agreement.
              </p>
              <label className="employers-form__checkbox">
                <input type="checkbox" name="authorizedContact" required />
                <span>
                  I confirm I am allowed to share these job details for this
                  preview. This is not a legal agreement or job submission.
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
              {previewReady && (
                <p className="employers-form__status" role="status">
                  The required fields are complete. This is only a preview.
                  Nothing was sent or saved.
                </p>
              )}
            </div>
          </form>
        </section>
      </main>
    </>
  )
}

export default Employers