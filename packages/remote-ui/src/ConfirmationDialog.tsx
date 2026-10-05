import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { RemoteButton } from './RemoteButton'

export type ConfirmationDialogProps = {
  title: string
  message?: ReactNode
  context?: ReactNode
  icon?: ReactNode
  className?: string
  confirmIcon?: ReactNode
  cancelIcon?: ReactNode
  secondaryAction?: { label: string; icon?: ReactNode; onClick: () => void }
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
  context,
  icon,
  className = '',
  confirmIcon,
  cancelIcon,
  secondaryAction,
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
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const siblings = Array.from(backdropRef.current?.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdropRef.current && !element.inert)
    siblings.forEach((element) => { element.inert = true })
    cancelRef.current?.focus({ preventScroll: true })
    return () => {
      siblings.forEach((element) => { element.inert = false })
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (['Escape', 'Backspace', 'GoBack', 'BrowserBack'].includes(event.key)) {
      event.preventDefault()
      event.stopPropagation()
      if (!busy) onCancel()
      return
    }

    if (event.key !== 'Tab') return
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const edge = event.shiftKey ? buttons[0] : buttons.at(-1)
    if (document.activeElement === edge) {
      event.preventDefault()
      ;(event.shiftKey ? buttons.at(-1) : buttons[0])?.focus()
    }
  }

  return (
    <div
      ref={backdropRef}
      className="remote-confirmation-dialog__backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel()
      }}
    >
      <section
        className={`remote-confirmation-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        onKeyDown={handleKeyDown}
      >
        {(icon || context) && <div className="remote-confirmation-dialog__context">{icon && <span className="remote-confirmation-dialog__icon" aria-hidden="true">{icon}</span>}{context}</div>}
        <h2 id={titleId} className="remote-confirmation-dialog__title">{title}</h2>
        {message && <div id={messageId} className="remote-confirmation-dialog__message">{message}</div>}
        <div className="remote-confirmation-dialog__actions">
          <RemoteButton
            ref={cancelRef}
            data-remote-initial=""
            className="remote-confirmation-dialog__button remote-confirmation-dialog__cancel"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelIcon}
            {cancelLabel}
          </RemoteButton>
          {secondaryAction && <RemoteButton className="remote-confirmation-dialog__button remote-confirmation-dialog__secondary" disabled={busy} onClick={secondaryAction.onClick}>{secondaryAction.icon}{secondaryAction.label}</RemoteButton>}
          <RemoteButton
            className={`remote-confirmation-dialog__button ${destructive ? 'is-destructive' : 'is-primary'}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmIcon}
            {confirmLabel}
          </RemoteButton>
        </div>
      </section>
    </div>
  )
}