import assert from 'node:assert/strict'
import test from 'node:test'
import { clearAbandonedScheduledLaunch, consumeScheduledReturn, finishScheduledApp, getActiveScheduledLaunch, getScheduledLaunch, isScheduledReturn, launchScheduledApp, listenForScheduledCompletion, scheduledLaunchEvent } from '../src/scheduledLaunch.ts'

test('scheduled launch records origin, returns once, and clears abandoned context', () => {
  const original = ['sessionStorage', 'location', 'window'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const)
  const saved = new Map<string, string>()
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value), removeItem: (key: string) => saved.delete(key) }
  const navigation: string[] = []
  const location = { origin: 'http://kiosk.test', pathname: '/apps/jukebox/', search: '?view=music', hash: '', assign: (url: string) => navigation.push(url) }
  const window = new EventTarget()
  let interrupted = false
  window.addEventListener(scheduledLaunchEvent, () => { interrupted = true })
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true })
  Object.defineProperty(globalThis, 'location', { value: location, configurable: true })
  Object.defineProperty(globalThis, 'window', { value: window, configurable: true })
  try {
    launchScheduledApp('workout')
    assert.equal(interrupted, true)
    assert.deepEqual(navigation, ['/apps/workout/'])
    location.pathname = '/apps/workout/'
    location.search = ''
    assert.deepEqual(getScheduledLaunch('workout'), { appId: 'workout', returnUrl: '/apps/jukebox/?view=music' })
    assert.equal(finishScheduledApp('workout'), true)
    assert.deepEqual(navigation, ['/apps/workout/'])
    assert.ok(getActiveScheduledLaunch())
    const stopListening = listenForScheduledCompletion()
    assert.equal(finishScheduledApp('workout'), true)
    stopListening()
    assert.equal(finishScheduledApp('workout'), false)
    assert.equal(navigation.at(-1), '/apps/jukebox/?view=music')
    location.pathname = '/apps/jukebox/'
    location.search = '?view=music'
    assert.equal(isScheduledReturn(), true)
    assert.equal(consumeScheduledReturn(), true)
    assert.equal(consumeScheduledReturn(), false)
    launchScheduledApp('workout')
    clearAbandonedScheduledLaunch()
    location.pathname = '/apps/workout/'
    assert.equal(getScheduledLaunch('workout'), undefined)
    for (const appId of ['scripture', 'recite', 'jukebox']) {
      location.pathname = '/'
      launchScheduledApp(appId)
      location.pathname = `/apps/${appId}/`
      assert.equal(getActiveScheduledLaunch()?.appId, appId)
      const stop = listenForScheduledCompletion()
      assert.equal(finishScheduledApp('workout'), false)
      assert.equal(finishScheduledApp(appId), true)
      assert.equal(getActiveScheduledLaunch(), undefined)
      stop()
    }
    location.pathname = '/apps/workout/'
    for (const returnUrl of ['//evil.test', '/\\evil.test', 'https://evil.test']) {
      storage.setItem('kiosk.scheduled-launch.v1', JSON.stringify({ appId: 'workout', returnUrl }))
      assert.equal(getScheduledLaunch('workout'), undefined)
    }
  } finally {
    for (const [name, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})