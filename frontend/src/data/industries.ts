export const industries = [
  {
    name: 'Manufacturing',
    slug: 'manufacturing',
    candidateHelp:
      'IMFORCE helps candidates understand the skills and experience employers need for manufacturing roles, then look for permanent opportunities that fit their background.',
    roleExamples:
      'Roles may include production, quality, maintenance and operations. These are examples, not current vacancies.',
  },
  {
    name: 'FMCG',
    slug: 'fmcg',
    candidateHelp:
      'For fast-moving consumer goods roles, IMFORCE can help candidates compare their experience with an employer’s requirements and take the next step toward a suitable permanent opportunity.',
    roleExamples:
      'Roles may include production, sales, warehousing and supply chain. These are examples, not current vacancies.',
  },
  {
    name: 'Hospitality',
    slug: 'hospitality',
    candidateHelp:
      'IMFORCE helps hospitality candidates understand what a role involves and connect their service or operational experience with permanent opportunities that match.',
    roleExamples:
      'Roles may include guest services, food service, kitchen operations and hospitality management. These are examples, not current vacancies.',
  },
  {
    name: 'Retail',
    slug: 'retail',
    candidateHelp:
      'Retail candidates can use IMFORCE to explore role requirements and find permanent opportunities where their customer, sales or store experience may be a fit.',
    roleExamples:
      'Roles may include sales, store operations, merchandising and supervision. These are examples, not current vacancies.',
  },
  {
    name: 'Engineering',
    slug: 'engineering',
    candidateHelp:
      'IMFORCE helps engineering candidates present relevant skills and experience for employer requirements and explore permanent roles suited to their background.',
    roleExamples:
      'Roles may include engineering technicians, maintenance, design and project support. These are examples, not current vacancies.',
  },
  {
    name: 'Finance',
    slug: 'finance',
    candidateHelp:
      'Finance candidates can explore permanent opportunities through IMFORCE and understand how their experience relates to each employer’s role requirements.',
    roleExamples:
      'Roles may include accounting, payroll, financial administration and reporting. These are examples, not current vacancies.',
  },
  {
    name: 'Security',
    slug: 'security',
    candidateHelp:
      'IMFORCE helps security candidates review role requirements and explore permanent opportunities relevant to their experience and qualifications.',
    roleExamples:
      'Roles may include security officers, supervisors and security operations. Some roles may require current licences or other qualifications. These are examples, not current vacancies.',
  },
  {
    name: 'Logistics',
    slug: 'logistics',
    candidateHelp:
      'For logistics opportunities, IMFORCE helps candidates understand the work and compare their experience with the requirements for a permanent role.',
    roleExamples:
      'Roles may include warehousing, dispatch, fleet coordination and supply chain. These are examples, not current vacancies.',
  },
  {
    name: 'IT',
    slug: 'it',
    candidateHelp:
      'IT candidates can explore permanent opportunities through IMFORCE and see how their technical skills and experience relate to the needs of each role.',
    roleExamples:
      'Roles may include technical support, systems, software and networks. These are examples, not current vacancies.',
  },
] as const

export type IndustryName = (typeof industries)[number]['name']

export function getIndustryBySlug(slug: string | null | undefined) {
  return industries.find((industry) => industry.slug === slug)
}
