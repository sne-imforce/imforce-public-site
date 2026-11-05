import { useEffect, useRef, useState } from 'react'
import { FiChevronDown, FiMenu, FiX } from 'react-icons/fi'
import { useLocation } from 'react-router-dom'
import imforceLogo from '../../assets/High_Res_Logo-removebg-preview.png'
import { industries } from '../../data/industries'
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
  { label: 'Permanent Staffing', href: '/services/placements' },
  { label: 'For Employers', href: '/employers' },
  { label: 'Careers & Job Search', href: '/careers' },
  { label: 'Fee Calculator', href: '/fee-calculator' },
  { label: 'Contact', href: '/contact' },
]

const aboutDropdown = {
  label: 'About',
  items: [
    { id: 'about', label: 'About IMFORCE', href: '/about' },
    ...industries.map(({ name, slug }) => ({
      id: `industry-${slug}`,
      label: name,
      href: `/about#industry-${slug}`,
    })),
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
  isToggleActive: boolean
  onToggle: () => void
  onOpen: () => void
  onClose: () => void
  onNavigate: () => void
}

function pathFromHref(href: string) {
  return new URL(href, window.location.origin).pathname.replace(/\/$/, '') || '/'
}

const topLevelNavPaths = new Set(
  navigationLinks.map((link) => pathFromHref(link.href)),
)

function NavbarDropdown({
  label,
  items,
  id,
  isOpen,
  isMobile = false,
  isActive,
  isToggleActive,
  onToggle,
  onOpen,
  onClose,
  onNavigate,
}: NavbarDropdownProps) {
  return (
    <div
      className={`navbar__dropdown${isMobile ? ' navbar__dropdown--mobile' : ''}${label === 'About' ? ' navbar__dropdown--industries' : ''}${isOpen ? ' is-open' : ''}`}
      onMouseEnter={isMobile ? undefined : onOpen}
      onMouseLeave={isMobile ? undefined : onClose}
    >
      <button
        className={`navbar__link navbar__dropdown-toggle${isToggleActive ? ' is-active' : ''}`}
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
  const location = useLocation()
  const currentUrl = `${location.pathname}${location.hash}`
  const navbarRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const updateScrollState = () => setIsScrolled(window.scrollY > 24)
    updateScrollState()
    window.addEventListener('scroll', updateScrollState, { passive: true })
    return () => {
      window.removeEventListener('scroll', updateScrollState)
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
    const targetPath = pathFromHref(href)
    const currentPath = pathFromHref(currentUrl)

    if (targetPath === '/') return currentPath === '/'
    return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
  }

  const isDropdownToggleActive = (items: DropdownItem[]) =>
    items.some((item) => {
      if (topLevelNavPaths.has(pathFromHref(item.href))) return false
      return isActive(item.href)
    })

  const renderDropdown = (
    dropdown: typeof aboutDropdown | typeof certificatesDropdown,
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
        isToggleActive={isDropdownToggleActive(dropdown.items)}
        onToggle={() =>
          setOpenDropdown(
            isMobile ? (openDropdown === id ? null : id) : id,
          )
        }
        onOpen={() => setOpenDropdown(id)}
        onClose={() => {
          if (!isMobile && dropdown.label !== 'About') {
            setOpenDropdown(null)
          }
        }}
        onNavigate={closeNavigation}
      />
    )
  }

  const renderLink = (link: LinkItem) => (
    <a
      className={`navbar__link${isActive(link.href) ? ' is-active' : ''}`}
      href={link.href}
      key={link.href}
      onClick={closeNavigation}
    >
      {link.label}
    </a>
  )

  const renderLinks = (isMobile: boolean) => (
    <>
      {renderLink(navigationLinks[0])}
      {renderDropdown(aboutDropdown, isMobile)}
      {renderLink(navigationLinks[1])}
      {renderLink(navigationLinks[2])}
      {renderLink(navigationLinks[3])}
      {renderDropdown(certificatesDropdown, isMobile)}
      {navigationLinks.slice(4).map(renderLink)}
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
