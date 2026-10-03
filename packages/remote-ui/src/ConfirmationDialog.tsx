import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { RemoteButton } from './RemoteButton'

export type ConfirmationDialogProps = {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmationDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const titleId = useId()
  const messageId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (['Escape', 'Backspace', 'GoBack', 'BrowserBack'].includes(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      if (!busy) onCancel()
      return
    }

    if (event.key !== 'Tab') return
    if (event.shiftKey && document.activeElement === cancelRef.current) {
      event.preventDefault()
      confirmRef.current?.focus()
    } else if (!event.shiftKey && document.activeElement === confirmRef.current) {
      event.preventDefault()
      cancelRef.current?.focus()
    }
  }

  return (
    <div
      className="remote-confirmation-dialog__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <section
        className="remote-confirmation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="remote-confirmation-dialog__title">{title}</h2>
        <div id={messageId} className="remote-confirmation-dialog__message">{message}</div>
        <div className="remote-confirmation-dialog__actions">
          <RemoteButton
            ref={cancelRef}
            autoFocus
            data-remote-initial=""
            className="remote-confirmation-dialog__button remote-confirmation-dialog__cancel"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </RemoteButton>
          <RemoteButton
            ref={confirmRef}
            className={`remote-confirmation-dialog__button ${destructive ? 'is-destructive' : ''}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </RemoteButton>
        </div>
      </section>
    </div>
  )
}