import { useEffect, useMemo, useState } from 'react'
import { FiAlertTriangle, FiArrowRight, FiBell, FiCheckCircle, FiChevronLeft, FiChevronRight, FiClock, FiMail } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { useRecruiterVacancies } from '../data/recruiterVacancies'
import { useAdmin } from './adminContext'
import { buildNotifications, getNotificationsSeenAt, setNotificationsSeenAt, type NotificationKind } from './jobOrders'

const kinds: Array<{ id: NotificationKind | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'action', label: 'Action needed' },
  { id: 'urgent', label: 'Urgent hires' },
  { id: 'enquiry', label: 'Enquiries' },
  { id: 'reminder', label: 'Reminders' },
]
const icons = { action: FiCheckCircle, urgent: FiAlertTriangle, enquiry: FiMail, reminder: FiClock }
const pageSize = 10

const formatWhen = (epochMs: number) => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
}).format(new Date(epochMs))

/** /admin/notifications: what needs attention, newest first. */
export default function NotificationsPage() {
  const { inquiries, staffUsername, onNotificationsSeen } = useAdmin()
  const vacancies = useRecruiterVacancies()
  const [now] = useState(() => Date.now())
  // "New" is judged against the previous visit, captured once when the page opens.
  const [seenAt] = useState(() => getNotificationsSeenAt(staffUsername))
  const [kind, setKind] = useState<NotificationKind | 'all'>('all')
  const [page, setPage] = useState(0)

  const items = useMemo(() => buildNotifications(inquiries, vacancies, now), [inquiries, vacancies, now])
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: items.length }
    for (const item of items) result[item.kind] = (result[item.kind] ?? 0) + 1
    return result
  }, [items])
  const visible = kind === 'all' ? items : items.filter((item) => item.kind === kind)
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize))
  const current = Math.min(page, pageCount - 1)
  const shown = visible.slice(current * pageSize, current * pageSize + pageSize)
  const newCount = items.filter((item) => item.at > seenAt).length

  // Leaving the page counts as having seen everything that was listed.
  useEffect(() => () => { setNotificationsSeenAt(staffUsername, now); onNotificationsSeen() }, [staffUsername, now, onNotificationsSeen])

  const markAllSeen = () => { setNotificationsSeenAt(staffUsername, now); onNotificationsSeen() }

  return (
    <div className="admin-page">
      <div className="admin-page__heading">
        <div>
          <h1>Notifications</h1>
          <p>
            Urgent hires, adverts waiting for review, new enquiries and reminders.
            {' '}{newCount > 0 ? `${newCount} new since your last visit.` : 'You’re up to date.'}
          </p>
        </div>
        {newCount > 0 && (
          <button type="button" className="admin__button" onClick={markAllSeen}>
            <FiCheckCircle aria-hidden="true" /> Mark all as seen
          </button>
        )}
      </div>

      <section className="admin-card" aria-label="Notifications">
        <div className="notice-filters" role="group" aria-label="Show">
          {kinds.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`notice-filter${kind === option.id ? ' is-active' : ''}`}
              aria-pressed={kind === option.id}
              onClick={() => { setKind(option.id); setPage(0) }}
            >
              {option.label} <span className="notice-filter__count">{counts[option.id] ?? 0}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <div className="notice-empty">
            <FiBell aria-hidden="true" />
            <p>{kind === 'all' ? 'Nothing needs your attention right now.' : 'Nothing in this category right now.'}</p>
          </div>
        ) : (
          <ul className="notice-list">
            {shown.map((item) => {
              const Icon = icons[item.kind]
              const isNew = item.at > seenAt
              return (
                <li key={item.id} className={`notice notice--${item.kind}${isNew ? ' is-new' : ''}`}>
                  <span className="notice__icon" aria-hidden="true"><Icon /></span>
                  <div className="notice__body">
                    <p className="notice__title">
                      {isNew && <span className="notice__new">New</span>}
                      {item.title}
                    </p>
                    <p className="notice__detail">{item.detail}</p>
                    <time className="notice__time" dateTime={new Date(item.at).toISOString()}>{formatWhen(item.at)}</time>
                  </div>
                  <Link className="admin__button notice__action" to={item.link.to}>
                    {item.link.label} <FiArrowRight aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        <div className="data-table__footer">
          <p aria-live="polite">{visible.length === 0 ? 'No notifications' : `Showing ${current * pageSize + 1}–${current * pageSize + shown.length} of ${visible.length}`}</p>
          {pageCount > 1 && (
            <nav className="data-table__pager" aria-label="Notification pages">
              <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Previous page"><FiChevronLeft aria-hidden="true" /></button>
              <span>Page {current + 1} of {pageCount}</span>
              <button type="button" onClick={() => setPage(current + 1)} disabled={current >= pageCount - 1} aria-label="Next page"><FiChevronRight aria-hidden="true" /></button>
            </nav>
          )}
        </div>
      </section>
    </div>
  )
}
