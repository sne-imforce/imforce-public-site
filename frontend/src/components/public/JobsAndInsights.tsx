import { useNavigate } from 'react-router-dom'
import { useRecruiterVacancies } from '../../data/recruiterVacancies'
import type { Vacancy } from '../../data/vacancies'
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
  onSelect: (vacancy: Vacancy) => void
}

function VacancyCard({ vacancy, urgent = false, onSelect }: VacancyCardProps) {
  return (
    <article className="vacancy-card">
      <span className="vacancy-card__badges">
        <span className={`vacancy-badge${urgent ? ' vacancy-badge--urgent' : ''}`}>
          {urgent ? 'Urgent' : 'Recently added'}
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
          onClick={() => onSelect(vacancy)}
        >
          View vacancy details
        </button>
      </div>
    </article>
  )
}

function JobsAndInsights() {
  const {
    vacancies,
    isLoading,
    error,
    reload,
  } = useRecruiterVacancies()
  const navigate = useNavigate()
  const urgentVacancies = vacancies.filter((vacancy) => vacancy.urgent)
  const recentVacancies = vacancies.filter((vacancy) => !vacancy.urgent)

  const selectVacancy = (vacancy: Vacancy) => {
    navigate(`/careers#job-${vacancy.id}`)
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

          <aside className="vacancies-note">
            Vacancies shown here are live listings published by the IMFORCE team.
          </aside>

          {error ? (
            <div className="vacancies-empty" role="alert">
              <p>Current vacancies could not be loaded.</p>
              <button type="button" onClick={() => void reload()}>
                Try again
              </button>
            </div>
          ) : isLoading ? (
            <p className="vacancies-empty" role="status">
              Loading current vacancies…
            </p>
          ) : vacancies.length === 0 ? (
            <p className="vacancies-empty">
              There are no current vacancies. Please check back soon.
            </p>
          ) : (
            <>
              {urgentVacancies.length > 0 && (
                <section
                  className="vacancy-group"
                  aria-labelledby="urgent-vacancies-title"
                >
                  <div className="vacancy-group__heading">
                    <div>
                      <p className="content-eyebrow content-eyebrow--urgent">
                        Priority openings
                      </p>
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
              )}

              {recentVacancies.length > 0 && (
                <section
                  className="vacancy-group"
                  aria-labelledby="recent-vacancies-title"
                >
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
              )}
            </>
          )}
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
    </>
  )
}

export default JobsAndInsights
