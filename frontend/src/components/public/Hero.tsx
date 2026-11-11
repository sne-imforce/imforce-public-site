import { useState, type FormEvent } from 'react'
import { FiArrowRight, FiSearch } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import './Hero.css'

type HeroProps = {
  imageSrc?: string
}

function Hero({ imageSrc }: HeroProps) {
  const navigate = useNavigate()
  const [keywords, setKeywords] = useState('')
  const [location, setLocation] = useState('')

  const searchJobs = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const params = new URLSearchParams()
    if (keywords.trim()) params.set('q', keywords.trim())
    if (location.trim()) params.set('location', location.trim())
    navigate(params.size ? `/careers?${params.toString()}#vacancies` : '/careers#vacancies')
  }

  return (
    <>
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero__inner">
          <div className="home-hero__content">
            <p className="home-hero__eyebrow">IMFORCE CONSOLIDATED</p>
            <h1 className="home-hero__title" id="home-hero-title">
              Find the right people. <span>Find work that fits.</span>
            </h1>
            <p className="home-hero__description">
              Permanent recruitment for South African businesses, and considered career opportunities for people ready for their next step.
            </p>
            <form className="home-hero__search" role="search" onSubmit={searchJobs}>
              <label>
                <span>Job title or keyword</span>
                <input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="e.g. Finance manager" />
              </label>
              <label>
                <span>Town, city or province</span>
                <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="e.g. Durban" />
              </label>
              <button type="submit"><FiSearch aria-hidden="true" /> Search jobs</button>
            </form>
            <a className="home-hero__employer-link" href="/employers">Hiring? Tell us who you need <FiArrowRight aria-hidden="true" /></a>
          </div>
          <div className="home-hero__art" aria-hidden="true">
            {imageSrc && <img src={imageSrc} alt="" />}
          </div>
        </div>
      </section>
    </>
  )
}

export default Hero
