import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/public/Navbar'
import './Contact.css'

function Contact() {
  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    const previousDescription = description?.content

    document.title = 'Contact IMFORCE | Pietermaritzburg Recruitment Agency'
    if (description) {
      description.content =
        'Contact IMFORCE Consolidated, a Pietermaritzburg-based recruitment agency. Send an enquiry about permanent staffing, job opportunities or employer services.'
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

            <form
              className="contact-form"
              action="https://formspree.io/f/mjyypqyj"
              method="POST"
            >
              <input
                type="hidden"
                name="_subject"
                value="Website enquiry - IMFORCE"
              />
              <label className="contact-form__honeypot" aria-hidden="true">
                Leave this field empty
                <input
                  type="text"
                  name="_gotcha"
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
                When you submit this form, your message is sent to IMFORCE
                through Formspree. Do not include passwords, bank details, ID
                numbers or other sensitive information.
              </p>

              <button className="contact-button" type="submit">
                Send message
              </button>
            </form>
          </section>
        </section>
      </main>
    </>
  )
}

export default Contact
