import { NavLink } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
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
]

export default function Sidebar({ onNavigate }: Props) {
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
        <Button variant="ghost" size="sm" fullWidth onClick={() => supabase.auth.signOut()}>
          Sign out
        </Button>
      </div>
    </nav>
  )
}
