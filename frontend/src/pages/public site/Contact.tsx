import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { HoneyField } from '../../components/public/HoneyField'
import Navbar from '../../components/public/Navbar'
import { TurnstileVerification } from '../../components/public/TurnstileVerification'
import {
  getSupabaseClient,
  isSupabaseConfigured,
  readFunctionErrorMessage,
} from '../../lib/supabase'
import './Contact.css'

function Contact() {
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormMessage('')
    setFormError(false)

    if (!formReady) {
      setFormMessage(
        'The contact form is not available right now. Please email info@imforce.co.za.',
      )
      setFormError(true)
      return
    }

    if (!turnstileToken) {
      setFormMessage('Complete the security check before sending your message.')
      setFormError(true)
      return
    }

    const form = event.currentTarget
    const formData = new FormData(form)
    setIsSubmitting(true)

    try {
      const { data, error } = await getSupabaseClient().functions.invoke<{
        ok: boolean
        error?: string
      }>('contact-enquiry', {
        body: {
          name: formData.get('name'),
          email: formData.get('email'),
          phone: formData.get('phone'),
          enquiryType: formData.get('enquiryType'),
          subject: formData.get('subject'),
          message: formData.get('message'),
          hp_website: formData.get('hp_website'),
          turnstileToken,
        },
      })

      if (error) {
        throw new Error(
          await readFunctionErrorMessage(
            error,
            'Unable to send your message. Please try again or email us.',
          ),
        )
      }
      if (!data?.ok) {
        throw new Error(data?.error ?? 'Unable to send your message.')
      }

      form.reset()
      setFormMessage('Thank you. Your message has been sent to IMFORCE.')
    } catch (error) {
      setFormMessage(
        error instanceof Error
          ? error.message
          : 'Unable to send your message. Please try again or email us.',
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
            <div className="contact-form-panel__heading">
              <p className="contact-eyebrow contact-eyebrow--blue">
                Send an enquiry
              </p>
              <h2 id="contact-form-title">Write to our team</h2>
              <p>Fields marked with * are required.</p>
            </div>

            <form className="contact-form" onSubmit={handleSubmit}>
              <HoneyField />
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
                  <input name="subject" type="text" maxLength={160} required />
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
                Your message is sent to IMFORCE and stored for follow-up.
                Cloudflare Turnstile helps check for automated submissions.
                Do not include passwords, bank details, ID numbers or other
                sensitive information.
              </p>

              {formReady ? (
                <TurnstileVerification
                  key={turnstileVersion}
                  action="contact"
                  onToken={setTurnstileToken}
                  onError={handleTurnstileError}
                />
              ) : (
                <p className="contact-form__privacy" role="status">
                  The secure form is temporarily unavailable. Please email{' '}
                  <a href="mailto:info@imforce.co.za">info@imforce.co.za</a>.
                </p>
              )}

              {formMessage && (
                <p
                  className="contact-form__privacy"
                  role={formError ? 'alert' : 'status'}
                >
                  {formMessage}
                </p>
              )}

              <button
                className="contact-button"
                type="submit"
                disabled={isSubmitting || !formReady || !turnstileToken}
              >
                {isSubmitting ? 'Sending…' : 'Send message'}
              </button>
            </form>
          </section>
        </section>
      </main>
    </>
  )
}

export default Contact
