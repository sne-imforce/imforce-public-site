import { useEffect, useRef, type ReactNode } from 'react'
import { FiAlertTriangle, FiEdit3 } from 'react-icons/fi'
import Spinner from '../components/ui/Spinner'

type Props = {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  busyLabel?: string
  busy?: boolean
  /** 'danger' for destructive actions (red), 'neutral' for everyday decisions. */
  tone?: 'danger' | 'neutral'
  /** Disable the confirm button, e.g. until a required reason is typed. */
  confirmDisabled?: boolean
  error?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Accessible confirmation modal for destructive actions, built on the native
 * <dialog> element (focus trap, Escape to close, dimmed backdrop). Focus starts
 * on "Cancel" so pressing Enter by accident never deletes anything.
 */
export default function ConfirmDialog({
  open, title, children, confirmLabel, busyLabel = 'Working…', busy = false, tone = 'danger', confirmDisabled = false, error = '', onConfirm, onCancel,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      cancelRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className={`confirm-dialog confirm-dialog--${tone}`}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-body"
      onCancel={(event) => {
        // Escape key: keep the dialog open while the action is running.
        event.preventDefault()
        if (!busy) onCancel()
      }}
      onClick={(event) => {
        // A click on the dimmed backdrop (outside the panel) cancels.
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <div className="confirm-dialog__panel">
        <span className="confirm-dialog__icon" aria-hidden="true">{tone === 'danger' ? <FiAlertTriangle /> : <FiEdit3 />}</span>
        <h2 id="confirm-dialog-title">{title}</h2>
        <div id="confirm-dialog-body" className="confirm-dialog__body">{children}</div>
        {error && <p className="staff-access-error" role="alert">{error}</p>}
        <div className="confirm-dialog__actions">
          <button ref={cancelRef} type="button" className="admin__button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="confirm-dialog__confirm" onClick={onConfirm} disabled={busy || confirmDisabled} aria-busy={busy}>
            {busy ? <Spinner label={busyLabel} size="sm" tone="light" /> : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
