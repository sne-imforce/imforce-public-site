import { Link } from 'react-router-dom'
import Navbar from '../../components/public/Navbar'
import './Contact.css'
import './PrivacyPolicy.css'

// Describes what this website actually collects and why. Keep it in step with
// the code: if a form, field, service provider or retention rule changes,
// update this page in the same pull request and refresh LAST_UPDATED.
const LAST_UPDATED = '12 November 2026'

function PrivacyPolicy() {
  return (
    <>
      <Navbar />
      <main className="contact-page privacy-page">
        <section className="contact-hero" aria-labelledby="privacy-title">
          <div className="contact-shell contact-hero__inner">
            <p className="contact-eyebrow">Privacy</p>
            <h1 id="privacy-title">How we protect your personal information.</h1>
            <p>
              This notice explains what information the IMFORCE website collects,
              why we need it, who we share it with and the rights you have under
              the Protection of Personal Information Act (POPIA).
            </p>
          </div>
        </section>

        <article className="contact-shell privacy-content">
          <p className="privacy-updated">Last updated: {LAST_UPDATED}</p>

          <nav className="privacy-toc" aria-label="On this page">
            <h2>On this page</h2>
            <ol>
              <li><a href="#who-we-are">Who we are</a></li>
              <li><a href="#what-we-collect">What we collect and why</a></li>
              <li><a href="#job-applications">Job applications</a></li>
              <li><a href="#sharing">Who we share it with</a></li>
              <li><a href="#storage">Browser storage and cookies</a></li>
              <li><a href="#retention">How long we keep it</a></li>
              <li><a href="#security">How we keep it safe</a></li>
              <li><a href="#rights">Your rights</a></li>
              <li><a href="#contact">Contact and complaints</a></li>
            </ol>
          </nav>

          <section id="who-we-are" aria-labelledby="who-we-are-title">
            <h2 id="who-we-are-title">1. Who we are</h2>
            <p>
              IMFORCE Talent Recruitment (“IMFORCE”, “we”) is a recruitment agency at
              12 Halstead Road, Mkondeni, Pietermaritzburg, 3201. We are the responsible
              party for the personal information collected through imforce.co.za.
            </p>
          </section>

          <section id="what-we-collect" aria-labelledby="what-we-collect-title">
            <h2 id="what-we-collect-title">2. What we collect and why</h2>
            <p>We only ask for what we need to respond to you or to start recruiting for you.</p>
            <div className="privacy-table" role="region" aria-label="Information we collect" tabIndex={0}>
              <table>
                <thead>
                  <tr><th scope="col">When you…</th><th scope="col">We collect</th><th scope="col">Why</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Send a message on the <Link to="/contact">contact page</Link></td>
                    <td>Name, email address, optional phone number, enquiry type, subject and message</td>
                    <td>To reply to your enquiry (your request; our legitimate interest in responding)</td>
                  </tr>
                  <tr>
                    <td>Submit a job order on the <Link to="/employers">employers page</Link></td>
                    <td>Company name, registration and VAT numbers, addresses, contact and billing details, and the job details you enter</td>
                    <td>To set up and carry out the recruitment you ask us for, and to invoice the activation fee (performing our agreement with you)</td>
                  </tr>
                  <tr>
                    <td>Pay the activation fee</td>
                    <td>A payment reference, amount, status and payment method type. Card details are entered on Paystack’s page, and IMFORCE never sees or stores them.</td>
                    <td>To confirm your payment and keep financial records (legal obligation)</td>
                  </tr>
                  <tr>
                    <td>Use the website</td>
                    <td>Your IP address, the page requested and your browser type, in security logs</td>
                    <td>To protect the website against abuse and attacks (legitimate interest)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Please do not send ID numbers, bank details, passwords, health information or
              other sensitive information through our forms.
            </p>
          </section>

          <section id="job-applications" aria-labelledby="job-applications-title">
            <h2 id="job-applications-title">3. Job applications</h2>
            <p>
              This website does not collect CVs or applications. When you choose “Apply”
              on a vacancy you are taken to Nexora AI, a separate platform, where you
              apply once for that role. Nexora AI’s own privacy notice applies to the
              information you give there.
            </p>
          </section>

          <section id="sharing" aria-labelledby="sharing-title">
            <h2 id="sharing-title">4. Who we share it with</h2>
            <p>We do not sell personal information. We share it only with:</p>
            <ul>
              <li><strong>Supabase</strong>, which hosts our database on our behalf.</li>
              <li><strong>Paystack</strong>, which processes activation-fee payments and emails you a receipt.</li>
              <li><strong>Our IT and hosting providers</strong>, only as needed to run and secure the website.</li>
              <li><strong>Authorities</strong>, where the law requires it.</li>
            </ul>
            <p>
              Some of these providers may process information outside South Africa. When
              they do, we rely on providers that are bound by agreements and safeguards
              giving a level of protection comparable to POPIA.
            </p>
          </section>

          <section id="storage" aria-labelledby="storage-title">
            <h2 id="storage-title">5. Browser storage and cookies</h2>
            <p>
              We do not use advertising or tracking cookies, and we do not use analytics.
              The site stores a few items in your own browser so that it works properly:
            </p>
            <ul>
              <li>Your careers search filters, so they are remembered next time.</li>
              <li>A draft of the job-order form, kept only until you close the browser tab.</li>
              <li>For IMFORCE staff only, a sign-in session that ends when the tab closes.</li>
            </ul>
            <p>You can clear these at any time in your browser settings.</p>
          </section>

          <section id="retention" aria-labelledby="retention-title">
            <h2 id="retention-title">6. How long we keep it</h2>
            <p>
              We keep enquiries and job orders only as long as we need them for the purpose
              they were collected for, and payment records for as long as tax law requires.
              Security logs are deleted automatically after 180 days. When information is no
              longer needed, we delete it or make it anonymous.
            </p>
          </section>

          <section id="security" aria-labelledby="security-title">
            <h2 id="security-title">7. How we keep it safe</h2>
            <p>
              Information travels over encrypted connections (HTTPS). Only authorised IMFORCE
              staff can see enquiries, and they must sign in. Our systems are monitored for
              suspicious activity. If a breach affects your information, we will notify you and
              the Information Regulator as POPIA requires.
            </p>
          </section>

          <section id="rights" aria-labelledby="rights-title">
            <h2 id="rights-title">8. Your rights</h2>
            <p>Under POPIA you may ask us to:</p>
            <ul>
              <li>confirm whether we hold your information and give you a copy;</li>
              <li>correct information that is wrong or out of date;</li>
              <li>delete information we no longer have a reason to keep;</li>
              <li>stop using your information, or stop direct marketing (we do not send any).</li>
            </ul>
            <p>We may ask you to confirm your identity before we act on a request.</p>
          </section>

          <section id="contact" aria-labelledby="contact-title">
            <h2 id="contact-title">9. Contact and complaints</h2>
            <p>
              For privacy questions or requests, email{' '}
              <a href="mailto:info@imforce.co.za?subject=Privacy%20request">info@imforce.co.za</a>{' '}
              with “Privacy request” in the subject, or call <a href="tel:0334920600">033 492 0600</a>.
            </p>
            <p>
              If you are not satisfied with our response, you may complain to the Information
              Regulator (South Africa) at{' '}
              <a href="https://inforegulator.org.za" target="_blank" rel="noopener noreferrer">inforegulator.org.za</a>.
            </p>
          </section>
        </article>
      </main>
    </>
  )
}

export default PrivacyPolicy
