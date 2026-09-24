import { useEffect, useState } from 'react'

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// Module-level (not component-level) so the listener is attached the instant this module loads —
// `beforeinstallprompt` fires whenever the browser decides install criteria are met, which can be
// before <InstallButton> has mounted, and the event is only usable if `preventDefault()` was called
// on it. Ported from story-teller.
let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = isStandalone()
const listeners = new Set<() => void>()

function isStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function emit() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferredPrompt = null
    emit()
  })
}

export function useInstallPromptState() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const listener = () => setTick((n) => n + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])
  return { promptEvent: deferredPrompt, installed }
}

// Consumed once (Chrome only allows a captured prompt to be shown once), so the caller clears it
// after use whether the person accepted or dismissed it.
export function clearDeferredPrompt() {
  deferredPrompt = null
  emit()
}

export function markInstalled() {
  installed = true
  emit()
}
