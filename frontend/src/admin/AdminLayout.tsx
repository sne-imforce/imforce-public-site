import { useCallback, useEffect, useState } from 'react'
import { FiActivity, FiGrid, FiHome, FiLogOut, FiPlusSquare } from 'react-icons/fi'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  getStaffIdentity, getStaffInquiries, getStaffToken, getStaffTokenExpiry, onStaffSessionExpired,
  saveStaffToken, staffLogout, type StaffInquiry, type StaffSession,
} from '../data/api'
import { loadStaffVacancies } from '../data/recruiterVacancies'
import AdminLogin from './AdminLogin'
import type { AdminContext } from './adminContext'
import '../components/public/StaffAccessModal.css'
import './admin.css'

const idleTimeoutMs = 15 * 60 * 1000

const tabs = [
  { to: '/admin', label: 'Inventory', icon: FiGrid, end: true },
  { to: '/admin/jobs', label: 'Job posts', icon: FiPlusSquare, end: false },
  { to: '/admin/audit', label: 'Audit log', icon: FiActivity, end: false },
]

/** Signed-in shell for /admin: header, tab navigation and shared data. */
export default function AdminLayout() {
  const [staffName, setStaffName] = useState<string | null>(null)
  const [checking, setChecking] = useState(() => Boolean(getStaffToken()))
  const [notice, setNotice] = useState('')
  const [loginKey, setLoginKey] = useState(0)
  const [inquiries, setInquiries] = useState<StaffInquiry[]>([])
  const [inquiriesError, setInquiriesError] = useState('')
  const [snackbar, setSnackbar] = useState('')

  const reloadInquiries = useCallback(async () => {
    setInquiriesError('')
    try { setInquiries((await getStaffInquiries()).inquiries) } catch (error) {
      setInquiriesError(error instanceof Error ? error.message : 'Enquiries could not be loaded.')
    }
  }, [])

  const resetAccess = useCallback((message = '') => {
    saveStaffToken(null)
    setStaffName(null)
    setInquiries([])
    setNotice(message)
    setLoginKey((key) => key + 1)
  }, [])

  // Resume an existing session (for example after a page refresh).
  useEffect(() => {
    if (!getStaffToken()) return
    void getStaffIdentity()
      .then(async (identity) => {
        await loadStaffVacancies()
        setStaffName(identity.displayName || identity.email)
        await reloadInquiries()
      })
      .catch(() => saveStaffToken(null))
      .finally(() => setChecking(false))
  }, [reloadInquiries])

  useEffect(() => onStaffSessionExpired(() => resetAccess('Your session has expired. Sign in again to continue.')), [resetAccess])

  // Sign out automatically after inactivity or when the token expires.
  useEffect(() => {
    if (!staffName) return
    let idleTimer = 0
    const expireIdle = () => {
      void staffLogout().catch(() => undefined)
      resetAccess('You were signed out after 15 minutes of inactivity.')
    }
    const resetIdle = () => { window.clearTimeout(idleTimer); idleTimer = window.setTimeout(expireIdle, idleTimeoutMs) }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((name) => window.addEventListener(name, resetIdle, { passive: true }))
    resetIdle()
    const expiresAt = getStaffTokenExpiry()
    const expiryTimer = expiresAt
      ? window.setTimeout(() => resetAccess('Your session has expired. Sign in again to continue.'), Math.max(0, expiresAt - Date.now()))
      : 0
    return () => {
      window.clearTimeout(idleTimer)
      window.clearTimeout(expiryTimer)
      events.forEach((name) => window.removeEventListener(name, resetIdle))
    }
  }, [staffName, resetAccess])

  useEffect(() => {
    if (!snackbar) return
    const timer = window.setTimeout(() => setSnackbar(''), 4000)
    return () => window.clearTimeout(timer)
  }, [snackbar])

  const handleSignedIn = async (session: StaffSession) => {
    saveStaffToken(session.accessToken, session.expiresIn)
    await loadStaffVacancies()
    setNotice('')
    setStaffName(session.displayName || session.email)
    await reloadInquiries()
  }

  const signOut = async () => {
    // Revoke the session on the server so a copied token stops working too.
    try { await staffLogout() } catch { /* The local session is cleared regardless. */ }
    resetAccess()
  }

  if (checking && !staffName) {
    return <main className="staff-access-page"><p className="admin-loading" role="status">Loading the staff workspace…</p></main>
  }

  if (!staffName) {
    return (
      <main className="staff-access-page">
        <div className="staff-access-page__shell">
          <AdminLogin key={loginKey} notice={notice} onSignedIn={handleSignedIn} />
        </div>
      </main>
    )
  }

  const context: AdminContext = { staffName, inquiries, inquiriesError, reloadInquiries, notify: setSnackbar }

  return (
    <main className="staff-access-page admin">
      <div className="admin__shell">
        <header className="admin__header">
          <div>
            <p className="staff-access-eyebrow">Recruiter workspace</p>
            <p className="admin__signed-in">Signed in as <strong>{staffName}</strong></p>
          </div>
          <div className="admin__header-actions">
            <Link className="admin__button" to="/"><FiHome aria-hidden="true" /> Home</Link>
            <button className="admin__button" type="button" onClick={() => { void signOut() }}>
              <FiLogOut aria-hidden="true" /> Sign out
            </button>
          </div>
        </header>

        <nav className="admin__tabs" aria-label="Staff workspace">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `admin__tab${isActive ? ' is-active' : ''}`}>
              <Icon aria-hidden="true" /> {label}
            </NavLink>
          ))}
        </nav>

        <Outlet context={context} />
      </div>

      {snackbar && <div className="staff-access-snackbar" role="status" aria-live="polite">{snackbar}</div>}
    </main>
  )
}
