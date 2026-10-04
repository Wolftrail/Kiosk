import { createContext, useContext } from 'react'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info'

export type ToastOptions = {
  variant?: ToastVariant
  duration?: number
}

export type ToastApi = {
  toast: (message: string, options?: ToastOptions) => string
  dismissToast: (id: string) => void
  clearToasts: () => void
}

export const ToastContext = createContext<ToastApi | null>(null)

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within a ToastProvider')
  return context
}