import { useEffect, useMemo, useState } from 'react'
import {
  FiArrowRight,
  FiBriefcase,
  FiCalendar,
  FiDollarSign,
  FiMapPin,
  FiSearch,
} from 'react-icons/fi'
import { useLocation, useNavigate } from 'react-router-dom'
import Navbar from '../../components/public/Navbar'
import { getIndustryBySlug, industries } from '../../data/industries'
import {
  loadPublicVacancies,
  useRecruiterVacancies,
  useVacancyStatus,
} from '../../data/recruiterVacancies'
import type { Vacancy } from '../../data/vacancies'
import { formatDateDmy, formatSalary } from '../../utils/dates'
import './Careers.css'

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

function loadSavedFilters(vacancies: Vacancy[]): Filters {
  const categories = [...new Set(vacancies.map((vacancy) => vacancy.category))]
  const locations = [...new Set(vacancies.map((vacancy) => vacancy.location))]
  const employmentTypes = [
    ...new Set(vacancies.map((vacancy) => vacancy.employmentType)),
  ]
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
  const recruiterVacancies = useRecruiterVacancies()
  const vacancyStatus = useVacancyStatus()
  useEffect(() => { void loadPublicVacancies() }, [])
  const vacancies = useMemo(
    () => recruiterVacancies,
    [recruiterVacancies],
  )
  const categories = useMemo(
    () => [...new Set(vacancies.map((vacancy) => vacancy.category))].sort(),
    [vacancies],
  )
  const locations = useMemo(
    () => [...new Set(vacancies.map((vacancy) => vacancy.location))].sort(),
    [vacancies],
  )
  const employmentTypes = useMemo(
    () => [...new Set(vacancies.map((vacancy) => vacancy.employmentType))].sort(),
    [vacancies],
  )
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('q') ?? '')
  const [locationSearch, setLocationSearch] = useState(() => new URLSearchParams(window.location.search).get('location') ?? '')
  const [filters, setFilters] = useState<Filters>(() =>
    loadSavedFilters(recruiterVacancies),
  )
  const [selectedVacancyId, setSelectedVacancyId] = useState<string | null>(null)
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
      const matchesLocation = !locationSearch ||
        `${vacancy.location} ${vacancy.region}`.toLowerCase().includes(locationSearch.trim().toLowerCase())

      return (
        matchesSearch && matchesLocation &&
        (filters.industry === 'all' ||
          vacancy.industry === filters.industry) &&
        (filters.category === 'all' || vacancy.category === filters.category) &&
        (filters.location === 'all' || vacancy.location === filters.location) &&
        (filters.employmentType === 'all' ||
          vacancy.employmentType === filters.employmentType)
      )
    })
  }, [filters, locationSearch, search, vacancies])
  const hashVacancyId = location.hash.startsWith('#job-') ? location.hash.slice(5) : null
  const selectedVacancy =
    filteredVacancies.find((vacancy) => vacancy.id === hashVacancyId) ??
    filteredVacancies.find((vacancy) => vacancy.id === selectedVacancyId) ??
    filteredVacancies[0] ?? null

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

    document.title = 'Careers & Job Search | IMFORCE Talent Recruitment'
    if (description) {
      description.content =
        "We're hiring in Pietermaritzburg, Durban, Eastern Cape, Gauteng, and other regions of South Africa. Explore careers with IMFORCE Talent Recruitment."
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

  const handleSelectVacancy = (vacancy: Vacancy) => {
    setSelectedVacancyId(vacancy.id)
    const vacancyAnchor = `job-${vacancy.id}`
    if (window.location.hash !== `#${vacancyAnchor}`) {
      window.history.replaceState(null, '', `${window.location.pathname}#${vacancyAnchor}`)
    }
    window.requestAnimationFrame(() => {
      document.getElementById(vacancyAnchor)?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    })
  }

  const resetFilters = () => {
    setSearch('')
    setLocationSearch('')
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
              Search and filter current listings and preview roles below.
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
                Browse current vacancies published by the IMFORCE team.
              </p>
            </div>
            <span className="careers-role-count">
              {filteredVacancies.length}{' '}
              {filteredVacancies.length === 1 ? 'role' : 'roles'}
            </span>
          </div>

          {vacancyStatus.error && <p className="careers-notice" role="alert">{vacancyStatus.error}</p>}

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
            <div className="careers-layout">
              <div className="careers-job-list" role="list">
                {filteredVacancies.map((vacancy) => {
                  const isSelected = selectedVacancy?.id === vacancy.id

                  return (
                    <button
                      id={`job-${vacancy.id}`}
                      key={vacancy.id}
                      type="button"
                      className={`careers-job-card${isSelected ? ' careers-job-card--selected' : ''}`}
                      onClick={() => handleSelectVacancy(vacancy)}
                    >
                      {vacancy.isUrgent && <span className="careers-urgent-badge">Urgent</span>}
                      <span className="careers-job-card__location">
                        <FiMapPin aria-hidden="true" />
                        {vacancy.location}
                      </span>

                      <h3>{vacancy.title}</h3>

                      <div className="careers-job-card__meta">
                        <span>
                          <FiBriefcase aria-hidden="true" />
                          {vacancy.employmentType}
                        </span>
                        {vacancy.salary && (
                          <span>
                            <FiDollarSign aria-hidden="true" />
                            {formatSalary(vacancy.salary)}
                          </span>
                        )}
                      </div>

                      <p className="careers-job-card__summary">{vacancy.summary}</p>

                      <div className="careers-job-card__footer">
                        <span className="careers-job-card__cta">
                          View vacancy details
                        </span>
                        <span className="careers-job-card__date">
                          <FiCalendar aria-hidden="true" />
                          {formatDateDmy(vacancy.posted)}
                        </span>
                        <span className="careers-job-card__chevron">
                          <FiArrowRight aria-hidden="true" />
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>

              <aside className="careers-detail" aria-live="polite">
                {selectedVacancy ? (
                  <>
                    <div className="careers-detail__header">
                      <p className="careers-detail__eyebrow">
                        {selectedVacancy.category}
                      </p>
                      <h2>{selectedVacancy.title}</h2>

                      <div className="careers-detail__meta">
                        <span>
                          <FiMapPin aria-hidden="true" />
                          {selectedVacancy.location}
                        </span>
                        <span>
                          <FiBriefcase aria-hidden="true" />
                          {selectedVacancy.employmentType}
                        </span>
                        {selectedVacancy.salary && (
                          <span>
                            <FiDollarSign aria-hidden="true" />
                            {formatSalary(selectedVacancy.salary)}
                          </span>
                        )}
                        <span>
                          <FiCalendar aria-hidden="true" />
                          {formatDateDmy(selectedVacancy.posted)}
                        </span>
                        {selectedVacancy.closingDate && (
                          <span>
                            <FiCalendar aria-hidden="true" />
                            Closes {formatDateDmy(selectedVacancy.closingDate)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="careers-detail__actions">
                      {selectedVacancy.applicationUrl ? (
                        <a className="careers-detail__apply" href={selectedVacancy.applicationUrl} target="_blank" rel="noopener noreferrer">
                          Apply on Nexora AI <FiArrowRight aria-hidden="true" />
                        </a>
                      ) : (
                        <p className="careers-detail__apply-unavailable" role="status">
                          The application link for this vacancy is not available yet. <a href={`/contact?subject=${encodeURIComponent(`Enquiry about ${selectedVacancy.title}`)}`}>Contact IMFORCE</a> for help.
                        </p>
                      )}
                    </div>

                    <section className="careers-detail__section">
                      <h3>Role description</h3>
                      <p>{selectedVacancy.summary}</p>

                      {selectedVacancy.responsibilities.length > 0 && (
                        <>
                          <h4>Responsibilities</h4>
                          <ul>
                            {selectedVacancy.responsibilities.map(
                              (responsibility) => (
                                <li key={responsibility}>{responsibility}</li>
                              ),
                            )}
                          </ul>
                        </>
                      )}
                    </section>

                  </>
                ) : (
                  <div className="careers-empty careers-empty--detail">
                    <h3>{vacancyStatus.loading ? 'Loading vacancies' : 'No current vacancies'}</h3>
                    <p>{vacancyStatus.loading ? 'Please wait while openings load.' : 'Check back soon or contact our team about upcoming opportunities.'}</p>
                    <button type="button" onClick={resetFilters}>
                      Clear filters
                    </button>
                  </div>
                )}
              </aside>
            </div>
          ) : (
            <div className="careers-empty">
              <h3>{vacancyStatus.loading ? 'Loading vacancies' : 'No matching roles'}</h3>
              <p>{vacancyStatus.loading ? 'Please wait while openings load.' : 'Try a different search or clear your filters.'}</p>
              <button type="button" onClick={resetFilters}>
                Clear filters
              </button>
            </div>
          )}
        </section>
      </main>
    </>
  )
}

export default Careers
