import type { IndustryName } from './industries'

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
  source?: 'recruiter'
  clientName?: string
}

export const urgentVacancies: Vacancy[] = [
  {
    id: 'urgent-operations',
    title: 'Sample: Operations Manager',
    location: 'Pietermaritzburg (sample location)',
    region: 'KwaZulu-Natal',
    category: 'Operations',
    employmentType: 'Permanent',
    posted: 'Urgent opportunity',
    applicationUrl: null,
    summary:
      'A sample vacancy preview for an experienced operations professional ready for their next step.',
    responsibilities: [
      'Coordinate day-to-day operations and support team delivery.',
      'Review processes and identify opportunities for improvement.',
      'Work with colleagues to meet role and business requirements.',
    ],
  },
  {
    id: 'urgent-finance',
    title: 'Sample: Finance Administrator',
    location: 'Durban (sample location)',
    region: 'KwaZulu-Natal',
    industry: 'Finance',
    category: 'Finance',
    employmentType: 'Contract',
    posted: 'Urgent opportunity',
    applicationUrl: null,
    summary:
      'A sample vacancy preview for a detail-oriented finance professional.',
    responsibilities: [
      'Assist with routine financial administration and record keeping.',
      'Prepare information for internal reports and reconciliations.',
      'Support the finance team with day-to-day tasks.',
    ],
  },
]

export const recentVacancies: Vacancy[] = [
  {
    id: 'recent-human-resources',
    title: 'Sample: Human Resources Officer',
    location: 'East London (sample location)',
    region: 'Eastern Cape',
    category: 'Human resources',
    employmentType: 'Fixed-term',
    posted: 'Recently added',
    applicationUrl: null,
    summary:
      'A sample preview for an HR professional who enjoys supporting people and teams.',
    responsibilities: [
      'Support recruitment, onboarding and employee administration.',
      'Maintain accurate people records and documentation.',
      'Respond to routine employee and manager enquiries.',
    ],
  },
  {
    id: 'recent-sales',
    title: 'Sample: Sales Representative',
    location: 'Johannesburg (sample location)',
    region: 'Gauteng',
    category: 'Sales',
    employmentType: 'Contract',
    posted: 'Recently added',
    applicationUrl: null,
    summary:
      'A sample preview for a customer-focused professional with strong communication skills.',
    responsibilities: [
      'Build and maintain professional customer relationships.',
      'Understand customer requirements and present suitable solutions.',
      'Keep sales activity and customer records up to date.',
    ],
  },
  {
    id: 'recent-engineering',
    title: 'Sample: Engineering Technician',
    location: 'Pretoria (sample location)',
    region: 'Gauteng',
    industry: 'Engineering',
    category: 'Engineering',
    employmentType: 'Permanent',
    posted: 'Recently added',
    applicationUrl: null,
    summary:
      'A sample preview for a technically minded candidate who values quality work.',
    responsibilities: [
      'Assist with technical inspections and routine maintenance.',
      'Follow workplace quality, safety and operating procedures.',
      'Record work completed and escalate issues when needed.',
    ],
  },
]
