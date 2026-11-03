import imforceLogo from '../../assets/imforce logo image.webp'

function SiteFooter() {
  return (
    <footer className="site-footer" id="contact">
      <a className="brand-logo-link footer-logo-link" href="#home" aria-label="IMFORCE home">
        <img className="brand-logo" src={imforceLogo} alt="IMFORCE Consolidated" />
      </a>
      <p>Permanent staffing. People-first partnerships.</p>
      <a href="mailto:info@imforce.co.za">info@imforce.co.za</a>
      <span className="copyright">© {new Date().getFullYear()} IMFORCE</span>
    </footer>
  )
}

export default SiteFooter
