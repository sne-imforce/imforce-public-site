import './App.css'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Footer from './components/public/Footer'
import { StaffAccessPage } from './components/public/StaffAccessModal'
import Seo from './components/seo/Seo'
import About from './pages/public site/About'
import Careers from './pages/public site/Careers'
import Contact from './pages/public site/Contact'
import FeeCalculator from './pages/public site/Fee Calculator'
import Home from './pages/public site/Home'
import Placement from './pages/public site/Placement'
import Certifications from './pages/public site/certifications/Certifications'
import Employers from './pages/public site/hire talent/Employers'

const routeSeo = {
  '/': {
    title: 'IMFORCE Talent Recruitment',
    description:
      'IMFORCE Talent Recruitment helps South African employers and candidates connect through permanent staffing, workforce planning, and placement services.',
    keywords: [
      'South African recruitment agency',
      'permanent staffing South Africa',
      'talent acquisition',
      'workforce solutions',
      'employment placement',
    ],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'IMFORCE Talent Recruitment',
      url: 'https://www.imforce.co.za/',
      description:
        'Permanent staffing, hiring, and recruitment support for employers and job seekers across South Africa.',
      publisher: {
        '@type': 'Organization',
        name: 'IMFORCE Talent Recruitment',
      },
    },
  },
  '/about': {
    title: 'About IMFORCE',
    description:
      'Learn how IMFORCE Talent Recruitment supports candidates and employers across South African industries with permanent staffing and placement expertise.',
    keywords: ['about IMFORCE', 'recruitment across industries', 'permanent placement specialists'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'About IMFORCE',
      description:
        'A recruitment company focused on permanent staffing, placement, and better-fit opportunities across South African industries.',
      url: 'https://www.imforce.co.za/about',
    },
  },
  '/careers': {
    title: 'Careers & Job Search',
    description:
      'Explore recruitment opportunities, permanent staffing roles, and career pathways with IMFORCE Talent Recruitment in South Africa.',
    keywords: ['career opportunities South Africa', 'job search', 'permanent roles', 'recruitment vacancies'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Careers & Job Search',
      description: 'Browse current job opportunities and career pathways with IMFORCE Talent Recruitment.',
      url: 'https://www.imforce.co.za/careers',
    },
  },
  '/contact': {
    title: 'Contact IMFORCE',
    description:
      'Contact IMFORCE Talent Recruitment to discuss permanent staffing, employer hiring needs, and candidate opportunities across South Africa.',
    keywords: ['contact IMFORCE', 'recruitment agency contact', 'employment enquiry South Africa'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: 'Contact IMFORCE',
      description: 'Get in touch with IMFORCE for recruitment, permanent placement, and hiring support.',
      url: 'https://www.imforce.co.za/contact',
    },
  },
  '/employers': {
    title: 'For Employers',
    description:
      'Partner with IMFORCE for permanent staffing, workforce planning, and hiring support tailored to your business and industry needs.',
    keywords: ['recruitment for employers', 'permanent staffing solutions', 'workforce planning South Africa'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Recruitment for Employers',
      provider: {
        '@type': 'Organization',
        name: 'IMFORCE Talent Recruitment',
      },
      areaServed: 'South Africa',
      url: 'https://www.imforce.co.za/employers',
    },
  },
  '/services/placements': {
    title: 'Permanent Staffing & Placement',
    description:
      'Discover IMFORCE permanent staffing and placement services designed to match the right people with the right roles in South Africa.',
    keywords: ['permanent staffing', 'placement services', 'recruitment and placement', 'South Africa staffing'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Permanent Staffing & Placement',
      provider: {
        '@type': 'Organization',
        name: 'IMFORCE Talent Recruitment',
      },
      areaServed: 'South Africa',
      url: 'https://www.imforce.co.za/services/placements',
    },
  },
  '/certifications': {
    title: 'Certifications & Credentials',
    description:
      'Explore IMFORCE certifications and professional credentials to support workforce standards and recruitment capability.',
    keywords: ['certifications', 'credentials', 'recruitment standards', 'professional qualifications'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Certifications & Credentials',
      url: 'https://www.imforce.co.za/certifications',
    },
  },
  '/admin': {
    title: 'Staff sign-in',
    description: 'Authorised IMFORCE staff sign-in.',
    keywords: [],
    noIndex: true,
  },
  '/fee-calculator': {
    title: 'Fee Calculator',
    description:
      'Use the IMFORCE fee calculator to estimate recruitment and placement costs for permanent staffing and hiring support.',
    keywords: ['recruitment fee calculator', 'staffing cost estimate', 'placement fee estimate'],
    schema: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: 'Fee Calculator',
      url: 'https://www.imforce.co.za/fee-calculator',
    },
  },
} as const

function AppContent() {
  const location = useLocation()
  const seo = routeSeo[location.pathname as keyof typeof routeSeo] ?? {
    title: 'IMFORCE Talent Recruitment',
    description:
      'IMFORCE Talent Recruitment connects southern African employers and job seekers through permanent staffing, recruitment, and placement services.',
    keywords: ['IMFORCE', 'recruitment agency', 'staffing solutions'],
  }

  return (
    <>
      <Seo {...seo} path={location.pathname} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/careers" element={<Careers />} />
        <Route path="/admin" element={<StaffAccessPage />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/employers" element={<Employers />} />
        <Route path="/services/placements" element={<Placement />} />
        <Route path="/certifications" element={<Certifications />} />
        <Route
          path="/credentials"
          element={<Navigate to="/certifications#credentials" replace />}
        />
        <Route path="/fee-calculator" element={<FeeCalculator />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Footer />
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
