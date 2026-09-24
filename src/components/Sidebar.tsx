import { NavLink } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useInstallPrompt } from '@/lib/useInstallPrompt'
import Button from './Button'
import styles from './Sidebar.module.css'

type Props = {
  onNavigate?: () => void
}

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/users', label: 'Users', end: false },
  { to: '/ai-usage', label: 'AI Usage', end: false },
  { to: '/ai-models', label: 'AI Models', end: false },
  { to: '/billing', label: 'Billing', end: false },
  { to: '/feature-flags', label: 'Feature Flags', end: false },
  { to: '/challenges', label: 'Challenges', end: false },
  { to: '/ai-call-log', label: 'AI Call Log', end: false },
  { to: '/system-errors', label: 'System Errors', end: false },
  { to: '/issues', label: 'Issues', end: false },
  { to: '/content-reviews', label: 'Content reviews', end: false },
]

export default function Sidebar({ onNavigate }: Props) {
  const { install } = useInstallPrompt()

  return (
    <nav className={styles.sidebar}>
      <div className={styles.brand}>Storyteller Admin</div>
      <ul className={styles.links}>
        {links.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.end}
              onClick={onNavigate}
              className={({ isActive }) => `${styles.link} ${isActive ? styles.linkActive : ''}`}
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className={styles.footer}>
        {install && (
          <Button variant="secondary" size="sm" fullWidth onClick={install}>
            Install app
          </Button>
        )}
        <Button variant="ghost" size="sm" fullWidth onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </div>
    </nav>
  )
}
