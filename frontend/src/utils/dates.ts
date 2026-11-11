export function formatDateDmy(value: string | null | undefined) {
  if (!value) return ''
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/)
  if (isoDate) {
    const year = Number(isoDate[1])
    const month = Number(isoDate[2])
    const day = Number(isoDate[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(date)
      return `${isoDate[3]} ${monthName} ${isoDate[1]}`
    }
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('day')} ${part('month')} ${part('year')}`
}

export function formatSalary(value: string | null | undefined) {
  return value?.replace(/\$\s*/g, 'ZAR ').trim() ?? ''
}
