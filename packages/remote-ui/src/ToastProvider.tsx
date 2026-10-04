import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CircleCheck, CircleAlert, Info, TriangleAlert, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { ToastContext } from './useToast'
import type { ToastApi, ToastOptions, ToastVariant } from './useToast'

export type ToastProviderProps = {
  children: ReactNode
}

type ToastMessage = {
  id: string
  message: string
  variant: ToastVariant
  duration: number
}

const icons = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info }

function ToastItem({ notification, dismissToast }: { notification: ToastMessage; dismissToast: ToastApi['dismissToast'] }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const remaining = useRef(notification.duration)
  const Icon = icons[notification.variant]

  useEffect(() => {
    if (hovered || focused || notification.duration === 0) return
    const started = Date.now()
    const timer = window.setTimeout(() => dismissToast(notification.id), remaining.current)
    return () => {
      window.clearTimeout(timer)
      remaining.current = Math.max(0, remaining.current - (Date.now() - started))
    }
  }, [dismissToast, focused, hovered, notification.duration, notification.id])

  return (
    <div
      className="remote-toast"
      data-variant={notification.variant}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
      }}
    >
      <Icon className="remote-toast__icon" size={24} aria-hidden="true" />
      <p className="remote-toast__message" role={notification.variant === 'error' ? 'alert' : 'status'} aria-atomic="true">
        {notification.message}
      </p>
      <button
        type="button"
        className="remote-toast__dismiss"
        aria-label={`Dismiss notification: ${notification.message}`}
        title="Dismiss notification"
        onClick={() => dismissToast(notification.id)}
      >
        <X size={20} aria-hidden="true" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [notifications, setNotifications] = useState<ToastMessage[]>([])
  const providerId = useId()
  const nextId = useRef(0)

  const dismissToast = useCallback((id: string) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id))
  }, [])

  const clearToasts = useCallback(() => setNotifications([]), [])

  const toast = useCallback((message: string, options: ToastOptions = {}) => {
    const id = `${providerId}-toast-${++nextId.current}`
    const variant = options.variant ?? 'info'
    const defaultDuration = variant === 'error' ? 8000 : 5000
    const duration = options.duration !== undefined && Number.isFinite(options.duration) && options.duration >= 0
      ? options.duration
      : defaultDuration
    setNotifications((current) => [...current.slice(-3), { id, message, variant, duration }])
    return id
  }, [providerId])

  return (
    <ToastContext.Provider value={{ toast, dismissToast, clearToasts }}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <section className="remote-toast-region" aria-label="Notifications">
          {notifications.map((notification) => (
            <ToastItem key={notification.id} notification={notification} dismissToast={dismissToast} />
          ))}
        </section>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}