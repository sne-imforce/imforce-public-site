import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FiAlertCircle, FiArrowRight, FiCheck, FiPhone } from 'react-icons/fi'
import { Link, useSearchParams } from 'react-router-dom'
import { submitContact } from '../../data/api'
import Navbar from '../../components/public/Navbar'
import './Contact.css'
import Spinner from '../../components/ui/Spinner'

type SentEnquiry = { firstName: string; email: string; enquiryType: string; reference: string | null }

// Useful next steps, matched to what the visitor asked about.
const nextSteps: Record<string, Array<{ to: string; label: string }>> = {
  'Job opportunities': [
    { to: '/careers', label: 'Browse current vacancies' },
    { to: '/about', label: 'Learn about IMFORCE' },
  ],
  'Hiring and permanent staffing': [
    { to: '/employers#job-order', label: 'Start a job order' },
    { to: '/fee-calculator', label: 'Estimate placement fees' },
  ],
  'Other enquiry': [
    { to: '/services/placements', label: 'Explore our services' },
    { to: '/careers', label: 'Browse current vacancies' },
  ],
}

function Contact() {
  const [searchParams] = useSearchParams()
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState('')
  const [sent, setSent] = useState<SentEnquiry | null>(null)
  const sentHeadingRef = useRef<HTMLHeadingElement>(null)

  // Move focus to the confirmation so keyboard and screen-reader users hear it.
  useEffect(() => {
    if (!sent) return
    sentHeadingRef.current?.focus()
    sentHeadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [sent])
  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    const previousDescription = description?.content

    document.title = 'Contact IMFORCE | Pietermaritzburg Recruitment Agency'
    if (description) {
      description.content =
        'Contact IMFORCE Talent Recruitment, a Pietermaritzburg-based recruitment agency. Send an enquiry about permanent staffing, job opportunities or employer services.'
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
      <main className="contact-page">
        <section className="contact-hero" aria-labelledby="contact-title">
          <div className="contact-shell contact-hero__inner">
            <p className="contact-eyebrow">Contact IMFORCE</p>
            <h1 id="contact-title">Let’s talk about your next step.</h1>
            <p>
              Contact our Pietermaritzburg-based recruitment agency about
              permanent staffing, hiring, or finding your next opportunity.
              Send us a message or email our team directly.
            </p>
          </div>
        </section>

        <section className="contact-content contact-shell">
          <aside className="contact-details" aria-labelledby="contact-options">
            <p className="contact-eyebrow contact-eyebrow--blue">
              Get in touch
            </p>
            <h2 id="contact-options">How can we help?</h2>
            <p>
              Choose the best way to reach us. If you send a form, include only
              the details needed for your enquiry.
            </p>

            <div className="contact-details__emails">
              <h3>Visit</h3>
              <p>12 Halstead Road<br />Mkondeni<br />Pietermaritzburg<br />3201</p>
            </div>

            <div className="contact-details__emails">
              <h3>Call</h3>
              <a href="tel:0334920600">033 492 0600</a>
            </div>

            <div className="contact-details__emails">
              <h3>Email</h3>
              <a href="mailto:info@imforce.co.za">info@imforce.co.za</a>
              <a href="mailto:admin@imforce.co.za">admin@imforce.co.za</a>
            </div>

            <div className="contact-details__links">
              <h3>Useful pages</h3>
              <Link to="/services/placements">Permanent staffing</Link>
              <Link to="/employers">For employers</Link>
              <Link to="/careers">Careers and job search</Link>
            </div>
          </aside>

          <section className="contact-form-panel" aria-labelledby="contact-form-title">
            {sent ? (
              <div className="contact-sent" role="status">
                <span className="contact-sent__icon" aria-hidden="true"><FiCheck /></span>
                <h2 id="contact-form-title" ref={sentHeadingRef} tabIndex={-1}>
                  Thank you{sent.firstName ? `, ${sent.firstName}` : ''}. Your message has been sent.
                </h2>
                <p className="contact-sent__lead">
                  We’ve received your enquiry. A member of the IMFORCE team will reply to{' '}
                  <strong>{sent.email}</strong>.
                </p>
                {sent.reference && (
                  <p className="contact-sent__reference">
                    Your reference <strong>{sent.reference}</strong>
                    <span>Quote it if you call us about this enquiry.</span>
                  </p>
                )}
                <div className="contact-sent__next">
                  <h3>What happens next</h3>
                  <ol>
                    <li>Our team reads your message and passes it to the right consultant.</li>
                    <li>They reply by email, or call you if you left a phone number.</li>
                    <li>Can’t see our reply? Check your spam or junk folder.</li>
                  </ol>
                </div>
                <div className="contact-sent__actions">
                  {(nextSteps[sent.enquiryType] ?? nextSteps['Other enquiry']).map((step, index) => (
                    <Link key={step.to} className={index === 0 ? 'contact-button' : 'contact-sent__secondary'} to={step.to}>
                      {step.label} <FiArrowRight aria-hidden="true" />
                    </Link>
                  ))}
                </div>
                <p className="contact-sent__urgent">
                  <FiPhone aria-hidden="true" /> <span>Need to talk sooner? Call <a href="tel:0334920600">033 492 0600</a>.</span>
                </p>
                <button type="button" className="contact-sent__again" onClick={() => setSent(null)}>
                  Send another message
                </button>
              </div>
            ) : (
            <>
            <div className="contact-form-panel__heading">
              <p className="contact-eyebrow contact-eyebrow--blue">
                Send an enquiry
              </p>
              <h2 id="contact-form-title">Write to our team</h2>
              <p>Fields marked with * are required.</p>
            </div>

            <form
              className="contact-form"
              onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                event.preventDefault()
                const form = event.currentTarget
                setSending(true); setFormError('')
                const data = Object.fromEntries(Object.entries(Object.fromEntries(new FormData(form).entries())).map(([key, value]) => [key, String(value)]))
                try {
                  const result = await submitContact(data)
                  form.reset()
                  setSent({
                    firstName: data.name.trim().split(/\s+/)[0] ?? '',
                    email: data.email.trim(),
                    enquiryType: data.enquiryType,
                    reference: result.reference ?? null,
                  })
                } catch (error) {
                  setFormError(error instanceof Error ? error.message : 'Your message could not be sent. Please try again.')
                } finally { setSending(false) }
              }}
            >
              <label className="contact-form__honeypot" aria-hidden="true">
                Leave this field empty
                <input
                  type="text"
                  name="extraNotesHp"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>

              <div className="contact-form__grid">
                <label className="contact-form__field">
                  Your name *
                  <input
                    name="name"
                    type="text"
                    autoComplete="name"
                    maxLength={120}
                    required
                  />
                </label>
                <label className="contact-form__field">
                  Email address *
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    required
                  />
                </label>
                <label className="contact-form__field">
                  <span>
                    Phone number{' '}
                    <span className="contact-form__optional">(optional)</span>
                  </span>
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={40}
                  />
                </label>
                <label className="contact-form__field">
                  I am contacting about *
                  <select name="enquiryType" defaultValue="" required>
                    <option value="" disabled>
                      Choose one
                    </option>
                    <option value="Hiring and permanent staffing">
                      Hiring and permanent staffing
                    </option>
                    <option value="Job opportunities">
                      Job opportunities
                    </option>
                    <option value="Other enquiry">Other enquiry</option>
                  </select>
                </label>
                <label className="contact-form__field contact-form__field--full">
                  Subject *
                  <input name="subject" type="text" maxLength={160} defaultValue={searchParams.get('subject') ?? ''} required />
                </label>
                <label className="contact-form__field contact-form__field--full">
                  Your message *
                  <textarea
                    name="message"
                    rows={6}
                    maxLength={5000}
                    required
                  />
                </label>
              </div>

              <p className="contact-form__privacy">
                When you submit this form, your message is sent securely to
                IMFORCE. Do not include passwords, bank details, ID numbers or
                other sensitive information. Read how we handle your information
                in our <Link to="/privacy">privacy notice</Link>.
              </p>

              {formError && (
                <p className="contact-form__error" role="alert">
                  <FiAlertCircle aria-hidden="true" />
                  <span>{formError} If it keeps happening, call us on <a href="tel:0334920600">033 492 0600</a>.</span>
                </p>
              )}
              <button className="contact-button" type="submit" disabled={sending}>
                {sending ? <Spinner label="Sending…" size="sm" tone="light" /> : 'Send message'}
              </button>
            </form>
            </>
            )}
          </section>
        </section>
      </main>
    </>
  )
}

export default Contact
