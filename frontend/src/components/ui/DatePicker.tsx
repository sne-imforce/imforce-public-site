import { useEffect, useMemo, useRef, useState } from 'react'
import { FiCalendar, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { formatDateDmy } from '../../utils/dates'
import './DatePicker.css'

type Props = {
  value: string
  onChange: (value: string) => void
  label: string
  id: string
  name?: string
  required?: boolean
  className?: string
}

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const pad = (value: number) => String(value).padStart(2, '0')
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const todayIso = () => iso(new Date())

function parseDate(value: string): string | null {
  const text = value.trim()
  const slashDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const namedDate = text.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  if (!slashDate && !namedDate) return null
  const day = Number((slashDate ?? namedDate)![1])
  const year = Number((slashDate ?? namedDate)![3])
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const month = slashDate
    ? Number(slashDate[2])
    : monthNames.indexOf(namedDate![2].toLowerCase()) + 1
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

export default function DatePicker({ value, onChange, label, id, name, required = false, className = '' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLInputElement>(null)
  const hiddenRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState({ value, text: formatDateDmy(value) })
  const [touched, setTouched] = useState(false)
  const [month, setMonth] = useState(() => {
    const selected = value && value >= todayIso() ? new Date(`${value}T00:00:00`) : new Date()
    return new Date(selected.getFullYear(), selected.getMonth(), 1)
  })

  const today = new Date()
  const todayValue = iso(today)
  const text = typed.value === value ? typed.text : formatDateDmy(value)
  const parsed = parseDate(text)
  const valueIsPast = Boolean(value && value < todayValue)
  const typedIsPast = Boolean(parsed && parsed < todayValue)
  const invalid = valueIsPast || typedIsPast || (touched && required && !text) || (touched && Boolean(text) && !parsed)
  const errorText = valueIsPast || typedIsPast
    ? 'Choose a date that is today or later.'
    : required && !text ? 'Choose a date.' : 'Enter a valid date as dd Mon yyyy.'
  const offset = (month.getDay() + 6) % 7
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = useMemo(() => [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => index + 1),
  ], [dayCount, offset])
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const canGoPrevious = month.getTime() > currentMonth.getTime()
  const selected = value ? new Date(`${value}T00:00:00`) : null

  useEffect(() => {
    textRef.current?.setCustomValidity(invalid ? errorText : '')
  }, [invalid, errorText])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const choose = (next: string) => {
    if (next && next < todayIso()) return
    setTyped({ value: next, text: formatDateDmy(next) })
    setTouched(Boolean(next))
    textRef.current?.setCustomValidity('')
    if (hiddenRef.current) hiddenRef.current.value = next
    onChange(next)
    setOpen(false)
  }

  const handleText = (nextText: string) => {
    const result = nextText ? parseDate(nextText) : null
    const next = result && result >= todayIso() ? result : ''
    const isPast = Boolean(result && result < todayIso())
    const isValid = (Boolean(result) && !isPast) || (!required && !nextText)
    const message = isValid ? '' : isPast ? 'Choose a date that is today or later.' : required && !nextText ? 'Choose a date.' : 'Enter a valid date as dd/mm/yyyy.'
    setTyped({ value: next, text: result && !isPast ? formatDateDmy(result) : nextText })
    setTouched(Boolean(nextText))
    textRef.current?.setCustomValidity(message)
    if (hiddenRef.current) hiddenRef.current.value = next
    onChange(next)
  }

  return (
    <div className={`date-picker ${className}`.trim()} ref={rootRef}>
      {name && <input ref={hiddenRef} type="hidden" name={name} value={value} />}
      <span className="date-picker__label" id={`${id}-label`}>{label}</span>
      <div className="date-picker__control">
        <input
          ref={textRef}
          id={id}
          type="text"
          value={text}
          required={required}
          inputMode="text"
          autoComplete="off"
          placeholder="dd Mon yyyy"
          aria-labelledby={`${id}-label`}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => handleText(event.target.value)}
          onBlur={() => setTouched(true)}
        />
        <button
          type="button"
          className="date-picker__toggle"
          aria-label="Open calendar"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            if (!open && value && value >= todayIso()) setMonth(new Date(`${value}T00:00:00`))
            setOpen((current) => !current)
          }}
        ><FiCalendar aria-hidden="true" /></button>
      </div>
      {invalid && <span className="date-picker__error" id={`${id}-error`}>{errorText}</span>}
      {open && (
        <div className="date-picker__calendar" role="dialog" aria-label="Choose a date">
          <div className="date-picker__calendar-header">
            <button type="button" aria-label="Previous month" disabled={!canGoPrevious} onClick={() => setMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}><FiChevronLeft aria-hidden="true" /></button>
            <strong aria-live="polite">{month.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</strong>
            <button type="button" aria-label="Next month" onClick={() => setMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}><FiChevronRight aria-hidden="true" /></button>
          </div>
          <div className="date-picker__grid" role="grid">
            {weekdays.map((day) => <span className="date-picker__weekday" role="columnheader" key={day}>{day}</span>)}
            {cells.map((day, index) => {
              if (!day) return <span className="date-picker__blank" role="gridcell" key={`blank-${index}`} />
              const date = new Date(month.getFullYear(), month.getMonth(), day)
              const dateValue = iso(date)
              const past = dateValue < todayValue
              const isSelected = !past && selected?.getFullYear() === date.getFullYear() && selected.getMonth() === date.getMonth() && selected.getDate() === day
              const isToday = dateValue === todayValue
              return (
                <button
                  type="button"
                  className={`date-picker__day${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${past ? ' is-past' : ''}`}
                  role="gridcell"
                  aria-label={date.toLocaleDateString('en-ZA', { dateStyle: 'full' })}
                  aria-pressed={isSelected}
                  disabled={past}
                  key={dateValue}
                  onClick={() => choose(dateValue)}
                >{day}</button>
              )
            })}
          </div>
          <div className="date-picker__footer">
            {!required && <button type="button" onClick={() => choose('')}>Clear date</button>}
            <button type="button" onClick={() => choose(todayValue)}>Today</button>
          </div>
        </div>
      )}
    </div>
  )
}
