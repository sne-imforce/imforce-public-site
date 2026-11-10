import { useCallback, useEffect, useState } from 'react'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase'
import { industries } from './industries'
import type { Vacancy } from './vacancies'

export type RecruiterVacancy = Vacancy & {
  clientName: string
}

export type RecruiterVacancyDraft = Omit<
  RecruiterVacancy,
  'id' | 'posted'
>

type VacancyRow = {
  id: string
  title: string
  location: string
  region: string
  industry: string | null
  category: string
  employment_type: string
  salary: string | null
  application_url: string | null
  summary: string
  responsibilities: string[]
  is_urgent: boolean
  created_at: string
}

type VacancyPrivateDetailsRow = {
  vacancy_id: string
  client_name: string
}

function getPostedLabel(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Recently added'
    : date.toLocaleDateString('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
}

function toRecruiterVacancy(
  row: VacancyRow,
  privateDetails: ReadonlyMap<string, string>,
): RecruiterVacancy {
  const industry = industries.find((item) => item.name === row.industry)?.name

  return {
    id: row.id,
    title: row.title,
    location: row.location,
    region: row.region,
    ...(industry ? { industry } : {}),
    category: row.category,
    employmentType: row.employment_type,
    ...(row.salary ? { salary: row.salary } : {}),
    posted: getPostedLabel(row.created_at),
    applicationUrl: row.application_url,
    summary: row.summary,
    responsibilities: row.responsibilities,
    clientName: privateDetails.get(row.id) ?? '',
    urgent: row.is_urgent,
  }
}

export async function fetchRecruiterVacancies() {
  const client = getSupabaseClient()
  const { data: isStaff, error: roleError } = await client.rpc('is_staff')
  if (roleError) {
    throw new Error(`Unable to verify staff access: ${roleError.message}`)
  }

  const { data, error } = await client
    .from('vacancies')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    throw new Error(`Unable to load vacancies: ${error.message}`)
  }

  const rows: VacancyRow[] = data ?? []
  let privateDetails = new Map<string, string>()

  if (isStaff && rows.length > 0) {
    const { data: privateRows, error: privateError } = await client
      .from('vacancy_private_details')
      .select('vacancy_id, client_name')
      .in(
        'vacancy_id',
        rows.map((row) => row.id),
      )

    if (privateError) {
      throw new Error(
        `Unable to load private vacancy details: ${privateError.message}`,
      )
    }

    const details: VacancyPrivateDetailsRow[] = privateRows ?? []
    privateDetails = new Map(
      details.map((detail) => [detail.vacancy_id, detail.client_name]),
    )
  }

  return rows.map((row) => toRecruiterVacancy(row, privateDetails))
}

export function useRecruiterVacancies() {
  const [vacancies, setVacancies] = useState<RecruiterVacancy[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setVacancies([])
      const message =
        'Supabase is not configured. Add the project URL and public key to frontend/.env.local.'
      console.error(message)
      setError(message)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError('')
    try {
      setVacancies(await fetchRecruiterVacancies())
    } catch (loadError) {
      console.error('Unable to load vacancies.', loadError)
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load vacancies.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) return reload()
    })
    return () => {
      active = false
    }
  }, [reload])

  return { vacancies, isLoading, error, reload }
}

export async function saveRecruiterVacancy(
  vacancy: RecruiterVacancyDraft,
  vacancyId: string | null = null,
) {
  const { error } = await getSupabaseClient().rpc('save_vacancy', {
    p_id: vacancyId,
    p_client_name: vacancy.clientName,
    p_title: vacancy.title,
    p_location: vacancy.location,
    p_region: vacancy.region,
    p_industry: vacancy.industry ?? null,
    p_category: vacancy.category,
    p_employment_type: vacancy.employmentType,
    p_salary: vacancy.salary ?? null,
    p_application_url: vacancy.applicationUrl,
    p_summary: vacancy.summary,
    p_responsibilities: vacancy.responsibilities,
    p_is_urgent: vacancy.urgent ?? false,
  })

  if (error) {
    throw new Error(`Unable to save vacancy: ${error.message}`)
  }
}

export async function deleteRecruiterVacancy(vacancyId: string) {
  const { error } = await getSupabaseClient()
    .from('vacancies')
    .delete()
    .eq('id', vacancyId)

  if (error) {
    throw new Error(`Unable to delete vacancy: ${error.message}`)
  }
}
