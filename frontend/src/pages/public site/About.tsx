import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Navbar from '../../components/public/Navbar'
import './About.css'

const industries = [
  'Manufacturing',
  'FMCG',
  'Hospitality',
  'Retail',
  'Engineering',
  'Finance',
  'Security',
  'Logistics',
  'IT',
]

const getIndustrySlug = (industry: string) =>
  industry.toLowerCase().replace(/[^a-z0-9]+/g, '-')

const getIndustryFromHash = (hash: string) =>
  industries.find((industry) => `#industry-${getIndustrySlug(industry)}` === hash) ?? ''

const approachSteps = [
  {
    number: '01',
    title: 'Understand the need',
    description:
      'We start with the role, the team and the requirements behind a successful match.',
  },
  {
    number: '02',
    title: 'Connect people and opportunity',
    description:
      'We focus on bringing employers and candidates together around the needs of the role.',
  },
  {
    number: '03',
    title: 'Make the next step clear',
    description:
      'A straightforward process helps both sides understand what happens next.',
  },
]

function About() {
  const location = useLocation()
  const [selectedIndustry, setSelectedIndustry] = useState(() =>
    getIndustryFromHash(window.location.hash),
  )
  const industriesDropdownRef = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    const previousDescription = description?.content

    document.title = 'About IMFORCE Consolidated | People-first recruitment'
    if (description) {
      description.content =
        'Learn about IMFORCE Consolidated, a South African recruitment company focused on permanent staffing and placement.'
    }

    return () => {
      document.title = previousTitle
      if (description && previousDescription !== undefined) {
        description.content = previousDescription
      }
    }
  }, [])

  useEffect(() => {
    const industry = getIndustryFromHash(location.hash)
    if (!industry) return

    industriesDropdownRef.current?.setAttribute('open', '')
    const optionId = `industry-${getIndustrySlug(industry)}`
    const animationFrame = window.requestAnimationFrame(() => {
      document.getElementById(optionId)?.scrollIntoView({ block: 'center' })
    })

    return () => window.cancelAnimationFrame(animationFrame)
  }, [location.hash])

  useEffect(() => {
    const selectIndustryFromHash = () => {
      const industry = getIndustryFromHash(window.location.hash)
      if (!industry) return

      setSelectedIndustry(industry)
      if (industriesDropdownRef.current) {
        industriesDropdownRef.current.open = true
      }
    }

    window.addEventListener('hashchange', selectIndustryFromHash)
    return () => window.removeEventListener('hashchange', selectIndustryFromHash)
  }, [])

  return (
    <>
      <Navbar />
      <main className="about-page">
        <section className="about-hero" aria-labelledby="about-title">
          <div className="about-hero__decoration" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="about-shell about-hero__inner">
            <p className="about-eyebrow">About IMFORCE</p>
            <h1 id="about-title">
              Better work begins with understanding people.
            </h1>
            <p className="about-hero__description">
              IMFORCE Consolidated is a South African recruitment company
              focused on permanent staffing and placement—bringing employers
              and candidates together around the right opportunity.
            </p>
            <div className="about-hero__actions">
              <a className="about-button about-button--light" href="#our-approach">
                Our approach
              </a>
              <Link className="about-button about-button--outline" to="/contact">
                Contact IMFORCE
              </Link>
            </div>
          </div>
        </section>

        <section className="about-intro about-shell" aria-labelledby="our-story-title">
          <div className="about-intro__label">
            <p className="about-eyebrow about-eyebrow--blue">Who we are</p>
            <h2 id="our-story-title">A decade of connecting people and work.</h2>
          </div>
          <div className="about-intro__copy">
            <p>
              IMFORCE has been operating for 10 years. We focus on permanent
              staffing and placement, helping employers find people whose
              skills fit the work and helping candidates take a considered next
              step in their careers.
            </p>
            <p>
              We know that every role has its own requirements and every
              workplace its own needs. Our approach starts by understanding
              those details, then making the recruitment process clear for
              everyone involved.
            </p>
          </div>
          <div className="about-tenure" aria-label="10 years in operation">
            <strong>10</strong>
            <span>years in operation</span>
          </div>
        </section>

        <section
          className="about-approach"
          id="our-approach"
          aria-labelledby="about-approach-title"
        >
          <div className="about-shell">
            <div className="about-section-heading">
              <p className="about-eyebrow about-eyebrow--blue">How we work</p>
              <h2 id="about-approach-title">A thoughtful path to the right fit.</h2>
              <p>
                Clear conversations and a people-first focus guide each step of
                the placement journey.
              </p>
            </div>
            <div className="about-steps">
              {approachSteps.map((step) => (
                <article className="about-step" key={step.number}>
                  <span className="about-step__number">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="about-industries about-shell" aria-labelledby="industries-title">
          <div className="about-industries__intro">
            <p className="about-eyebrow about-eyebrow--blue">Industry context</p>
            <h2 id="industries-title">Recruitment shaped by the work.</h2>
            <p>
              IMFORCE supports recruitment across a range of industries. Explore
              the areas we work in.
            </p>
          </div>
          <details
            className="about-industries__dropdown"
            ref={industriesDropdownRef}
          >
            <summary>
              <span>
                <span className="about-industries__label">Explore industries</span>
                <span className="about-industries__selection">
                  {selectedIndustry || 'Choose an industry'}
                </span>
              </span>
              <span className="about-industries__count">9 areas</span>
            </summary>
            <fieldset className="about-industries__options">
              <legend>Select an industry</legend>
              {industries.map((industry) => (
                <label
                  className="about-industries__option"
                  id={`industry-${getIndustrySlug(industry)}`}
                  key={industry}
                >
                  <input
                    type="radio"
                    name="industry"
                    value={industry}
                    checked={selectedIndustry === industry}
                    onChange={() => setSelectedIndustry(industry)}
                  />
                  <span>{industry}</span>
                </label>
              ))}
            </fieldset>
            <p>
              Industry areas include manufacturing, FMCG, hospitality, retail,
              engineering, finance, security, logistics and IT.
            </p>
          </details>
        </section>

        <section className="about-focus">
          <div className="about-shell about-focus__inner">
            <p className="about-eyebrow">Our focus</p>
            <h2>Permanent placement, with people at the centre.</h2>
            <p>
              Our public recruitment service is built around helping employers
              and candidates move forward through permanent staffing and
              placement. Each opportunity should be clear, relevant and
              grounded in the needs of the role.
            </p>
            <div className="about-focus__actions">
              <Link className="about-button about-button--light" to="/employers">
                For employers
              </Link>
              <Link className="about-button about-button--outline" to="/careers">
                For job seekers
              </Link>
            </div>
          </div>
        </section>

        <section className="about-contact about-shell" aria-labelledby="about-contact-title">
          <div>
            <p className="about-eyebrow about-eyebrow--blue">Start a conversation</p>
            <h2 id="about-contact-title">Let’s find the right next step.</h2>
          </div>
          <Link className="about-button about-button--primary" to="/contact">
            Get in touch
          </Link>
        </section>
      </main>
      <footer className="about-footer">
        <div className="about-shell about-footer__inner">
          <Link to="/" className="about-footer__brand">
            IMFORCE <span>CONSOLIDATED</span>
          </Link>
          <p>Permanent staffing and placement in South Africa.</p>
          <a href="mailto:info@imforce.co.za">info@imforce.co.za</a>
        </div>
      </footer>
    </>
  )
}

export default About
