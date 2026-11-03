import { useEffect, useRef, useState } from 'react'
import { FiChevronDown, FiMenu, FiX } from 'react-icons/fi'
import imforceLogo from '../../assets/imforce logo image.webp'
import './Navbar.css'

type LinkItem = {
  label: string
  href: string
}

type DropdownItem = LinkItem & {
  id: string
}

const navigationLinks: LinkItem[] = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Permanent Staffing', href: '/services/placements' },
  { label: 'Careers & Job Search', href: '/careers' },
  { label: 'Fee Calculator', href: '/fee-calculator' },
  { label: 'Contact', href: '/contact' },
]

const employerDropdown = {
  label: 'For Employers',
  items: [
    { id: 'employers', label: 'Employers', href: '/employers' },
    { id: 'job-posts', label: 'Job Posts', href: '/employers/job-posts' },
  ],
}

const certificatesDropdown = {
  label: 'Certificates',
  items: [
    { id: 'certificates', label: 'Certificates', href: '/certifications' },
    { id: 'credentials', label: 'Credentials', href: '/credentials' },
  ],
}

type NavbarDropdownProps = {
  label: string
  items: DropdownItem[]
  id: string
  isOpen: boolean
  isMobile?: boolean
  isActive: (href: string) => boolean
  onToggle: () => void
  onOpen: () => void
  onClose: () => void
  onNavigate: () => void
}

function NavbarDropdown({
  label,
  items,
  id,
  isOpen,
  isMobile = false,
  isActive,
  onToggle,
  onOpen,
  onClose,
  onNavigate,
}: NavbarDropdownProps) {
  return (
    <div
      className={`navbar__dropdown${isMobile ? ' navbar__dropdown--mobile' : ''}${isOpen ? ' is-open' : ''}`}
      onMouseEnter={isMobile ? undefined : onOpen}
      onMouseLeave={isMobile ? undefined : onClose}
    >
      <button
        className={`navbar__link navbar__dropdown-toggle${items.some((item) => isActive(item.href)) ? ' is-active' : ''}`}
        type="button"
        aria-expanded={isOpen}
        aria-controls={id}
        onClick={onToggle}
      >
        {label}
        <FiChevronDown className="navbar__chevron" aria-hidden="true" />
      </button>
      <div className="navbar__dropdown-panel" id={id} hidden={!isOpen}>
        {items.map((item) => (
          <a
            className={`navbar__dropdown-link${isActive(item.href) ? ' is-active' : ''}`}
            href={item.href}
            key={item.id}
            onClick={onNavigate}
          >
            {item.label}
          </a>
        ))}
      </div>
    </div>
  )
}

function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState(
    () => `${window.location.pathname}${window.location.hash}`,
  )
  const navbarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const updateScrollState = () => setIsScrolled(window.scrollY > 24)
    const updateCurrentUrl = () => {
      setCurrentUrl(`${window.location.pathname}${window.location.hash}`)
      setOpenDropdown(null)
      setIsMobileMenuOpen(false)
    }

    updateScrollState()
    window.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('popstate', updateCurrentUrl)
    window.addEventListener('hashchange', updateCurrentUrl)
    return () => {
      window.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('popstate', updateCurrentUrl)
      window.removeEventListener('hashchange', updateCurrentUrl)
    }
  }, [])

  useEffect(() => {
    if (!isMobileMenuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isMobileMenuOpen])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !navbarRef.current?.contains(event.target)) {
        setOpenDropdown(null)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null)
        setIsMobileMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const closeNavigation = () => {
    setOpenDropdown(null)
    setIsMobileMenuOpen(false)
  }

  const isActive = (href: string) => {
    const target = new URL(href, window.location.origin)
    const current = new URL(currentUrl, window.location.origin)
    const targetPath = target.pathname.replace(/\/$/, '') || '/'
    const currentPath = current.pathname.replace(/\/$/, '') || '/'

    if (targetPath === '/') return currentPath === '/'
    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
  }

  const renderDropdown = (
    dropdown: typeof employerDropdown,
    isMobile: boolean,
  ) => {
    const id = `${isMobile ? 'mobile' : 'desktop'}-${dropdown.items[0].id}-menu`
    return (
      <NavbarDropdown
        key={dropdown.label}
        label={dropdown.label}
        items={dropdown.items}
        id={id}
        isOpen={openDropdown === id}
        isMobile={isMobile}
        isActive={isActive}
        onToggle={() =>
          setOpenDropdown(
            isMobile ? (openDropdown === id ? null : id) : id,
          )
        }
        onOpen={() => setOpenDropdown(id)}
        onClose={() => {
          if (!isMobile) setOpenDropdown(null)
        }}
        onNavigate={closeNavigation}
      />
    )
  }

  const renderLinks = (isMobile: boolean) => (
    <>
      {navigationLinks.slice(0, 3).map((link) => (
        <a
          className={`navbar__link${isActive(link.href) ? ' is-active' : ''}`}
          href={link.href}
          key={link.href}
          onClick={closeNavigation}
        >
          {link.label}
        </a>
      ))}
      {renderDropdown(employerDropdown, isMobile)}
      {navigationLinks.slice(3, 4).map((link) => (
        <a
          className={`navbar__link${isActive(link.href) ? ' is-active' : ''}`}
          href={link.href}
          key={link.href}
          onClick={closeNavigation}
        >
          {link.label}
        </a>
      ))}
      {renderDropdown(certificatesDropdown, isMobile)}
      {navigationLinks.slice(4).map((link) => (
        <a
          className={`navbar__link${isActive(link.href) ? ' is-active' : ''}`}
          href={link.href}
          key={link.href}
          onClick={closeNavigation}
        >
          {link.label}
        </a>
      ))}
    </>
  )

  return (
    <header
      className={`navbar${isScrolled ? ' navbar--scrolled' : ''}${isMobileMenuOpen ? ' navbar--menu-open' : ''}`}
      ref={navbarRef}
    >
      <div className="navbar__bar">
        <a className="navbar__brand" href="/" aria-label="IMFORCE Consolidated home">
          <img src={imforceLogo} alt="IMFORCE Consolidated" />
        </a>

        <nav className="navbar__desktop-nav" aria-label="Main">
          {renderLinks(false)}
        </nav>

        <div className="navbar__actions">
          <button
            className="navbar__icon-button navbar__menu-toggle"
            type="button"
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="navbar-mobile-menu"
            onClick={() => {
              setIsMobileMenuOpen(!isMobileMenuOpen)
              setOpenDropdown(null)
            }}
          >
            {isMobileMenuOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div
        className={`navbar__mobile-panel${isMobileMenuOpen ? ' is-open' : ''}`}
        id="navbar-mobile-menu"
        aria-hidden={!isMobileMenuOpen}
        inert={!isMobileMenuOpen}
      >
        <nav className="navbar__mobile-nav" aria-label="Main">
          {renderLinks(true)}
        </nav>
      </div>
    </header>
  )
}

export default Navbar
