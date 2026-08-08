import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import PasswordInput from '@/components/PasswordInput'
import Button from '@/components/Button'
import common from '@/styles/common.module.css'
import styles from './Login.module.css'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  )
}

// Single-mode login (no signup, no forgot-password — this is an internal tool; an operator resets
// via the Supabase dashboard). AdminRouteGuard decides admit/reject after either path succeeds.
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const navigate = useNavigate()

  async function handleGoogleSignIn() {
    setError(null)
    setGoogleBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) {
      setError(error.message)
      setGoogleBusy(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className={common.page}>
      <div className={`${common.card} ${styles.card}`}>
        <h1 className={styles.heading}>Storyteller Admin</h1>
        <p className={common.muted}>Sign in with an admin account.</p>

        <div className={styles.oauthRow}>
          <Button type="button" variant="secondary" fullWidth disabled={googleBusy} onClick={handleGoogleSignIn}>
            <GoogleIcon />
            Continue with Google
          </Button>
        </div>
        <div className={styles.divider}>
          <span>or</span>
        </div>

        <form onSubmit={handleSubmit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <PasswordInput value={password} onChange={setPassword} required autoComplete="current-password" />
          </label>
          <Button type="submit" disabled={busy} fullWidth>
            Sign in
          </Button>
        </form>

        {error && (
          <p role="alert" className={common.error}>
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
