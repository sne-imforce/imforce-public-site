import './Spinner.css'

type Props = {
  /** Text announced to screen readers (and shown, unless `hideLabel`). */
  label: string
  size?: 'sm' | 'md' | 'lg'
  /** Hide the text visually but keep it for screen readers. */
  hideLabel?: boolean
  /** Light spinner for dark backgrounds (e.g. inside primary buttons). */
  tone?: 'default' | 'light'
  className?: string
}

/** Accessible loading indicator. Announced politely; respects reduced motion. */
export default function Spinner({ label, size = 'md', hideLabel = false, tone = 'default', className = '' }: Props) {
  return (
    <span className={`spinner spinner--${size} spinner--${tone} ${className}`.trim()} role="status" aria-live="polite">
      <span className="spinner__ring" aria-hidden="true" />
      <span className={hideLabel ? 'spinner__label spinner__label--hidden' : 'spinner__label'}>{label}</span>
    </span>
  )
}

/** Centred block spinner for areas whose content is still loading. */
export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="loading-block">
      <Spinner label={label} size="lg" />
    </div>
  )
}
