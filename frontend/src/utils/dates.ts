export function formatDateDmy(value: string | null | undefined) {
  if (!value) return ''
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/)
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('day')}/${part('month')}/${part('year')}`
}

export function formatSalary(value: string | null | undefined) {
  return value?.replace(/\$\s*/g, 'ZAR ').trim() ?? ''
}
