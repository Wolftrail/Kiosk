import { schedulableApps } from './scheduler.ts'

const launchStorageKey = 'kiosk.scheduled-launch.v1'
const returnStorageKey = 'kiosk.scheduled-return.v1'
export const scheduledLaunchEvent = 'kiosk:scheduled-launch'
export const scheduledCompletionEvent = 'kiosk:scheduled-completion'
export type ScheduledLaunch = { appId: string; returnUrl: string }

export function getActiveScheduledLaunch() {
  return schedulableApps.map((app) => getScheduledLaunch(app.id)).find(Boolean)
}

export function getScheduledLaunch(appId: string): ScheduledLaunch | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(launchStorageKey) ?? 'null')
    const app = schedulableApps.find((candidate) => candidate.id === appId)
    if (!app || !location.pathname.startsWith(app.url) || value?.appId !== appId || typeof value.returnUrl !== 'string'
      || !value.returnUrl.startsWith('/') || value.returnUrl.startsWith('//')) return undefined
    if (new URL(value.returnUrl, location.origin).origin !== location.origin) return undefined
    return value
  } catch {
    return undefined
  }
}

export function launchScheduledApp(appId: string) {
  const app = schedulableApps.find((candidate) => candidate.id === appId)
  if (!app) return
  const returnUrl = `${location.pathname}${location.search}${location.hash}`
  sessionStorage.removeItem(returnStorageKey)
  sessionStorage.setItem(launchStorageKey, JSON.stringify({ appId, returnUrl }))
  window.dispatchEvent(new Event(scheduledLaunchEvent))
  location.assign(app.url)
}

export function finishScheduledApp(appId: string) {
  const launch = getScheduledLaunch(appId)
  if (!launch) return false
  window.dispatchEvent(new CustomEvent(scheduledCompletionEvent, { detail: { appId } }))
  return true
}

export function listenForScheduledCompletion() {
  const handleCompletion = (event: Event) => {
    const appId = (event as CustomEvent<{ appId?: string }>).detail?.appId
    if (!appId) return
    const launch = getScheduledLaunch(appId)
    if (!launch) return
    sessionStorage.setItem(returnStorageKey, launch.returnUrl)
    sessionStorage.removeItem(launchStorageKey)
    location.assign(launch.returnUrl)
  }
  window.addEventListener(scheduledCompletionEvent, handleCompletion)
  return () => window.removeEventListener(scheduledCompletionEvent, handleCompletion)
}

export function isScheduledReturn() {
  const returnUrl = sessionStorage.getItem(returnStorageKey)
  return returnUrl === `${location.pathname}${location.search}${location.hash}`
}

export function consumeScheduledReturn() {
  if (!isScheduledReturn()) return false
  sessionStorage.removeItem(returnStorageKey)
  return true
}

export function clearAbandonedScheduledLaunch() {
  try {
    const value = JSON.parse(sessionStorage.getItem(launchStorageKey) ?? 'null')
    if (value && !getScheduledLaunch(value.appId)) sessionStorage.removeItem(launchStorageKey)
  } catch {
    sessionStorage.removeItem(launchStorageKey)
  }
}