import imforceLogo from './assets/imforce logo image.webp'
import './App.css'

const services = [
  {
    number: '01',
    title: 'Find your next great hire',
    description:
      'Connect with skilled people who are ready to make a difference on your team.',
    link: 'Talk to our team',
    href: '#employers',
  },
  {
    number: '02',
    title: 'Find work that fits',
    description:
      'Explore opportunities that match your skills, goals, and the way you want to work.',
    link: 'Explore opportunities',
    href: '#job-seekers',
  },
  {
    number: '03',
    title: 'Build your workforce',
    description:
      'Get flexible staffing support for the projects and people your business needs.',
    link: 'Discover staffing',
    href: '#solutions',
  },
]

function App() {
  return (
    <>
      <header className="site-header">
        <a className="brand-logo-link" href="#home" aria-label="Imforce Consolidated home">
          <img className="brand-logo" src={imforceLogo} alt="Imforce Consolidated" />
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#solutions">What we do</a>
          <a href="#about">About us</a>
          <a href="#job-seekers">For job seekers</a>
        </nav>
        <a className="header-cta" href="#employers">
          Let&apos;s talk <span aria-hidden="true">↗</span>
        </a>
      </header>

      <main id="home">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow"><span /> People make the difference</p>
            <h1>Good people.<br />Great things.</h1>
            <p className="hero-description">
              The right people can move your business forward. We bring
              talented people and ambitious teams together.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#employers">
                I&apos;m hiring <span aria-hidden="true">→</span>
              </a>
              <a className="button button-outline" href="#job-seekers">
                I&apos;m looking for work
              </a>
            </div>
            <p className="hero-note">A more human approach to finding the right fit.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="art-shape art-shape-back" />
            <div className="art-shape art-shape-front">
              <span className="art-dot" />
              <span className="art-line" />
              <span className="art-line art-line-short" />
              <span className="art-caption">People first.<br />Always.</span>
            </div>
            <div className="art-note">
              <span className="art-note-icon">✳</span>
              <span>Better together</span>
            </div>
          </div>
        </section>

        <section className="trust-strip" aria-label="Our approach">
          <p>Good work starts with good people.</p>
          <span>Thoughtful matches</span>
          <span>Real relationships</span>
          <span>Results that last</span>
        </section>

        <section className="solutions section-wrap" id="solutions">
          <div className="section-heading">
            <div>
              <p className="eyebrow">How we help</p>
              <h2>Work is better<br />when it fits.</h2>
            </div>
            <p className="section-intro">
              Whether you&apos;re growing a team or taking your next career
              step, we make finding the right fit feel straightforward.
            </p>
          </div>
          <div className="service-grid">
            {services.map((service) => (
              <article className="service-card" key={service.number}>
                <span className="service-number">{service.number}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <a href={service.href}>
                  {service.link} <span aria-hidden="true">→</span>
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="about-band" id="about">
          <div className="about-inner">
            <p className="eyebrow">People are our purpose</p>
            <h2>We believe the right connection can change everything.</h2>
            <a className="text-link" href="#employers">
              Get to know imforce <span aria-hidden="true">→</span>
            </a>
          </div>
          <div className="about-mark" aria-hidden="true">i</div>
        </section>

        <section className="contact-section section-wrap">
          <div id="employers">
            <p className="eyebrow">For employers</p>
            <h2>Ready to find your people?</h2>
            <a className="button button-primary" href="mailto:hello@imforce.com">
              Start a conversation <span aria-hidden="true">→</span>
            </a>
          </div>
          <div id="job-seekers">
            <p className="eyebrow">For job seekers</p>
            <h2>Your next step starts here.</h2>
            <a className="button button-outline" href="mailto:hello@imforce.com">
              Get in touch <span aria-hidden="true">→</span>
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand-logo-link footer-logo-link" href="#home" aria-label="Imforce Consolidated home">
          <img className="brand-logo" src={imforceLogo} alt="Imforce Consolidated" />
        </a>
        <p>Better work, together.</p>
        <a href="mailto:hello@imforce.com">hello@imforce.com</a>
        <span className="copyright">© {new Date().getFullYear()} imforce</span>
      </footer>
    </>
  )
}

export default App
