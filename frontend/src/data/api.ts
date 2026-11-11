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
    throw new Error('The IMFORCE API could not be reached. Start the backend server and check VITE_API_BASE_URL.')
  }
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status}).`)
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
  request<{ accessToken: string; email: string }>('/staff/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  })

const tokenKey = 'imforce-staff-access-token'
export const getStaffToken = () => sessionStorage.getItem(tokenKey)
export const saveStaffToken = (token: string | null) => {
  if (token) sessionStorage.setItem(tokenKey, token)
  else sessionStorage.removeItem(tokenKey)
}
const staffHeaders = () => ({ Authorization: `Bearer ${getStaffToken() ?? ''}` })
export const getStaffVacancies = () => request<{ vacancies: Vacancy[] }>('/staff/vacancies', { headers: staffHeaders() })
export const getStaffIdentity = () => request<{ email: string }>('/staff/me', { headers: staffHeaders() })

export type StaffInquiry = {
  id: string
  kind: 'contact' | 'employer'
  created_at: string
  email?: string
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
