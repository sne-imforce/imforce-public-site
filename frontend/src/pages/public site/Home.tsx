import ActionLink from '../../components/shared/ActionLink'
import SiteFooter from '../../components/public/SiteFooter'
import SiteHeader from '../../components/public/SiteHeader'

const employerSteps = [
  {
    number: '01',
    title: 'Tell us about the role',
    description:
      'Share the position, the skills you need and what success looks like for your team.',
  },
  {
    number: '02',
    title: 'We find the right fit',
    description:
      'Our recruitment team works with you to identify suitable people for the opportunity.',
  },
  {
    number: '03',
    title: 'Meet your shortlist',
    description:
      'Review candidates introduced by your recruiter and take the next step together.',
  },
]

function Home() {
  return (
    <>
      <SiteHeader />
      <main id="home">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span /> IMFORCE talent recruitment</p>
            <h1>Find the people who move your business forward.</h1>
            <p className="hero-description">
              Permanent staffing and placement, built around the people behind
              every role. We connect businesses with talent ready to make a
              difference.
            </p>
            <div className="hero-actions">
              <ActionLink href="#employers">
                I&apos;m hiring <span aria-hidden="true">→</span>
              </ActionLink>
              <ActionLink href="#careers" variant="text">
                I&apos;m looking for work <span aria-hidden="true">→</span>
              </ActionLink>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-art-orbit hero-art-orbit-one" />
            <div className="hero-art-orbit hero-art-orbit-two" />
            <div className="hero-art-center">
              <span className="hero-art-spark">✳</span>
              <span>Better work<br />starts with<br />the right fit.</span>
            </div>
            <span className="hero-art-label">People first</span>
          </div>
        </section>

        <section className="home-intro" id="permanent-placement">
          <div className="section-wrap intro-grid">
            <div>
              <p className="eyebrow">Permanent staffing &amp; placement</p>
              <h2>Good hires start with understanding people.</h2>
            </div>
            <p>
              The right hire is about more than a job title. We take the time
              to understand the role, the workplace and the people who will
              thrive there—so businesses and candidates can move forward with
              confidence.
            </p>
          </div>
        </section>

        <section className="employer-section section-wrap" id="employers">
          <div className="section-heading">
            <div>
              <p className="eyebrow">For employers</p>
              <h2>Make your next hire a good one.</h2>
            </div>
            <ActionLink
              href="mailto:info@imforce.co.za?subject=Employer%20job%20order%20enquiry"
              variant="secondary"
            >
              Talk to our team <span aria-hidden="true">→</span>
            </ActionLink>
          </div>
          <div className="step-grid">
            {employerSteps.map((step) => (
              <article className="step-card" key={step.number}>
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
          <aside className="fee-note">
            <span className="fee-note-label">Job activation fee</span>
            <p>
              <strong>R499 per job description.</strong> Credited against the
              first permanent-placement invoice. VAT treatment to be confirmed
              by IMFORCE Finance.
            </p>
          </aside>
        </section>

        <section className="candidate-section" id="careers">
          <div className="candidate-inner section-wrap">
            <div>
              <p className="eyebrow">For job seekers</p>
              <h2>Your next opportunity starts with the right connection.</h2>
              <p>
                Approved vacancies will be listed here. When you apply, you’ll
                complete one application on Nexora AI for that specific role.
              </p>
            </div>
            <div className="candidate-card">
              <span className="candidate-card-icon" aria-hidden="true">↗</span>
              <h3>Looking for a role?</h3>
              <p>
                Get in touch with our team while we prepare the vacancy
                listings.
              </p>
              <ActionLink
                href="mailto:info@imforce.co.za?subject=Job%20seeker%20enquiry"
                variant="text"
              >
                Contact IMFORCE <span aria-hidden="true">→</span>
              </ActionLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  )
}

export default Home
