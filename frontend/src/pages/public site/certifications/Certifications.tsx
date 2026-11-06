import { useEffect, useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Navbar from '../../../components/public/Navbar'
import './Certifications.css'

function Certifications() {
  const location = useLocation()

  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    const previousDescription = description?.content

    document.title =
      'Certifications and Credentials | IMFORCE Talent Recruitment'
    if (description) {
      description.content =
        'View certification and credential information for IMFORCE Talent Recruitment. Details and evidence will be published after verification and approval.'
    }

    return () => {
      document.title = previousTitle
      if (description && previousDescription !== undefined) {
        description.content = previousDescription
      }
    }
  }, [])

  useLayoutEffect(() => {
    const sectionId = location.hash.slice(1)
    if (sectionId !== 'certifications' && sectionId !== 'credentials') return

    document.getElementById(sectionId)?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  return (
    <>
      <Navbar />
      <main className="certifications-page">
        <section
          className="certifications-hero"
          aria-labelledby="certifications-title"
        >
          <div className="certifications-shell certifications-hero__inner">
            <p className="certifications-eyebrow">Company information</p>
            <h1 id="certifications-title">
              Certifications and credentials.
            </h1>
            <p>
              Find verified information about IMFORCE Talent Recruitment’s
              certifications and company credentials. We publish claims only
              when the supporting information has been confirmed.
            </p>
            <nav
              className="certifications-hero__links"
              aria-label="On this page"
            >
              <a href="#certifications">Certifications</a>
              <a href="#credentials">Credentials</a>
            </nav>
          </div>
        </section>

        <section
          className="certifications-section certifications-shell"
          id="certifications"
          aria-labelledby="certifications-section-title"
        >
          <div className="certifications-section__heading">
            <p className="certifications-eyebrow certifications-eyebrow--blue">
              Formal certification
            </p>
            <h2 id="certifications-section-title">
              Certifications held by IMFORCE
            </h2>
            <p>
              This section is for formal certificates issued by an authorized
              certification body, with details checked against the supporting
              evidence.
            </p>
          </div>
          <div className="certifications-empty">
            <h3>Verified certification details are not available here yet.</h3>
            <p>
              No certificate details or evidence have been supplied to this
              website for publication. This does not confirm whether IMFORCE
              holds external certifications. We will update this section when
              the details and evidence are provided and approved.
            </p>
            <a href="mailto:admin@imforce.co.za">
              Ask IMFORCE about certifications
            </a>
          </div>
        </section>

        <section
          className="credentials-section"
          id="credentials"
          aria-labelledby="credentials-section-title"
        >
          <div className="certifications-shell">
            <div className="certifications-section__heading">
              <p className="certifications-eyebrow certifications-eyebrow--blue">
                Company credentials
              </p>
              <h2 id="credentials-section-title">
                Verified company information
              </h2>
              <p>
                Credentials are supporting company details that help visitors
                understand who they are dealing with. Information is shown only
                when it has been confirmed and approved for public use.
              </p>
            </div>
            <div className="certifications-empty">
              <h3>Verified credential details are not available here yet.</h3>
              <p>
                No credential information has been approved for publication on
                this page. IMFORCE can add confirmed details and supporting
                documents when they are supplied.
              </p>
              <a href="mailto:admin@imforce.co.za">
                Contact IMFORCE for company information
              </a>
            </div>
          </div>
        </section>

        <section className="certifications-contact certifications-shell">
          <div>
            <p className="certifications-eyebrow certifications-eyebrow--blue">
              Need more information?
            </p>
            <h2>Contact IMFORCE directly.</h2>
            <p>
              For current certification or company credential enquiries, email
              the IMFORCE team.
            </p>
          </div>
          <a
            className="certifications-button"
            href="mailto:admin@imforce.co.za"
          >
            Email admin@imforce.co.za
          </a>
        </section>
      </main>
    </>
  )
}

export default Certifications
