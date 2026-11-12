import type { Vacancy } from './vacancies'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      // Staff calls carry the HttpOnly "remembered device" cookie, including when the API is on another origin.
      credentials: path.startsWith('/staff/') ? 'include' : 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch {
    throw new Error('We could not reach IMFORCE right now. Check your internet connection and try again.')
  }
  const payload = await response.json().catch(() => ({}))
  // Sign-in steps return 401 for a wrong password or code; that is not an expired session.
  if (response.status === 401 && path.startsWith('/staff/') && !['/staff/login', '/staff/mfa/verify'].includes(path)) {
    saveStaffToken(null)
    sessionExpiredListeners.forEach((listener) => listener())
  }
  if (!response.ok) {
    // status and payload let callers react to specific answers (e.g. "already paid").
    throw Object.assign(new Error(payload.error ?? `Something went wrong (${response.status}). Please try again.`), { status: response.status, payload })
  }
  return payload as T
}

export const getVacancies = () => request<{ vacancies: Vacancy[] }>('/vacancies')
export const submitContact = (data: Record<string, string>) =>
  request<{ ok: true; reference?: string | null }>('/contact', { method: 'POST', body: JSON.stringify(data) })
export type ApiError = Error & { status?: number; payload?: { resumeToken?: string; alreadyPaid?: boolean } }
export const initializePaystackCheckout = (details: Record<string, unknown>) =>
  request<{ authorizationUrl: string; reference: string; resumeToken?: string | null }>('/payments/paystack/initialize', {
    method: 'POST', body: JSON.stringify({ details }),
  })
/** Pay for an existing job order (retry from this tab, or a link IMFORCE emailed). Never creates a new order. */
export const resumePaystackCheckout = (token: string, details?: Record<string, unknown>) =>
  request<{ authorizationUrl: string; reference: string }>('/payments/paystack/resume', {
    method: 'POST', body: JSON.stringify(details ? { token, details } : { token }),
  })
export type PaymentLinkSummary = { reference: string; jobTitle: string; company: string; amount: string; paid: boolean; closed: boolean; expiresAt: string }
export const openPaymentLink = (token: string) =>
  request<PaymentLinkSummary>('/payments/link/open', { method: 'POST', body: JSON.stringify({ token }) })
export const verifyPaystackPayment = (reference: string) =>
  request<{ paid: true; reference: string; message: string }>('/payments/paystack/verify', {
    method: 'POST', body: JSON.stringify({ reference }),
  })
export type StaffSession = { accessToken: string; email: string; displayName?: string | null; username?: string | null; deviceRemembered?: boolean; expiresIn?: number }
export type StaffMfaStep = { step: 'enroll' | 'verify'; ticket: string; factorId: string; qrCode?: string | null; secret?: string | null; uri?: string | null }
export const staffLogin = (username: string, password: string) =>
  request<StaffSession & { mfa?: undefined } | { mfa: StaffMfaStep; accessToken?: undefined }>('/staff/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  })
export const verifyStaffMfa = (ticket: string, factorId: string, code: string, rememberDevice = false) =>
  request<StaffSession>('/staff/mfa/verify', {
    method: 'POST', body: JSON.stringify({ ticket, factorId, code, rememberDevice }),
  })
export const forgetStaffDevice = (scope: 'this' | 'all' = 'this') =>
  request<{ ok: true }>('/staff/devices/forget', { method: 'POST', headers: staffHeaders(), body: JSON.stringify({ scope }) })

// The staff token lives in sessionStorage (cleared when the tab closes), never
// localStorage, and is discarded as soon as it expires or the server rejects it.
const tokenKey = 'imforce-staff-access-token'
const expiryKey = 'imforce-staff-access-expires'
const sessionExpiredListeners = new Set<() => void>()
export const onStaffSessionExpired = (listener: () => void) => {
  sessionExpiredListeners.add(listener)
  return () => { sessionExpiredListeners.delete(listener) }
}
export const getStaffToken = () => {
  try {
    const expiresAt = Number(sessionStorage.getItem(expiryKey) ?? 0)
    if (expiresAt && Date.now() >= expiresAt) { saveStaffToken(null); return null }
    return sessionStorage.getItem(tokenKey)
  } catch { return null }
}
export const getStaffTokenExpiry = () => {
  try { return Number(sessionStorage.getItem(expiryKey) ?? 0) || null } catch { return null }
}
export function saveStaffToken(token: string | null, expiresInSeconds = 3600) {
  try {
    if (token) {
      sessionStorage.setItem(tokenKey, token)
      sessionStorage.setItem(expiryKey, String(Date.now() + Math.max(60, expiresInSeconds - 30) * 1000))
    } else {
      sessionStorage.removeItem(tokenKey)
      sessionStorage.removeItem(expiryKey)
    }
  } catch { /* Storage can be unavailable in private modes; the session then lasts for this page only. */ }
}
const staffHeaders = () => ({ Authorization: `Bearer ${getStaffToken() ?? ''}` })
export const getStaffVacancies = () => request<{ vacancies: Vacancy[] }>('/staff/vacancies', { headers: staffHeaders() })
export const staffLogout = () => request<{ ok: true }>('/staff/logout', { method: 'POST', headers: staffHeaders(), body: '{}' })
export const getStaffIdentity = () => request<{ email: string; displayName: string | null; username: string | null; deviceRemembered?: boolean }>('/staff/me', { headers: staffHeaders() })

export type StaffInquiry = {
  id: string
  kind: 'contact' | 'employer'
  created_at: string
  name?: string
  email?: string
  phone?: string
  enquiry_type?: string
  subject?: string
  message?: string
  details?: Record<string, string | boolean | string[]>
  // Job orders only (migration 008)
  review_status?: 'pending' | 'approved' | 'changes_requested' | 'rejected'
  reviewed_by_name?: string | null
  reviewed_at?: string | null
  review_reason?: string | null
  vacancy_id?: string | null
  /** Latest "request changes" link sent to the employer (never the link itself). */
  change_request?: {
    reason: string
    requested_by_name: string | null
    requested_at: string
    expires_at: string
    email_status: 'sent' | 'failed' | 'not_configured' | 'not_sent'
    emailed_at: string | null
    responded_at: string | null
    revoked_at: string | null
  } | null
  /** Latest payment link a staff member emailed for an unpaid order (migration 010). */
  payment_link?: {
    created_by_name: string | null
    created_at: string
    expires_at: string
    email_status: 'sent' | 'failed' | 'not_configured' | 'not_sent'
    emailed_at: string | null
    revoked_at: string | null
  } | null
}
/** Result of sending an update link: the link is only included when it was NOT emailed. */
export type ChangeLinkResult = { emailStatus: 'sent' | 'failed' | 'not_configured'; sentTo?: string | null; expiresAt?: string; link?: string | null; error?: string }
export const resendChangeLink = (id: string) =>
  request<{ changeLink: ChangeLinkResult }>(`/staff/job-orders/${encodeURIComponent(id)}/change-link`, { method: 'POST', headers: staffHeaders(), body: '{}' })

// Employer side of "request changes" (private link from the email).
export type JobOrderChanges = { reference: string; reason: string; requestedAt: string; expiresAt: string; details: Record<string, string> }
export type FieldIssue = { field: string; message: string }
export const openJobOrderChanges = (token: string) =>
  request<JobOrderChanges>('/job-order-changes/open', { method: 'POST', body: JSON.stringify({ token }) })
export async function submitJobOrderChanges(token: string, details: Record<string, string | boolean>) {
  // Field-level errors are returned alongside the message, so read the body ourselves.
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/job-order-changes/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, details }),
    })
  } catch {
    throw Object.assign(new Error('We could not reach IMFORCE right now. Check your internet connection and try again.'), { issues: [] as FieldIssue[] })
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(payload.error ?? 'Your changes could not be saved.'), { issues: (payload.errors ?? []) as FieldIssue[], status: response.status })
  return payload as { ok: true; reference: string }
}
/** Staff: email the employer a private link to pay for an unpaid job order. */
export const sendPaymentLink = (id: string) =>
  request<{ paymentLink: ChangeLinkResult }>(`/staff/job-orders/${encodeURIComponent(id)}/payment-link`, { method: 'POST', headers: staffHeaders(), body: '{}' })
// Job orders are never rejected: staff approve them or ask the employer for changes.
export type ReviewDecision = 'approve' | 'changes' | 'reopen'
export const reviewJobOrder = (id: string, body: { decision: ReviewDecision; reason?: string; vacancy?: Partial<Vacancy> }) =>
  request<{ reviewStatus: string; vacancy: Vacancy | null; changeLink: ChangeLinkResult | null; employerEmail?: 'sent' | 'failed' | 'not_configured' | null }>(`/staff/job-orders/${encodeURIComponent(id)}/review`, {
    method: 'POST', headers: staffHeaders(), body: JSON.stringify(body),
  })
export type StaffAuditEntry = {
  occurred_at: string
  actor_email: string | null
  actor_name?: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  detail: Record<string, unknown>
}
export const getStaffAudit = () => request<{ entries: StaffAuditEntry[] }>('/staff/audit', { headers: staffHeaders() })
export const getStaffInquiries = () => request<{ inquiries: StaffInquiry[] }>('/staff/inquiries', { headers: staffHeaders() })

export const saveVacancy = (data: Partial<Vacancy>, id?: string) => request<{ vacancy: Vacancy }>(
  `/staff/vacancies${id ? `/${encodeURIComponent(id)}` : ''}`,
  { method: id ? 'PUT' : 'POST', headers: staffHeaders(), body: JSON.stringify(data) },
)
export const removeVacancy = (id: string) => request<{ ok: true }>(`/staff/vacancies/${encodeURIComponent(id)}`, {
  method: 'DELETE', headers: staffHeaders(),
})
