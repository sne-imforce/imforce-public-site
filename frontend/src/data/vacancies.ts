import type { IndustryName } from './industries'

export const nexoraAiApplicationUrl = 'https://nexoraai.co.za'

export type Vacancy = {
  id: string
  title: string
  location: string
  region: string
  industry?: IndustryName
  category: string
  employmentType: string
  salary?: string
  posted: string
  applicationUrl: string | null
  summary: string
  responsibilities: string[]
  urgent?: boolean
}
