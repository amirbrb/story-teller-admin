import { useState } from 'react'
import { clearDeferredPrompt, markInstalled, useInstallPromptState } from '@/lib/installPrompt'
import Button from './Button'
import styles from './InstallButton.module.css'

function isIos() {
  return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
}

// Session-only (not localStorage): dismissing the FAB gets it out of the way for the rest of this
// visit without permanently opting the device out of seeing it again.
const DISMISS_KEY = 'nibb-admin-install-dismissed'

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // Private mode, disabled storage — the button just can't be dismissed for the session.
    return false
  }
}

function writeDismissed() {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Won't stick, but the state update below still hides it for the rest of this page's life.
  }
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  )
}

// Floating install affordance, same as story-teller's InstallButton; rendered once in App.tsx so
// it's available from every screen, login included. Chromium browsers get a real one-tap install
// via the captured `beforeinstallprompt` event; iOS Safari has no such API, so it opens
// instructions for the manual Share -> Add to Home Screen flow instead. Everywhere else (desktop
// Safari, Firefox) and on already-installed devices it doesn't render. The small "x" hides it for
// the rest of this browser session.
export default function InstallButton() {
  const { promptEvent, installed } = useInstallPromptState()
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [dismissed, setDismissed] = useState(readDismissed)
  const ios = isIos()

  if (installed || dismissed || (!promptEvent && !ios)) return null

  async function handleClick() {
    if (promptEvent) {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      clearDeferredPrompt()
      if (choice.outcome === 'accepted') markInstalled()
      return
    }
    setShowIosHelp(true)
  }

  return (
    <>
      <div className={styles.wrapper}>
        <Button
          type="button"
          variant="primary"
          className={styles.fab}
          onClick={() => void handleClick()}
          aria-label="Install app"
        >
          <DownloadIcon />
        </Button>
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => {
            writeDismissed()
            setDismissed(true)
          }}
          aria-label="Hide for now"
        >
          <CloseIcon />
        </button>
      </div>
      {showIosHelp && (
        <div className={styles.backdrop} onMouseDown={() => setShowIosHelp(false)}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-ios-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id="install-ios-title" className={styles.title}>
              Install Nibb Admin on your phone
            </h2>
            <p className={styles.description}>
              Tap the Share icon in Safari&apos;s toolbar, then choose &ldquo;Add to Home Screen&rdquo;.
            </p>
            <div className={styles.actions}>
              <Button type="button" variant="primary" onClick={() => setShowIosHelp(false)}>
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
