import { useEffect, useRef, type ReactNode } from 'react'

const BACK_KEYS = new Set(['Escape', 'Backspace', 'GoBack', 'BrowserBack'])
const DIRECTION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
const FOCUSABLE_SELECTOR = [
  '[data-remote-focus]',
  'button:not(:disabled)',
  'a[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
].join(',')

export type RemoteNavigationProviderProps = {
  children: ReactNode
  className?: string
  initialFocusSelector?: string
  onBack?: () => boolean | void
}

export function RemoteNavigationProvider({
  children,
  className,
  initialFocusSelector,
  onBack,
}: RemoteNavigationProviderProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleRemoteKey = (event: KeyboardEvent) => {
      if (BACK_KEYS.has(event.key)) {
        if (onBack?.()) event.preventDefault()
        return
      }

      if (!DIRECTION_KEYS.has(event.key)) return

      const root = rootRef.current
      if (!root) return

      const activeElement = document.activeElement
      if (activeElement instanceof HTMLElement && activeElement.matches(
        'input:not([type="button"]):not([type="submit"]):not([type="reset"]), textarea, select, [contenteditable="true"]',
      )) return

      const dialog = root.querySelector<HTMLElement>('[role="dialog"]')
      const scope = dialog ?? root
      const candidates = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-disabled') !== 'true')

      if (candidates.length === 0) return

      const currentIndex = candidates.indexOf(activeElement as HTMLElement)
      if (currentIndex < 0) {
        const preferred = dialog?.querySelector<HTMLElement>('[data-remote-initial]')
          ?? (initialFocusSelector ? root.querySelector<HTMLElement>(initialFocusSelector) : null)
          ?? candidates[0]
        preferred.focus()
        event.preventDefault()
        return
      }

      const currentBounds = candidates[currentIndex].getBoundingClientRect()
      const currentX = currentBounds.left + currentBounds.width / 2
      const currentY = currentBounds.top + currentBounds.height / 2
      let next: HTMLElement | undefined
      let nextScore = Number.POSITIVE_INFINITY

      for (const candidate of candidates) {
        if (candidate === candidates[currentIndex]) continue

        const bounds = candidate.getBoundingClientRect()
        const deltaX = bounds.left + bounds.width / 2 - currentX
        const deltaY = bounds.top + bounds.height / 2 - currentY
        const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight'
        const primary = horizontal ? deltaX : deltaY
        const secondary = horizontal ? Math.abs(deltaY) : Math.abs(deltaX)
        const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? primary > 8
          : primary < -8

        if (!forward) continue

        const score = Math.abs(primary) + secondary * 5
        if (score < nextScore) {
          nextScore = score
          next = candidate
        }
      }

      if (!next) return

      event.preventDefault()
      next.focus()
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }

    window.addEventListener('keydown', handleRemoteKey)
    return () => window.removeEventListener('keydown', handleRemoteKey)
  }, [initialFocusSelector, onBack])

  return (
    <div ref={rootRef} className={className} data-remote-navigation="">
      {children}
    </div>
  )
}
