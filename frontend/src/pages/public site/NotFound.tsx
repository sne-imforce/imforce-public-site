import { Link } from 'react-router-dom'
import Navbar from '../../components/public/Navbar'
import './NotFound.css'

function NotFound() {
  return (
    <>
      <Navbar />
      <main className="not-found-page">
        <section className="not-found-hero" aria-labelledby="not-found-title">
          <div className="not-found-shell">
            <p className="not-found-eyebrow">Page not found</p>
            <h1 id="not-found-title">This page is not available.</h1>
            <p>
              The address may be mistyped or the page may have moved. Use the
              links below to continue.
            </p>
            <div className="not-found-actions">
              <Link className="not-found-button" to="/">
                Back to home
              </Link>
              <Link className="not-found-button not-found-button--outline" to="/contact">
                Contact IMFORCE
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}

export default NotFound
