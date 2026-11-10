export type Vacancy = {
  id: string
  title: string
  location: string
  region: string
  industry?: string
  category: string
  employmentType: string
  isUrgent: boolean
  closingDate: string | null
  salary?: string
  posted: string
  applicationUrl: string | null
  summary: string
  responsibilities: string[]
  source?: 'recruiter'
  clientName?: string
}
