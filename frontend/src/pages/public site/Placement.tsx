import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import Navbar from '../../components/public/Navbar'
import './Placement.css'

const placementSteps = [
  {
    title: 'Share the role',
    description:
      'Tell IMFORCE about the job, its location, the number of people needed and the skills required.',
  },
  {
    title: 'Confirm the details',
    description:
      'Review the job information and recruitment agreement before moving forward.',
  },
  {
    title: 'Activate the job order',
    description:
      'The R499 activation fee is charged once per job description, regardless of the number of hires for that role.',
  },
  {
    title: 'Review candidates',
    description:
      'An authorized IMFORCE team member must approve the advert before it appears publicly. Employers review candidates shared for their specific role.',
  },
]

function Placement() {
  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    const previousDescription = description?.content

    document.title =
      'Permanent Staffing and Placement Services | IMFORCE Talent Recruitment'
    if (description) {
      description.content =
        'Learn about IMFORCE permanent staffing and placement services for South African employers and candidates, including the recruitment process and estimated fees.'
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
      <main className="placement-page">
        <section className="placement-hero" aria-labelledby="placement-title">
          <div className="placement-shell placement-hero__inner">
            <p className="placement-eyebrow">Permanent staffing</p>
            <h1 id="placement-title">
              Permanent placement, built around the needs of the role.
            </h1>
            <p className="placement-hero__intro">
              IMFORCE connects South African employers and candidates through
              permanent recruitment via our Pietermaritzburg-based recruitment
              agency. Employers share their requirements; candidates can
              explore approved vacancies and apply to the matching role.
            </p>
            <div className="placement-hero__actions">
              <Link className="placement-button" to="/employers#job-order">
                Hire permanent staff
              </Link>
              <Link
                className="placement-button placement-button--outline"
                to="/careers"
              >
                Explore careers
              </Link>
            </div>
          </div>
        </section>

        <section className="placement-section placement-shell">
          <div className="placement-section__heading">
            <p className="placement-eyebrow placement-eyebrow--blue">
              For employers
            </p>
            <h2>How permanent recruitment works</h2>
            <p>
              A clear job brief helps set expectations for the employer,
              recruiter and candidates throughout the placement process.
            </p>
          </div>

          <div className="placement-steps">
            {placementSteps.map((step, index) => (
              <article className="placement-step" key={step.title}>
                <span className="placement-step__number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>

          <aside className="placement-note">
            <strong>Advert approval:</strong> Paying an activation fee does not
            publish a job automatically. An authorized IMFORCE staff member
            must review and approve the advert first.
          </aside>
        </section>

        <section className="placement-section placement-section--soft">
          <div className="placement-shell placement-audiences">
            <article className="placement-audience">
              <p className="placement-eyebrow placement-eyebrow--blue">
                For employers
              </p>
              <h3>Looking for the right person?</h3>
              <p>
                Prepare a job order with the role, location, number of hires,
                duties, requirements, qualifications, working hours, salary
                range and closing date. The employer page currently provides a
                preview only; secure submission and recruiter tracking are not
                connected.
              </p>
              <Link
                className="placement-button placement-button--primary"
                to="/employers#job-order"
              >
                View employer job order
              </Link>
            </article>
            <article className="placement-audience">
              <p className="placement-eyebrow placement-eyebrow--blue">
                For candidates
              </p>
              <h3>Looking for a permanent role?</h3>
              <p>
                Browse approved vacancies and apply once to the matching
                opportunity through its Nexora AI application link. The
                listings currently shown on Careers are examples, not active
                openings.
              </p>
              <Link
                className="placement-button placement-button--primary"
                to="/careers"
              >
                Visit Careers
              </Link>
            </article>
          </div>
        </section>

        <section className="placement-shell placement-fees" aria-labelledby="placement-fees-title">
          <div className="placement-fees__copy">
            <p className="placement-eyebrow placement-eyebrow--blue">
              Fees and estimates
            </p>
            <h2 id="placement-fees-title">
              Understand the estimated placement fees.
            </h2>
            <p>
              The placement fee is calculated per successful hire using the
              agreed annual cost to company (CTC). Any estimate is subject to
              the final salary or CTC and the signed recruitment agreement.
            </p>
            <ul className="placement-fees__list">
              <li>
                The placement fee estimate is 10% of annual CTC per successful
                hire, payable over 12 monthly instalments.
              </li>
              <li>
                The R499 activation fee is per job description, not per hire,
                and is credited against the first placement invoice if a
                placement proceeds.
              </li>
              <li>
                If a job is put on hold or cancelled, the activation fee is
                forfeited. Restarting within 90 days does not require another
                fee; after 90 days a new R499 fee is required.
              </li>
              <li>
                VAT treatment is still to be confirmed by IMFORCE Finance.
              </li>
            </ul>
          </div>

          <aside className="placement-fees__amount">
            <span>Job activation fee</span>
            <strong>R499</strong>
            <p>
              One fee per job description, regardless of the number of hires
              for that role.
            </p>
            <Link
              className="placement-button placement-button--primary"
              to="/fee-calculator"
            >
              Estimate placement fees
            </Link>
          </aside>
        </section>

        <section className="placement-cta">
          <div className="placement-shell">
            <p className="placement-eyebrow">Take the next step</p>
            <h2>Explore permanent staffing with IMFORCE.</h2>
            <p>
              Employers can review the job-order process, and candidates can
              explore the current Careers page for approved opportunities.
            </p>
            <div className="placement-cta__actions">
              <Link className="placement-button" to="/employers">
                For employers
              </Link>
              <Link
                className="placement-button placement-button--outline"
                to="/careers"
              >
                For job seekers
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}

export default Placement
