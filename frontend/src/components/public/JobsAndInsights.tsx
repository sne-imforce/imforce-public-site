import { useEffect, useRef, useState } from 'react'
import './JobsAndInsights.css'

type Vacancy = {
  id: string
  title: string
  location: string
  employmentType: string
  posted: string
  summary: string
  responsibilities: string[]
}

const urgentVacancies: Vacancy[] = [
  {
    id: 'urgent-operations',
    title: 'Sample: Operations Manager',
    location: 'Location to be confirmed',
    employmentType: 'Permanent',
    posted: 'Urgent opportunity',
    summary:
      'A sample vacancy preview for an experienced operations professional ready for their next step.',
    responsibilities: [
      'Coordinate day-to-day operations and support team delivery.',
      'Review processes and identify opportunities for improvement.',
      'Work with colleagues to meet role and business requirements.',
    ],
  },
  {
    id: 'urgent-finance',
    title: 'Sample: Finance Administrator',
    location: 'Location to be confirmed',
    employmentType: 'Permanent',
    posted: 'Urgent opportunity',
    summary:
      'A sample vacancy preview for a detail-oriented finance professional.',
    responsibilities: [
      'Assist with routine financial administration and record keeping.',
      'Prepare information for internal reports and reconciliations.',
      'Support the finance team with day-to-day tasks.',
    ],
  },
]

const recentVacancies: Vacancy[] = [
  {
    id: 'recent-human-resources',
    title: 'Sample: Human Resources Officer',
    location: 'Location to be confirmed',
    employmentType: 'Permanent',
    posted: 'Recently added',
    summary:
      'A sample preview for an HR professional who enjoys supporting people and teams.',
    responsibilities: [
      'Support recruitment, onboarding and employee administration.',
      'Maintain accurate people records and documentation.',
      'Respond to routine employee and manager enquiries.',
    ],
  },
  {
    id: 'recent-sales',
    title: 'Sample: Sales Representative',
    location: 'Location to be confirmed',
    employmentType: 'Permanent',
    posted: 'Recently added',
    summary:
      'A sample preview for a customer-focused professional with strong communication skills.',
    responsibilities: [
      'Build and maintain professional customer relationships.',
      'Understand customer requirements and present suitable solutions.',
      'Keep sales activity and customer records up to date.',
    ],
  },
  {
    id: 'recent-engineering',
    title: 'Sample: Engineering Technician',
    location: 'Location to be confirmed',
    employmentType: 'Permanent',
    posted: 'Recently added',
    summary:
      'A sample preview for a technically minded candidate who values quality work.',
    responsibilities: [
      'Assist with technical inspections and routine maintenance.',
      'Follow workplace quality, safety and operating procedures.',
      'Record work completed and escalate issues when needed.',
    ],
  },
]

const insightCards = [
  {
    category: 'For employers',
    title: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    description:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer nec odio. Praesent libero. Sed cursus ante dapibus diam.',
  },
  {
    category: 'For job seekers',
    title: 'Sed nisi. Nulla quis sem at nibh elementum imperdiet.',
    description:
      'Duis sagittis ipsum. Praesent mauris. Fusce nec tellus sed augue semper porta. Mauris massa.',
  },
  {
    category: 'Workplace insights',
    title: 'Donec sodales sagittis magna. Sed consequat.',
    description:
      'Vestibulum lacinia arcu eget nulla. Class aptent taciti sociosqu ad litora torquent per conubia nostra.',
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
    <button
      className="vacancy-card"
      type="button"
      onClick={(event) => onSelect(vacancy, event.currentTarget)}
      aria-label={`View details for ${vacancy.title}`}
    >
      <span className="vacancy-card__badges">
        <span className={`vacancy-badge${urgent ? ' vacancy-badge--urgent' : ''}`}>
          {urgent ? 'Urgent' : 'Recently added'}
        </span>
        <span className="vacancy-badge vacancy-badge--sample">Sample listing</span>
      </span>
      <span className="vacancy-card__title">{vacancy.title}</span>
      <span className="vacancy-card__meta">
        <span>{vacancy.location}</span>
        <span>{vacancy.employmentType}</span>
      </span>
      <span className="vacancy-card__summary">{vacancy.summary}</span>
      <span className="vacancy-card__action">View vacancy details</span>
    </button>
  )
}

function JobsAndInsights() {
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
            These sample cards are for layout preview only. Approved vacancy
            information and matching application links will appear when
            available.
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
              {recentVacancies.map((vacancy) => (
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
              Illustrative vacancy details · {selectedVacancy.posted}
            </p>
            <h2 id="vacancy-dialog-title">{selectedVacancy.title}</h2>
            <div className="vacancy-dialog__meta">
              <span>{selectedVacancy.location}</span>
              <span>{selectedVacancy.employmentType}</span>
            </div>
            <p>{selectedVacancy.summary}</p>
            <h3>Role overview</h3>
            <p>
              This sample content demonstrates where approved role information
              will appear. Final details, requirements and application
              instructions will be provided with each published vacancy.
            </p>
            <h3>Example responsibilities</h3>
            <ul>
              {selectedVacancy.responsibilities.map((responsibility) => (
                <li key={responsibility}>{responsibility}</li>
              ))}
            </ul>
            <p className="vacancy-dialog__notice">
              This is a sample listing, not an active vacancy.
            </p>
          </div>
        )}
      </dialog>
    </>
  )
}

export default JobsAndInsights
