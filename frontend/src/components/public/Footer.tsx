import { FaFacebookF, FaInstagram, FaLinkedinIn, FaTiktok } from 'react-icons/fa'
import { Link } from 'react-router-dom'
import footerLogo from '../../assets/Circular_logo-removebg-preview.png'
import './Footer.css'

const socialPlatforms = [
  { name: 'Facebook', Icon: FaFacebookF },
  { name: 'LinkedIn', Icon: FaLinkedinIn },
  { name: 'TikTok', Icon: FaTiktok },
  { name: 'Instagram', Icon: FaInstagram },
]

function Footer() {
  return (
    <footer className="global-footer">
      <div className="global-footer__inner">
        <div className="global-footer__brand">
          <Link className="global-footer__logo" to="/" aria-label="IMFORCE Consolidated home">
            <img src={footerLogo} alt="" />
            <span>IMFORCE <strong>CONSOLIDATED</strong></span>
          </Link>
          <p>
            Connecting employers and candidates through permanent staffing and
            placement.
          </p>
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
          <ul aria-label="Social media profiles (links coming soon)">
            {socialPlatforms.map(({ name, Icon }) => (
              <li key={name}>
                <span
                  className="global-footer__social-item"
                  role="img"
                  aria-label={name}
                >
                  <Icon aria-hidden="true" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="global-footer__bottom">
        <p>© {new Date().getFullYear()} IMFORCE Consolidated. All rights reserved.</p>
      </div>
    </footer>
  )
}

export default Footer