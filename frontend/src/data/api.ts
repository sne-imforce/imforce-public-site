import type { Vacancy } from './vacancies'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error ?? 'The request could not be completed.')
  return payload as T
}

export const getVacancies = () => request<{ vacancies: Vacancy[] }>('/vacancies')
export const submitContact = (data: Record<string, string>) =>
  request<{ ok: true }>('/contact', { method: 'POST', body: JSON.stringify(data) })
export const submitEmployerInquiry = (data: Record<string, unknown>) =>
  request<{ ok: true }>('/employer-inquiries', { method: 'POST', body: JSON.stringify(data) })
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
export const getStaffVacancies = () => request<{ vacancies: Vacancy[] }>('/staff/vacancies', {
  headers: { Authorization: `Bearer ${getStaffToken() ?? ''}` },
})
export const getStaffIdentity = () => request<{ email: string }>('/staff/me', {
  headers: { Authorization: `Bearer ${getStaffToken() ?? ''}` },
})
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
export const getStaffInquiries = () => request<{ inquiries: StaffInquiry[] }>('/staff/inquiries', {
  headers: { Authorization: `Bearer ${getStaffToken() ?? ''}` },
})
export const saveVacancy = (data: Partial<Vacancy>, id?: string) => request<{ vacancy: Vacancy }>(
  `/staff/vacancies${id ? `/${encodeURIComponent(id)}` : ''}`,
  { method: id ? 'PUT' : 'POST', headers: { Authorization: `Bearer ${getStaffToken() ?? ''}` }, body: JSON.stringify(data) },
)
export const removeVacancy = (id: string) => request<{ ok: true }>(`/staff/vacancies/${encodeURIComponent(id)}`, {
  method: 'DELETE', headers: { Authorization: `Bearer ${getStaffToken() ?? ''}` },
})
