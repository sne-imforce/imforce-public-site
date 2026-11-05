import './Hero.css'

type HeroProps = {
  imageSrc?: string
}

function Hero({ imageSrc }: HeroProps) {
  return (
    <>
      <section className="home-hero" aria-labelledby="home-hero-title">
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
          {imageSrc && (
            <div className="home-hero__art">
              <img src={imageSrc} alt="IMFORCE circular logo" />
            </div>
          )}
        </div>
      </section>
    </>
  )
}

export default Hero
