import { useSyncExternalStore } from 'react'
import { industries } from './industries'
import type { Vacancy } from './vacancies'

export type RecruiterVacancy = Vacancy & {
  source: 'recruiter'
  clientName: string
}

const storageKey = 'imforce-recruiter-vacancies'
const listeners = new Set<() => void>()

function isRecruiterVacancy(value: unknown): value is RecruiterVacancy {
  if (typeof value !== 'object' || value === null) return false

  const vacancy = value as Record<string, unknown>
  return (
    vacancy.source === 'recruiter' &&
    typeof vacancy.id === 'string' &&
    typeof vacancy.clientName === 'string' &&
    typeof vacancy.title === 'string' &&
    typeof vacancy.location === 'string' &&
    typeof vacancy.region === 'string' &&
    (vacancy.industry === undefined ||
      industries.some((industry) => industry.name === vacancy.industry)) &&
    typeof vacancy.category === 'string' &&
    typeof vacancy.employmentType === 'string' &&
    (typeof vacancy.salary === 'string' || vacancy.salary === undefined) &&
    typeof vacancy.posted === 'string' &&
    (typeof vacancy.applicationUrl === 'string' ||
      vacancy.applicationUrl === null) &&
    typeof vacancy.summary === 'string' &&
    Array.isArray(vacancy.responsibilities) &&
    vacancy.responsibilities.every(
      (responsibility) => typeof responsibility === 'string',
    )
  )
}

function readStoredVacancies(): RecruiterVacancy[] {
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return []

    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed) || !parsed.every(isRecruiterVacancy)) {
      throw new Error('Stored recruiter vacancies have an invalid format.')
    }

    return parsed
  } catch (error) {
    console.error('Unable to load recruiter-created vacancies.', error)
    return []
  }
}

let recruiterVacancies = readStoredVacancies()

function notifyListeners() {
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return recruiterVacancies
}

window.addEventListener('storage', (event) => {
  if (event.key !== storageKey && event.key !== null) return
  recruiterVacancies = readStoredVacancies()
  notifyListeners()
})

export function useRecruiterVacancies() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function getRecruiterVacancies() {
  return recruiterVacancies
}

export function addRecruiterVacancy(
  vacancy: Omit<RecruiterVacancy, 'id' | 'source' | 'posted'>,
) {
  const newVacancy: RecruiterVacancy = {
    ...vacancy,
    id: `recruiter-${window.crypto.randomUUID()}`,
    source: 'recruiter',
    posted: 'Recently added',
  }
  const updatedVacancies = [newVacancy, ...recruiterVacancies]

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(updatedVacancies))
  } catch (error) {
    console.error('Unable to save recruiter-created vacancy.', error)
    throw new Error('This vacancy could not be saved in this browser.', {
      cause: error,
    })
  }

  recruiterVacancies = updatedVacancies
  notifyListeners()
  return newVacancy
}
