import type { CSSProperties } from 'react'
import './Hero.css'

type HeroProps = {
  imageSrc?: string
}

function Hero({ imageSrc }: HeroProps) {
  const imageStyle = imageSrc
    ? ({ '--hero-image': `url("${imageSrc}")` } as CSSProperties)
    : undefined

  return (
    <>
      <section className="home-hero" aria-labelledby="home-hero-title">
        {imageSrc && (
          <div className="home-hero__photo" style={imageStyle} aria-hidden="true" />
        )}
        <svg
          className="home-hero__decoration"
          viewBox="0 0 720 720"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="360" cy="360" r="248" stroke="currentColor" strokeWidth="2" />
          <circle
            cx="360"
            cy="360"
            r="206"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="330 100 180 260"
            transform="rotate(-32 360 360)"
          />
          <circle
            cx="360"
            cy="360"
            r="162"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="205 75 82 110"
            transform="rotate(26 360 360)"
          />
          <circle cx="326" cy="93" r="10" fill="currentColor" />
          <circle cx="563" cy="258" r="7" fill="#9BC8EE" />
          <circle cx="205" cy="526" r="9" fill="#9BC8EE" />
          <circle cx="478" cy="580" r="5" fill="currentColor" />
        </svg>

        <div className="home-hero__inner">
          <div className="home-hero__content">
            <p className="home-hero__eyebrow">IMFORCE CONSOLIDATED</p>
            <h1 className="home-hero__title" id="home-hero-title">
              <strong>Hiring made simple</strong> when you have the{' '}
              <span>right people</span>
            </h1>
            <p className="home-hero__description">
              From staffing to payroll, warehousing to manufacturing, we
              provide end-to-end solutions to empower your business. Your
              Workforce, Simplified.
            </p>
            <div className="home-hero__actions">
              <a className="home-hero__button home-hero__button--primary" href="/careers">
                Find a job
              </a>
              <a className="home-hero__button home-hero__button--secondary" href="/employers">
                Find talent
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default Hero
