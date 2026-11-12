import type { StaffInquiry } from '../data/api'
import type { RecruiterVacancy } from '../data/recruiterVacancies'
import { formatDateDmy } from '../utils/dates'

// Shared rules for job orders, enquiries and notifications in the staff workspace.

const DAY_MS = 86_400_000
export const dateInSouthAfrica = (epochMs: number) => new Date(epochMs + 2 * 60 * 60 * 1000).toISOString().slice(0, 10)
export const addDays = (isoDate: string, days: number) => new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
export const time = (value: string | null | undefined) => (value ? Date.parse(value) || 0 : 0)

/** Same short reference the visitor sees after sending the contact form. */
export const enquiryReference = (id: string) => `ENQ-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`

export type PaymentState = 'paid' | 'pending' | 'failed'
export function paymentState(status: unknown): PaymentState {
  if (status === 'paid') return 'paid'
  if (status === 'initialization_failed') return 'failed'
  return 'pending'
}
export const paymentBadge: Record<PaymentState, { text: string; tone: string }> = {
  paid: { text: 'Paid', tone: 'success' },
  pending: { text: 'Awaiting payment', tone: 'warning' },
  failed: { text: 'Checkout failed', tone: 'danger' },
}

/** Where a job order sits in the advert review process. */
export type ReviewState = 'awaiting-review' | 'awaiting-payment' | 'approved' | 'changes' | 'rejected'
export function reviewState(order: StaffInquiry): ReviewState {
  const status = order.review_status ?? 'pending'
  if (status === 'approved') return 'approved'
  if (status === 'changes_requested') return 'changes'
  if (status === 'rejected') return 'rejected'
  return paymentState(order.details?.paymentStatus) === 'paid' ? 'awaiting-review' : 'awaiting-payment'
}
export const reviewBadge: Record<ReviewState, { text: string; tone: string }> = {
  'awaiting-review': { text: 'Awaiting review', tone: 'info' },
  'awaiting-payment': { text: 'Awaiting payment', tone: 'warning' },
  approved: { text: 'Approved · live', tone: 'success' },
  changes: { text: 'Changes requested', tone: 'warning' },
  rejected: { text: 'Rejected', tone: 'danger' },
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

/** Pre-fills the job post form from what the employer submitted. */
export function jobOrderToDraft(order: StaffInquiry) {
  const details = order.details ?? {}
  // One responsibility per line or per ';'. (No regex lookbehind: older Safari cannot parse it.)
  const lines = (value: unknown) => text(value).split(/\r?\n|;/).map((line) => line.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)
  const salary = text(details.salary)
  return {
    clientName: text(details.tradingName) || text(details.legalName),
    title: text(details.jobTitle),
    location: text(details.jobLocation),
    region: '',
    industry: '' as const,
    category: '',
    employmentType: text(details.employmentType),
    isUrgent: false,
    closingDate: text(details.closingDate),
    salary,
    applicationUrl: '',
    summary: text(details.duties),
    responsibilities: [...lines(details.requirements), ...lines(details.qualifications)].join('\n'),
  }
}

export const isLiveVacancy = (vacancy: RecruiterVacancy, today: string) => !vacancy.closingDate || vacancy.closingDate >= today

/** Short reference for an employer job order, shown to staff and searchable. */
export const jobOrderReference = (id: string) => `ORD-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`

export type NotificationKind = 'action' | 'urgent' | 'enquiry' | 'reminder'
type StaffNotification = {
  id: string
  kind: NotificationKind
  title: string
  detail: string
  /** When the item became relevant; used for ordering and "new since last visit". */
  at: number
  link: { to: string; label: string }
}

const daysBetween = (from: number, to: number) => Math.max(0, Math.floor((to - from) / DAY_MS))

/**
 * Everything staff should know about, derived from current data:
 * adverts to review, urgent hires, new enquiries and follow-up reminders.
 */
export function buildNotifications(inquiries: StaffInquiry[], vacancies: RecruiterVacancy[], now: number): StaffNotification[] {
  const today = dateInSouthAfrica(now)
  const items: StaffNotification[] = []

  for (const order of inquiries.filter((item) => item.kind === 'employer')) {
    const details = order.details ?? {}
    const company = text(details.legalName) || 'An employer'
    const role = text(details.jobTitle) || 'a role'
    const reference = jobOrderReference(order.id)
    // Links carry the full id (unique); the short reference is only for people.
    const reviewLink = { to: `/admin/review?order=${encodeURIComponent(order.id)}`, label: 'Review' }
    const state = reviewState(order)
    const created = time(order.created_at)
    if (state === 'awaiting-review') {
      const paidAt = time(typeof details.paymentPaidAt === 'string' ? details.paymentPaidAt : '') || created
      items.push({ id: `review-${order.id}`, kind: 'action', title: `Advert awaiting review: ${role}`, detail: `${company} paid the activation fee. Approve the advert before it goes online. ${reference}`, at: paidAt, link: reviewLink })
    } else if (state === 'awaiting-payment' && now - created > 2 * DAY_MS) {
      items.push({ id: `unpaid-${order.id}`, kind: 'reminder', title: `Follow up payment: ${company}`, detail: `The ${role} job order has been unpaid for ${daysBetween(created, now)} days. ${reference}`, at: created + 2 * DAY_MS, link: reviewLink })
    } else if (state === 'changes' && order.reviewed_at && now - time(order.reviewed_at) > 5 * DAY_MS) {
      items.push({ id: `changes-${order.id}`, kind: 'reminder', title: `No update yet: ${company}`, detail: `Changes to the ${role} advert were requested ${daysBetween(time(order.reviewed_at), now)} days ago. ${reference}`, at: time(order.reviewed_at) + 5 * DAY_MS, link: reviewLink })
    }
  }

  for (const enquiry of inquiries.filter((item) => item.kind === 'contact')) {
    const received = time(enquiry.created_at)
    if (now - received > 14 * DAY_MS) continue
    const reference = enquiryReference(enquiry.id)
    items.push({
      id: `enquiry-${enquiry.id}`, kind: 'enquiry',
      title: `New enquiry from ${enquiry.name || enquiry.email || 'a visitor'}`,
      detail: `${enquiry.enquiry_type ? `${enquiry.enquiry_type}: ` : ''}${enquiry.subject ?? ''} · ${reference}`,
      at: received, link: { to: `/admin?enquiry=${encodeURIComponent(enquiry.id)}`, label: 'View' },
    })
  }

  for (const vacancy of vacancies) {
    const editLink = { to: `/admin/jobs?edit=${encodeURIComponent(vacancy.id)}`, label: 'Open' }
    const live = isLiveVacancy(vacancy, today)
    if (live && vacancy.isUrgent) {
      items.push({ id: `urgent-${vacancy.id}`, kind: 'urgent', title: `Urgent hire: ${vacancy.title}`, detail: `${vacancy.clientName || 'Client'} · ${vacancy.location}${vacancy.closingDate ? ` · closes ${formatDateDmy(vacancy.closingDate)}` : ''}`, at: time(vacancy.posted), link: editLink })
    }
    if (live && vacancy.closingDate && vacancy.closingDate <= addDays(today, 3)) {
      items.push({ id: `closing-${vacancy.id}`, kind: 'reminder', title: `Closing soon: ${vacancy.title}`, detail: `Closes ${formatDateDmy(vacancy.closingDate)}. Extend the closing date if the role is still open.`, at: Date.parse(`${addDays(vacancy.closingDate, -3)}T06:00:00Z`), link: editLink })
    }
    if (!live && vacancy.closingDate && vacancy.closingDate >= addDays(today, -7)) {
      items.push({ id: `expired-${vacancy.id}`, kind: 'reminder', title: `Closed: ${vacancy.title}`, detail: `Closed on ${formatDateDmy(vacancy.closingDate)} and no longer shows on the careers page. Delete it or extend the date.`, at: Date.parse(`${vacancy.closingDate}T22:00:00Z`), link: editLink })
    }
  }

  return items.sort((a, b) => b.at - a.at)
}

const seenKey = (username: string) => `imforce-notifications-seen:${username}`
export function getNotificationsSeenAt(username: string) {
  try { return Number(localStorage.getItem(seenKey(username)) ?? 0) || 0 } catch { return 0 }
}
export function setNotificationsSeenAt(username: string, value: number) {
  try { localStorage.setItem(seenKey(username), String(value)) } catch { /* private mode: badge resets per visit */ }
}
