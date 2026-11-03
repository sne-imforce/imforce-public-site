import imforceLogo from '../../assets/imforce logo image.webp'
import ActionLink from '../shared/ActionLink'

function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand-logo-link" href="#home" aria-label="IMFORCE home">
        <img className="brand-logo" src={imforceLogo} alt="IMFORCE Consolidated" />
      </a>
      <nav className="main-nav" aria-label="Main navigation">
        <a href="#permanent-placement">Permanent placement</a>
        <a href="#employers">For employers</a>
        <a href="#careers">For job seekers</a>
      </nav>
      <ActionLink
        href="mailto:info@imforce.co.za?subject=Employer%20job%20order%20enquiry"
        variant="secondary"
      >
        Submit a vacancy <span aria-hidden="true">↗</span>
      </ActionLink>
    </header>
  )
}

export default SiteHeader
