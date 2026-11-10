import { useSyncExternalStore } from 'react'
import type { Vacancy } from './vacancies'
import { getVacancies, getStaffVacancies, removeVacancy, saveVacancy } from './api'

export type RecruiterVacancy = Vacancy & { source: 'recruiter'; clientName: string }
let vacancies: RecruiterVacancy[] = []
let status = { loading: true, error: '' }
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) }
const snapshot = () => vacancies
const statusSnapshot = () => status

export function useRecruiterVacancies() {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
export function useVacancyStatus() {
  return useSyncExternalStore(subscribe, statusSnapshot, statusSnapshot)
}
export async function loadPublicVacancies() {
  status = { loading: true, error: '' }; notify()
  try { vacancies = (await getVacancies()).vacancies as RecruiterVacancy[] }
  catch (cause) { status = { loading: true, error: cause instanceof Error ? cause.message : 'Vacancies could not be loaded.' } }
  finally { status = { ...status, loading: false }; notify() }
}
export async function loadStaffVacancies() {
  status = { loading: true, error: '' }; notify()
  try { vacancies = (await getStaffVacancies()).vacancies as RecruiterVacancy[] }
  catch (cause) { status = { loading: true, error: cause instanceof Error ? cause.message : 'Vacancies could not be loaded.' }; throw cause }
  finally { status = { ...status, loading: false }; notify() }
}
export async function addRecruiterVacancy(vacancy: Omit<RecruiterVacancy, 'id' | 'source' | 'posted'>) {
  const { vacancy: saved } = await saveVacancy(vacancy)
  vacancies = [saved as RecruiterVacancy, ...vacancies]; notify(); return saved as RecruiterVacancy
}
export async function updateRecruiterVacancy(id: string, updates: Partial<Omit<RecruiterVacancy, 'id' | 'source'>>) {
  const existing = vacancies.find((vacancy) => vacancy.id === id)
  if (!existing) throw new Error('This vacancy could not be found to update.')
  const { vacancy: saved } = await saveVacancy({ ...existing, ...updates }, id)
  vacancies = vacancies.map((vacancy) => vacancy.id === id ? saved as RecruiterVacancy : vacancy); notify()
  return saved as RecruiterVacancy
}
export async function deleteRecruiterVacancy(id: string) {
  await removeVacancy(id); vacancies = vacancies.filter((vacancy) => vacancy.id !== id); notify()
}
