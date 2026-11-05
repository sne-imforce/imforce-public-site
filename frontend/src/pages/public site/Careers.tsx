import { useEffect, useMemo, useRef, useState } from 'react'
import { FiSearch } from 'react-icons/fi'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../../components/public/Navbar'
import { getIndustryBySlug, industries } from '../../data/industries'
import { recentVacancies, urgentVacancies, type Vacancy } from '../../data/vacancies'
import './Careers.css'

const vacancies = [...urgentVacancies, ...recentVacancies]
const categories = [...new Set(vacancies.map((vacancy) => vacancy.category))].sort()
const locations = [...new Set(vacancies.map((vacancy) => vacancy.location))].sort()
const employmentTypes = [...new Set(vacancies.map((vacancy) => vacancy.employmentType))].sort()
const filterStorageKey = 'imforce-careers-filters'

type Filters = {
  industry: string
  category: string
  location: string
  employmentType: string
}

const defaultFilters: Filters = {
  industry: 'all',
  category: 'all',
  location: 'all',
  employmentType: 'all',
}

function getSecureApplicationUrl(value: string) {
  try {
    const destination = new URL(value)
    return destination.protocol === 'https:' ? destination.href : null
  } catch {
    return null
  }
}

function loadSavedFilters(): Filters {
  const industryFromUrl = getIndustryBySlug(
    new URLSearchParams(window.location.search).get('industry'),
  )
  const defaultWithUrlIndustry = {
    ...defaultFilters,
    industry: industryFromUrl?.name ?? defaultFilters.industry,
  }

  try {
    const saved = window.localStorage.getItem(filterStorageKey)
    if (!saved) return defaultWithUrlIndustry

    const parsed: unknown = JSON.parse(saved)
    if (typeof parsed !== 'object' || parsed === null) return defaultWithUrlIndustry

    const stored = parsed as Record<string, unknown>
    return {
      industry:
        industryFromUrl?.name ??
        (typeof stored.industry === 'string' &&
        (stored.industry === 'all' ||
          industries.some((industry) => industry.name === stored.industry))
          ? stored.industry
          : 'all'),
      category:
        typeof stored.category === 'string' &&
        (stored.category === 'all' || categories.includes(stored.category))
          ? stored.category
          : 'all',
      location:
        typeof stored.location === 'string' &&
        (stored.location === 'all' || locations.includes(stored.location))
          ? stored.location
          : 'all',
      employmentType:
        typeof stored.employmentType === 'string' &&
        (stored.employmentType === 'all' ||
          employmentTypes.includes(stored.employmentType))
          ? stored.employmentType
          : 'all',
    }
  } catch (error) {
    console.error('Unable to load saved careers filters.', error)
    return defaultWithUrlIndustry
  }
}

function Careers() {
  const location = useLocation()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Filters>(loadSavedFilters)
  const [selectedVacancy, setSelectedVacancy] = useState<Vacancy | null>(null)
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const applicationUrl = selectedVacancy?.applicationUrl
  const secureApplicationUrl = applicationUrl
    ? getSecureApplicationUrl(applicationUrl)
    : null
  const redirectMessage =
    redirectCountdown === 0 && !secureApplicationUrl
      ? 'The Nexora AI link for this role is not ready yet. Please contact IMFORCE for help.'
      : ''

  useEffect(() => {
    if (location.hash !== '#vacancies') return

    const animationFrame = window.requestAnimationFrame(() => {
      document.getElementById('vacancies')?.scrollIntoView()
    })
    return () => window.cancelAnimationFrame(animationFrame)
  }, [location.hash])

  useEffect(() => {
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    )
    const previousDescription = description?.content

    document.title = 'Careers & Job Search | IMFORCE Consolidated'
    if (description) {
      description.content =
        "We're hiring in Pietermaritzburg, Durban, Eastern Cape, Gauteng, and other regions of South Africa. Explore careers with IMFORCE Consolidated."
    }

    return () => {
      document.title = previousTitle
      if (description && previousDescription !== undefined) {
        description.content = previousDescription
      }
    }
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(filterStorageKey, JSON.stringify(filters))
    } catch (error) {
      console.error('Unable to save careers filter preferences.', error)
    }
  }, [filters])

  useEffect(() => {
    if (selectedVacancy && dialogRef.current && !dialogRef.current.open) {
      dialogRef.current.showModal()
    }
  }, [selectedVacancy])

  useEffect(() => {
    if (redirectCountdown === null || redirectCountdown === 0) return

    const timer = window.setTimeout(() => {
      setRedirectCountdown((current) =>
        current === null ? null : Math.max(current - 1, 0),
      )
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [redirectCountdown])

  useEffect(() => {
    if (redirectCountdown !== 0 || !applicationUrl) return
    if (!secureApplicationUrl) {
      console.error('The Nexora AI application link must be a valid HTTPS URL.')
      return
    }

    window.location.assign(secureApplicationUrl)
  }, [applicationUrl, redirectCountdown, secureApplicationUrl])

  const filteredVacancies = useMemo(() => {
    const query = search.trim().toLowerCase()

    return vacancies.filter((vacancy) => {
      const matchesSearch =
        !query ||
        [
          vacancy.title,
          vacancy.location,
          vacancy.region,
          vacancy.category,
          vacancy.employmentType,
          vacancy.summary,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)

      return (
        matchesSearch &&
        (filters.industry === 'all' ||
          vacancy.industry === filters.industry) &&
        (filters.category === 'all' || vacancy.category === filters.category) &&
        (filters.location === 'all' || vacancy.location === filters.location) &&
        (filters.employmentType === 'all' ||
          vacancy.employmentType === filters.employmentType)
      )
    })
  }, [filters, search])

  const openVacancy = (vacancy: Vacancy, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger
    setRedirectCountdown(null)
    setSelectedVacancy(vacancy)
  }

  const closeDialog = () => {
    setSelectedVacancy(null)
    setRedirectCountdown(null)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const resetFilters = () => {
    setSearch('')
    setFilters(defaultFilters)
    if (location.search) {
      navigate(`${location.pathname}${location.hash}`, { replace: true })
    }
  }

  return (
    <>
      <Navbar />
      <main className="careers-page">
        <section className="careers-hero" aria-labelledby="careers-title">
          <div className="careers-shell careers-hero__inner">
            <p className="careers-eyebrow">Careers at IMFORCE</p>
            <h1 id="careers-title">
              We're hiring in
              <span className="careers-hero__locations">
                {' '}Pietermaritzburg, Durban, Eastern Cape, Gauteng, and other
                regions of South Africa.
              </span>
            </h1>
            <p>
              Explore roles and discover where your experience could take you.
              Search and filter the sample listings below.
            </p>
            <a className="careers-hero__button" href="#vacancies">
              Browse opportunities
            </a>
          </div>
        </section>

        <section
          className="careers-listings careers-shell"
          id="vacancies"
          aria-labelledby="vacancies-title"
        >
          <div className="careers-listings__heading">
            <div>
              <p className="careers-eyebrow careers-eyebrow--blue">
                Take your next step
              </p>
              <h2 id="vacancies-title">Explore opportunities</h2>
              <p>
                These example vacancies demonstrate the job search experience.
                They are not active openings.
              </p>
            </div>
            <span className="careers-sample-count">
              {filteredVacancies.length} sample{' '}
              {filteredVacancies.length === 1 ? 'role' : 'roles'}
            </span>
          </div>

          <aside className="careers-notice">
            <strong>Sample listings only.</strong> Vacancy details are
            illustrative, and applications are not currently submitted or
            stored. Contact{' '}
            <a href="mailto:info@imforce.co.za">info@imforce.co.za</a> to ask
            about current openings, or email{' '}
            <a href="mailto:admin@imforce.co.za">admin@imforce.co.za</a>.
          </aside>

          <div className="careers-filters" role="group" aria-label="Filter vacancies">
            <label className="careers-search">
              <span>Search roles</span>
              <span className="careers-search__input">
                <FiSearch aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Job title, category or keyword"
                />
              </span>
            </label>

            <label>
              <span>Industry</span>
              <select
                value={filters.industry}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    industry: event.target.value,
                  }))
                }
              >
                <option value="all">All industries</option>
                {industries.map((industry) => (
                  <option value={industry.name} key={industry.slug}>
                    {industry.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Category</span>
              <select
                value={filters.category}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, category: event.target.value }))
                }
              >
                <option value="all">All categories</option>
                {categories.map((category) => (
                  <option value={category} key={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Location</span>
              <select
                value={filters.location}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, location: event.target.value }))
                }
              >
                <option value="all">All locations</option>
                {locations.map((location) => (
                  <option value={location} key={location}>
                    {location}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Employment type</span>
              <select
                value={filters.employmentType}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    employmentType: event.target.value,
                  }))
                }
              >
                <option value="all">All types</option>
                {employmentTypes.map((employmentType) => (
                  <option value={employmentType} key={employmentType}>
                    {employmentType}
                  </option>
                ))}
              </select>
            </label>

          </div>

          {filteredVacancies.length > 0 ? (
            <div className="careers-grid">
              {filteredVacancies.map((vacancy) => {
                const isUrgent = urgentVacancies.some(
                  (urgent) => urgent.id === vacancy.id,
                )

                return (
                  <article className="careers-card" key={vacancy.id}>
                    <div className="careers-card__badges">
                      <span>{isUrgent ? 'Urgent example' : 'Recent example'}</span>
                      <span>Sample role</span>
                    </div>
                    <h3>{vacancy.title}</h3>
                    <p className="careers-card__category">{vacancy.category}</p>
                    <p className="careers-card__summary">{vacancy.summary}</p>
                    <div className="careers-card__meta">
                      <span>{vacancy.location}</span>
                      <span>{vacancy.region}</span>
                      <span>{vacancy.employmentType}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => openVacancy(vacancy, event.currentTarget)}
                    >
                      View role details
                    </button>
                  </article>
                )
              })}
            </div>
          ) : (
            <div className="careers-empty">
              <h3>No matching sample roles</h3>
              <p>Try a different search or clear your filters.</p>
              <button type="button" onClick={resetFilters}>
                Clear filters
              </button>
            </div>
          )}
        </section>
      </main>

      <dialog
        className="careers-dialog"
        ref={dialogRef}
        aria-labelledby="careers-dialog-title"
        onClose={closeDialog}
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
          <div className="careers-dialog__content">
            <button
              className="careers-dialog__close"
              type="button"
              onClick={() => dialogRef.current?.close()}
            >
              Close
            </button>

            {redirectCountdown !== null ? (
              <>
                <p className="careers-eyebrow careers-eyebrow--blue">
                  Apply on Nexora AI
                </p>
                <h2 id="careers-dialog-title">You are going to another website</h2>
                <p className="careers-dialog__intro">
                  You will leave IMFORCE and apply on Nexora AI.
                </p>
                {redirectMessage ? (
                  <p className="careers-redirect__message" role="status">
                    {redirectMessage}
                  </p>
                ) : (
                  <p className="careers-redirect__countdown" role="status" aria-live="polite">
                    Opening in {redirectCountdown} seconds
                  </p>
                )}
                <button
                  className="careers-redirect__cancel"
                  type="button"
                  onClick={() => {
                    setRedirectCountdown(null)
                  }}
                >
                  {redirectMessage ? 'Back to role details' : 'Cancel'}
                </button>
              </>
            ) : (
              <>
                <p className="careers-eyebrow careers-eyebrow--blue">
                  Sample vacancy | {selectedVacancy.category}
                </p>
                <h2 id="careers-dialog-title">{selectedVacancy.title}</h2>
                <div className="careers-dialog__meta">
                  <span>{selectedVacancy.location}</span>
                  <span>{selectedVacancy.region}</span>
                  <span>{selectedVacancy.employmentType}</span>
                </div>
                <p>{selectedVacancy.summary}</p>
                <h3>Example responsibilities</h3>
                <ul>
                  {selectedVacancy.responsibilities.map((responsibility) => (
                    <li key={responsibility}>{responsibility}</li>
                  ))}
                </ul>
                <p className="careers-dialog__notice">
                  This is an illustrative sample, not an active vacancy.
                </p>
                <button
                  className="careers-dialog__apply"
                  type="button"
                  onClick={() => {
                    setRedirectCountdown(5)
                  }}
                >
                  Apply on Nexora AI
                </button>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  )
}

export default Careers