import './App.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import About from './pages/public site/About'
import Home from './pages/public site/Home'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
