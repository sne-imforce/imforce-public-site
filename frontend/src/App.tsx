import './App.css'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Footer from './components/public/Footer'
import About from './pages/public site/About'
import Careers from './pages/public site/Careers'
import Contact from './pages/public site/Contact'
import FeeCalculator from './pages/public site/Fee Calculator'
import Home from './pages/public site/Home'
import Placement from './pages/public site/Placement'
import Certifications from './pages/public site/certifications/Certifications'
import Employers from './pages/public site/hire talent/Employers'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/careers" element={<Careers />} />
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
    </BrowserRouter>
  )
}

export default App
