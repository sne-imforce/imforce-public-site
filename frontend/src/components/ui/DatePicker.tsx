import { useEffect, useMemo, useRef, useState } from 'react'
import { FiCalendar, FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { formatDateDmy } from '../../utils/dates'
import './DatePicker.css'

type DatePickerProps = {
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
const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const getTodayIso = () => toIsoDate(new Date())

function parseDisplayDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

export default function DatePicker({ value, onChange, label, id, name, required = false, className = '' }: DatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const hiddenRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [inputState, setInputState] = useState({ value, text: formatDateDmy(value) })
  const [showError, setShowError] = useState(Boolean(value && value < getTodayIso()))
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = value && value >= getTodayIso() ? new Date(`${value}T00:00:00`) : new Date()
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })

  const text = inputState.value === value ? inputState.text : formatDateDmy(value)
  const todayIso = getTodayIso()
  const valueIsPast = Boolean(value && value < todayIso)
  const hasError = showError || valueIsPast
  const typedDate = parseDisplayDate(text)
  const typedDateIsPast = Boolean(typedDate && typedDate < todayIso)
  const selectedDate = value ? new Date(`${value}T00:00:00`) : null
  const offset = (visibleMonth.getDay() + 6) % 7
  const monthDays = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate()
  const days = useMemo(() => [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: monthDays }, (_, index) => index + 1),
  ], [monthDays, offset])

  useEffect(() => {
    inputRef.current?.setCustomValidity(valueIsPast ? 'Choose a date that is today or later.' : '')
  }, [valueIsPast])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const setDate = (isoDate: string) => {
    if (isoDate && isoDate < getTodayIso()) return
    setInputState({ value: isoDate, text: formatDateDmy(isoDate) })
    setShowError(false)
    inputRef.current?.setCustomValidity('')
    if (hiddenRef.current) hiddenRef.current.value = isoDate
    onChange(isoDate)
    setOpen(false)
  }

  const handleInput = (nextText: string) => {
    const parsed = nextText ? parseDisplayDate(nextText) : ''
    const isPast = Boolean(parsed && parsed < todayIso)
    const valid = ((!required && !nextText) || Boolean(parsed)) && !isPast
    setInputState({ value: parsed || '', text: parsed ? formatDateDmy(parsed) : nextText })
    setShowError(!valid)
    inputRef.current?.setCustomValidity(valid ? '' : isPast ? 'Choose a date that is today or later.' : required && !nextText ? 'Choose a date.' : 'Enter a valid date as dd/mm/yyyy.')
    if (hiddenRef.current) hiddenRef.current.value = parsed || ''
    onChange(parsed || '')
  }

  const moveMonth = (amount: number) => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1))
  const today = new Date()
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const canGoPrevious = visibleMonth.getTime() > currentMonth.getTime()
  const monthLabel = visibleMonth.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

  return (
    <div className={`date-picker ${className}`.trim()} ref={rootRef}>
      {name && <input ref={hiddenRef} type="hidden" name={name} value={value} />}
      <span className="date-picker__label" id={`${id}-label`}>{label}</span>
      <div className="date-picker__control">
        <input
          ref={inputRef}
          id={id}
          type="text"
          required={required}
          inputMode="numeric"
          autoComplete="off"
          placeholder="dd/mm/yyyy"
          value={text}
          aria-labelledby={`${id}-label`}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${id}-error` : undefined}
          onChange={(event) => handleInput(event.target.value)}
          onBlur={() => {
            const parsed = parseDisplayDate(text)
            const invalid = required ? !parsed || parsed < todayIso : Boolean(text) && (!parsed || parsed < todayIso)
            setShowError(invalid)
            inputRef.current?.setCustomValidity(invalid ? parsed && parsed < todayIso ? 'Choose a date that is today or later.' : required && !text ? 'Choose a date.' : 'Enter a valid date as dd/mm/yyyy.' : '')
          }}
        />
        <button
          type="button"
          className="date-picker__toggle"
          aria-label="Open calendar"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => {
            if (!open && value && value >= todayIso) setVisibleMonth(new Date(`${value}T00:00:00`))
            setOpen((current) => !current)
          }}
        >
          <FiCalendar aria-hidden="true" />
        </button>
      </div>
      {hasError && <span className="date-picker__error" id={`${id}-error`}>{valueIsPast || typedDateIsPast ? 'Choose a date that is today or later.' : required && !text ? 'Choose a date.' : 'Enter a valid date as dd/mm/yyyy.'}</span>}
      {open && (
        <div className="date-picker__calendar" role="dialog" aria-label="Choose a date">
          <div className="date-picker__calendar-header">
            <button type="button" aria-label="Previous month" disabled={!canGoPrevious} onClick={() => moveMonth(-1)}><FiChevronLeft aria-hidden="true" /></button>
            <strong aria-live="polite">{monthLabel}</strong>
            <button type="button" aria-label="Next month" onClick={() => moveMonth(1)}><FiChevronRight aria-hidden="true" /></button>
          </div>
          <div className="date-picker__grid" role="grid">
            {weekdays.map((weekday) => <span className="date-picker__weekday" role="columnheader" key={weekday}>{weekday}</span>)}
            {days.map((day, index) => {
              if (day === null) return <span className="date-picker__blank" role="gridcell" key={`blank-${index}`} />
              const date = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)
              const isoDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(day)}`
              const isPast = isoDate < todayIso
              const isSelected = isoDate >= todayIso && selectedDate?.getFullYear() === date.getFullYear() && selectedDate.getMonth() === date.getMonth() && selectedDate.getDate() === day
              const isToday = today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === day
              return (
                <button
                  type="button"
                  className={`date-picker__day${isSelected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}${isPast ? ' is-past' : ''}`}
                  role="gridcell"
                  aria-label={date.toLocaleDateString('en-ZA', { dateStyle: 'full' })}
                  aria-pressed={isSelected}
                  aria-disabled={isPast}
                  disabled={isPast}
                  key={isoDate}
                  onClick={() => setDate(isoDate)}
                >{day}</button>
              )
            })}
          </div>
          <div className="date-picker__footer">
            <button type="button" onClick={() => setDate('')}>Clear date</button>
            <button type="button" onClick={() => setDate(todayIso)}>Today</button>
          </div>
        </div>
      )}
    </div>
  )
}
