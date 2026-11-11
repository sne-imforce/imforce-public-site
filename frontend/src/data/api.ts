import type { Vacancy } from './vacancies'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch {
    throw new Error('We could not reach IMFORCE right now. Check your internet connection and try again.')
  }
  const payload = await response.json().catch(() => ({}))
  if (response.status === 401 && path.startsWith('/staff/') && path !== '/staff/login') {
    saveStaffToken(null)
    sessionExpiredListeners.forEach((listener) => listener())
  }
  if (!response.ok) throw new Error(payload.error ?? `Something went wrong (${response.status}). Please try again.`)
  return payload as T
}

export const getVacancies = () => request<{ vacancies: Vacancy[] }>('/vacancies')
export const submitContact = (data: Record<string, string>) =>
  request<{ ok: true }>('/contact', { method: 'POST', body: JSON.stringify(data) })
export const initializePaystackCheckout = (details: Record<string, unknown>) =>
  request<{ authorizationUrl: string; reference: string }>('/payments/paystack/initialize', {
    method: 'POST', body: JSON.stringify({ details }),
  })
export const verifyPaystackPayment = (reference: string) =>
  request<{ paid: true; message: string }>('/payments/paystack/verify', {
    method: 'POST', body: JSON.stringify({ reference }),
  })
export const staffLogin = (email: string, password: string) =>
  request<{ accessToken: string; email: string; expiresIn?: number }>('/staff/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  })

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
export const getStaffIdentity = () => request<{ email: string }>('/staff/me', { headers: staffHeaders() })

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
  details?: Record<string, string | boolean>
}
export const getStaffInquiries = () => request<{ inquiries: StaffInquiry[] }>('/staff/inquiries', { headers: staffHeaders() })

export const saveVacancy = (data: Partial<Vacancy>, id?: string) => request<{ vacancy: Vacancy }>(
  `/staff/vacancies${id ? `/${encodeURIComponent(id)}` : ''}`,
  { method: id ? 'PUT' : 'POST', headers: staffHeaders(), body: JSON.stringify(data) },
)
export const removeVacancy = (id: string) => request<{ ok: true }>(`/staff/vacancies/${encodeURIComponent(id)}`, {
  method: 'DELETE', headers: staffHeaders(),
})
