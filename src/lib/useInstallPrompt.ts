import { useEffect, useState } from 'react'

// Chromium-only event; not in lib.dom's types.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Captures the browser's deferred install prompt so the app can offer its own "Install app"
// button. `install` is null whenever installing isn't on offer (already installed, iOS Safari,
// or the browser hasn't decided the app is installable yet).
export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = deferred
    ? () => {
        deferred.prompt()
        // A prompt can only be used once, whatever the user chose.
        deferred.userChoice.finally(() => setDeferred(null))
      }
    : null

  return { install }
}
