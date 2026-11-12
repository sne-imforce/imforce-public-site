import { FaFacebookF, FaInstagram, FaLinkedinIn, FaTiktok } from 'react-icons/fa'
import { Link } from 'react-router-dom'
import footerLogo from '../../assets/Circular_logo-removebg-preview.png'
import StaffAccessModal from './StaffAccessModal'
import './Footer.css'

const socialPlatforms = [
  {
    name: 'Facebook',
    Icon: FaFacebookF,
    url: 'https://www.facebook.com/profile.php?id=61590659210099',
  },
  {
    name: 'LinkedIn',
    Icon: FaLinkedinIn,
    url: 'https://www.linkedin.com/company/imforce-talent-recruitment/',
  },
  {
    name: 'TikTok',
    Icon: FaTiktok,
    url: 'https://www.tiktok.com/@imforcetalent?lang=en',
  },
  {
    name: 'Instagram',
    Icon: FaInstagram,
    url: 'https://www.instagram.com/imforce_talent/?hl=en',
  },
]

function Footer() {
  return (
    <footer className="global-footer">
      <div className="global-footer__inner">
        <div className="global-footer__brand">
          <Link className="global-footer__logo" to="/" aria-label="IMFORCE Talent Recruitment home">
            <img src={footerLogo} alt="" />
            <span>IMFORCE <strong>CONSOLIDATED</strong></span>
          </Link>
          <p>
            Connecting employers and candidates through permanent staffing and
            placement.
          </p>
          <div className="global-footer__brand-access">
            <StaffAccessModal />
          </div>
        </div>

        <nav className="global-footer__nav" aria-label="Footer navigation">
          <h2>Explore</h2>
          <Link to="/">Home</Link>
          <Link to="/about">About us</Link>
          <Link to="/services/placements">Permanent staffing</Link>
          <Link to="/employers">For employers</Link>
          <Link to="/careers">Careers</Link>
          <Link to="/fee-calculator">Fee calculator</Link>
        </nav>

        <nav
          className="global-footer__nav"
          aria-label="Certifications and credentials"
        >
          <h2>Certifications &amp; credentials</h2>
          <Link to="/certifications#certifications">Certifications</Link>
          <Link to="/certifications#credentials">Credentials</Link>
        </nav>

        <div className="global-footer__contact">
          <h2>Get in touch</h2>
          <a href="mailto:info@imforce.co.za">info@imforce.co.za</a>
          <a href="mailto:admin@imforce.co.za">admin@imforce.co.za</a>
        </div>

        <div className="global-footer__social">
          <h2>Follow IMFORCE</h2>
          <div className="global-footer__social-row">
            <ul aria-label="IMFORCE social media profiles">
              {socialPlatforms.map(({ name, Icon, url }) => (
                <li key={name}>
                  <a
                    className="global-footer__social-item"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={name}
                    title={name}
                  >
                    <Icon aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
            <div className="global-footer__social-access">
              <StaffAccessModal />
            </div>
          </div>
        </div>
      </div>

      <div className="global-footer__bottom">
        <p>© {new Date().getFullYear()} IMFORCE Talent Recruitment. All rights reserved.</p>
        <Link className="global-footer__legal" to="/privacy">Privacy notice</Link>
      </div>
    </footer>
  )
}

export default Footer