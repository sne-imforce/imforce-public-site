import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiActivity, FiBell, FiCheckSquare, FiGrid, FiHome, FiLogOut, FiPlusSquare } from 'react-icons/fi'
import { Link, NavLink, Outlet } from 'react-router-dom'
import {
  getStaffIdentity, getStaffInquiries, getStaffToken, getStaffTokenExpiry, onStaffSessionExpired,
  forgetStaffDevice, saveStaffToken, staffLogout, type StaffInquiry, type StaffSession,
} from '../data/api'
import { loadStaffVacancies, useRecruiterVacancies } from '../data/recruiterVacancies'
import AdminLogin from './AdminLogin'
import { LoadingBlock } from '../components/ui/Spinner'
import type { AdminContext } from './adminContext'
import { buildNotifications, getNotificationsSeenAt, reviewState } from './jobOrders'
import '../components/public/StaffAccessModal.css'
import './admin.css'

const idleTimeoutMs = 15 * 60 * 1000

const tabs = [
  { to: '/admin', label: 'Inventory', icon: FiGrid, end: true, badge: null },
  { to: '/admin/review', label: 'Advert review', icon: FiCheckSquare, end: false, badge: 'review' },
  { to: '/admin/jobs', label: 'Job posts', icon: FiPlusSquare, end: false, badge: null },
  { to: '/admin/notifications', label: 'Notifications', icon: FiBell, end: false, badge: 'notifications' },
  { to: '/admin/audit', label: 'Audit log', icon: FiActivity, end: false, badge: null },
] as const

/** Signed-in shell for /admin: header, tab navigation and shared data. */
export default function AdminLayout() {
  const [staffName, setStaffName] = useState<string | null>(null)
  const [checking, setChecking] = useState(() => Boolean(getStaffToken()))
  const [notice, setNotice] = useState('')
  const [loginKey, setLoginKey] = useState(0)
  const [inquiries, setInquiries] = useState<StaffInquiry[]>([])
  const [inquiriesError, setInquiriesError] = useState('')
  const [snackbar, setSnackbar] = useState('')
  const [deviceRemembered, setDeviceRemembered] = useState(false)
  const [staffUsername, setStaffUsername] = useState('')
  const [notificationsSeenAt, setNotificationsSeenAt] = useState(0)
  const [badgeNow] = useState(() => Date.now())
  const vacancies = useRecruiterVacancies()
  const rememberStaff = useCallback((username: string) => {
    setStaffUsername(username)
    setNotificationsSeenAt(getNotificationsSeenAt(username))
  }, [])
  const onNotificationsSeen = useCallback(() => setNotificationsSeenAt(getNotificationsSeenAt(staffUsername)), [staffUsername])
  const badges = useMemo(() => ({
    review: inquiries.filter((item) => item.kind === 'employer' && reviewState(item) === 'awaiting-review').length,
    notifications: buildNotifications(inquiries, vacancies, badgeNow).filter((item) => item.at > notificationsSeenAt).length,
  }), [inquiries, vacancies, badgeNow, notificationsSeenAt])

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
        // Load the data before showing the screens, so deep links (e.g. to one job order) resolve.
        await Promise.all([loadStaffVacancies(), reloadInquiries()])
        setStaffName(identity.displayName || identity.email)
        setDeviceRemembered(Boolean(identity.deviceRemembered))
        rememberStaff(identity.username || identity.email)
      })
      .catch(() => saveStaffToken(null))
      .finally(() => setChecking(false))
  }, [reloadInquiries, rememberStaff])

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
    await Promise.all([loadStaffVacancies(), reloadInquiries()])
    setNotice('')
    setStaffName(session.displayName || session.email)
    setDeviceRemembered(Boolean(session.deviceRemembered))
    rememberStaff(session.username || session.email)
  }

  const forgetDevice = async () => {
    try {
      await forgetStaffDevice()
      setDeviceRemembered(false)
      setSnackbar('This device is no longer remembered. You’ll be asked for a code next time.')
    } catch (error) {
      setSnackbar(error instanceof Error ? error.message : 'The device could not be forgotten.')
    }
  }

  const signOut = async () => {
    // Revoke the session on the server so a copied token stops working too.
    try { await staffLogout() } catch { /* The local session is cleared regardless. */ }
    resetAccess()
  }

  if (checking && !staffName) {
    return <main className="staff-access-page"><LoadingBlock label="Loading the staff workspace…" /></main>
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

  const context: AdminContext = { staffName, staffUsername, onNotificationsSeen, inquiries, inquiriesError, reloadInquiries, notify: setSnackbar }

  return (
    <main className="staff-access-page admin">
      <div className="admin__shell">
        <header className="admin__header">
          <div>
            <p className="staff-access-eyebrow">Recruiter workspace</p>
            <p className="admin__signed-in">Signed in as <strong>{staffName}</strong></p>
            {deviceRemembered && (
              <p className="admin__device">
                This device is remembered for two-step sign-in.{' '}
                <button type="button" onClick={() => { void forgetDevice() }}>Forget this device</button>
              </p>
            )}
          </div>
          <div className="admin__header-actions">
            <Link className="admin__button" to="/"><FiHome aria-hidden="true" /> Home</Link>
            <button className="admin__button" type="button" onClick={() => { void signOut() }}>
              <FiLogOut aria-hidden="true" /> Sign out
            </button>
          </div>
        </header>

        <nav className="admin__tabs" aria-label="Staff workspace">
          {tabs.map(({ to, label, icon: Icon, end, badge }) => {
            const count = badge ? badges[badge] : 0
            return (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => `admin__tab${isActive ? ' is-active' : ''}`}>
                <Icon aria-hidden="true" /> {label}
                {count > 0 && (
                  <span className="admin__tab-badge" aria-label={badge === 'review' ? `${count} awaiting review` : `${count} new`}>{count > 99 ? '99+' : count}</span>
                )}
              </NavLink>
            )
          })}
        </nav>

        <Outlet context={context} />
      </div>

      {snackbar && <div className="staff-access-snackbar" role="status" aria-live="polite">{snackbar}</div>}
    </main>
  )
}
