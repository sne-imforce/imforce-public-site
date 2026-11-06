import { useEffect, useRef, useState } from 'react'
import { useRecruiterVacancies } from '../../data/recruiterVacancies'
import { recentVacancies, urgentVacancies, type Vacancy } from '../../data/vacancies'
import './JobsAndInsights.css'

const insightCards = [
  {
    category: 'For employers',
    title: 'Permanent staffing built around role fit',
    description:
      'From shortlist to placement, IMFORCE helps employers connect with candidates who match job requirements, values and operational needs.',
  },
  {
    category: 'For job seekers',
    title: 'Clear opportunities across South African industries',
    description:
      'Job seekers can explore roles in manufacturing, logistics, hospitality, retail, finance, operations and more through a practical recruitment process.',
  },
  {
    category: 'Workplace insights',
    title: 'Thoughtful recruitment that keeps momentum',
    description:
      'A transparent process helps hiring teams and candidates move decisively, with the right information at each step of the journey.',
  },
]

const imforceHighlights = [
  {
    value: '10',
    suffix: 'years',
    label: 'In operation',
    description: 'A decade of experience supporting workforce needs.',
  },
  {
    value: 'End-to-end',
    suffix: '',
    label: 'Workforce solutions',
    description: 'Staffing, payroll, warehousing and manufacturing support.',
  },
  {
    value: 'People',
    suffix: 'first',
    label: 'Permanent placement',
    description: 'A thoughtful approach to connecting people and opportunities.',
  },
  {
    value: 'Clear',
    suffix: 'next steps',
    label: 'For employers and candidates',
    description: 'Straightforward journeys to help businesses and people move forward.',
  },
]

type VacancyCardProps = {
  vacancy: Vacancy
  urgent?: boolean
  onSelect: (vacancy: Vacancy, trigger: HTMLButtonElement) => void
}

function VacancyCard({ vacancy, urgent = false, onSelect }: VacancyCardProps) {
  return (
    <article className="vacancy-card">
      <span className="vacancy-card__badges">
        <span className={`vacancy-badge${urgent ? ' vacancy-badge--urgent' : ''}`}>
          {urgent ? 'Urgent' : 'Recently added'}
        </span>
        <span className="vacancy-badge vacancy-badge--sample">
          {vacancy.source === 'recruiter' ? 'Recruiter post · preview' : 'Sample listing'}
        </span>
      </span>
      <span className="vacancy-card__title">{vacancy.title}</span>
      <span className="vacancy-card__meta">
        <span>{vacancy.location}</span>
        <span>{vacancy.employmentType}</span>
        {vacancy.salary && <span>{vacancy.salary}</span>}
      </span>
      <span className="vacancy-card__summary">{vacancy.summary}</span>
      <div className="vacancy-card__actions">
        <button
          className="vacancy-card__details"
          type="button"
          onClick={(event) => onSelect(vacancy, event.currentTarget)}
        >
          View vacancy details
        </button>
      </div>
    </article>
  )
}

function JobsAndInsights() {
  const recruiterVacancies = useRecruiterVacancies()
  const [selectedVacancy, setSelectedVacancy] = useState<Vacancy | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (selectedVacancy && dialog && !dialog.open) dialog.showModal()
  }, [selectedVacancy])

  const closeDetails = () => {
    setSelectedVacancy(null)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const selectVacancy = (vacancy: Vacancy, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger
    setSelectedVacancy(vacancy)
  }
  const applicationUrl = (() => {
    if (!selectedVacancy?.applicationUrl) return null

    try {
      const destination = new URL(selectedVacancy.applicationUrl)
      return destination.protocol === 'https:' ? destination.href : null
    } catch (error) {
      console.error(
        `Invalid application URL for vacancy "${selectedVacancy.id}".`,
        error,
      )
      return null
    }
  })()

  return (
    <>
      <section className="vacancies-section" aria-labelledby="vacancies-title">
        <div className="vacancies-section__inner">
          <div className="vacancies-section__heading">
            <div>
              <p className="content-eyebrow">Take your next step</p>
              <h2 id="vacancies-title">Find your next opportunity</h2>
              <p className="vacancies-section__intro">
                Explore a selection of roles. Select a vacancy to view its full
                details.
              </p>
            </div>
            <a className="vacancies-section__all-link" href="/careers">
              Explore all vacancies
            </a>
          </div>

          <aside className="vacancies-preview-note">
            Sample cards are illustrative. Recruiter-created preview vacancies
            are stored in this browser only.
          </aside>

          <section className="vacancy-group" aria-labelledby="urgent-vacancies-title">
            <div className="vacancy-group__heading">
              <div>
                <p className="content-eyebrow content-eyebrow--urgent">Priority openings</p>
                <h3 id="urgent-vacancies-title">Urgent jobs</h3>
              </div>
            </div>
            <div className="vacancy-grid vacancy-grid--urgent">
              {urgentVacancies.map((vacancy) => (
                <VacancyCard
                  key={vacancy.id}
                  vacancy={vacancy}
                  urgent
                  onSelect={selectVacancy}
                />
              ))}
            </div>
          </section>

          <section className="vacancy-group" aria-labelledby="recent-vacancies-title">
            <div className="vacancy-group__heading">
              <div>
                <p className="content-eyebrow">Fresh opportunities</p>
                <h3 id="recent-vacancies-title">Most recent jobs</h3>
              </div>
            </div>
            <div className="vacancy-grid">
              {[...recruiterVacancies, ...recentVacancies].map((vacancy) => (
                <VacancyCard
                  key={vacancy.id}
                  vacancy={vacancy}
                  onSelect={selectVacancy}
                />
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="insights-section" aria-labelledby="insights-title">
        <div className="insights-section__inner">
          <div className="insights-section__heading">
            <p className="content-eyebrow">Ideas for better work</p>
            <h2 id="insights-title">Hiring trends and insights</h2>
          </div>
          <div className="insights-grid">
            {insightCards.map((card) => (
              <article className="insight-card" key={card.category}>
                <p className="insight-card__category">{card.category}</p>
                <h3>{card.title}</h3>
                <p>{card.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="why-imforce" aria-labelledby="why-imforce-title">
        <div className="why-imforce__inner">
          <div className="why-imforce__heading">
            <p className="content-eyebrow">Your workforce, simplified</p>
            <h2 id="why-imforce-title">Why IMFORCE?</h2>
            <p>
              Workforce support built around your business and the people who
              help it thrive.
            </p>
          </div>
          <div className="why-imforce__grid">
            {imforceHighlights.map((highlight) => (
              <article className="why-imforce__card" key={highlight.label}>
                <p className="why-imforce__value">
                  <strong>{highlight.value}</strong>
                  {highlight.suffix && <span>{highlight.suffix}</span>}
                </p>
                <h3>{highlight.label}</h3>
                <p>{highlight.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <dialog
        className="vacancy-dialog"
        ref={dialogRef}
        aria-labelledby="vacancy-dialog-title"
        onClose={closeDetails}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            dialogRef.current?.close()
          }
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close()
        }}
      >
        {selectedVacancy && (
          <div className="vacancy-dialog__content">
            <button
              className="vacancy-dialog__close"
              type="button"
              aria-label="Close vacancy details"
              onClick={() => dialogRef.current?.close()}
            >
              Close
            </button>
            <p className="content-eyebrow">
              {selectedVacancy.source === 'recruiter'
                ? 'Recruiter-posted preview'
                : 'Illustrative vacancy details'}{' '}
              · {selectedVacancy.posted}
            </p>
            <h2 id="vacancy-dialog-title">{selectedVacancy.title}</h2>
            <div className="vacancy-dialog__meta">
              <span>{selectedVacancy.location}</span>
              <span>{selectedVacancy.employmentType}</span>
              {selectedVacancy.salary && <span>{selectedVacancy.salary}</span>}
            </div>
            <p>{selectedVacancy.summary}</p>
            <h3>Role overview</h3>
            <p>
              This sample content demonstrates where approved role information
              will appear. Final details, requirements and application
              instructions will be provided with each published vacancy.
            </p>
            <h3>Key responsibilities</h3>
            <ul>
              {selectedVacancy.responsibilities.map((responsibility) => (
                <li key={responsibility}>{responsibility}</li>
              ))}
            </ul>
            <p className="vacancy-dialog__notice">
              {selectedVacancy.source === 'recruiter'
                ? 'Prototype post: this vacancy is saved only in this browser. Applications are not submitted or stored.'
                : 'This is a sample listing, not an active vacancy.'}
            </p>
            {applicationUrl ? (
              <a
                className="vacancy-dialog__apply"
                href={applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Apply via IMFORCE
              </a>
            ) : (
              <button
                className="vacancy-dialog__apply"
                type="button"
                disabled
                title="The application link is not available yet."
              >
                Apply via IMFORCE
              </button>
            )}
          </div>
        )}
      </dialog>
    </>
  )
}

export default JobsAndInsights
