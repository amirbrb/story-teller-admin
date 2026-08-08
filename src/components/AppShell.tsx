import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import styles from './AppShell.module.css'

// Left sidebar + content region. Desktop-first (internal tool), but the sidebar collapses to a
// hamburger-triggered drawer below a breakpoint instead of breaking outright on a phone.
export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className={styles.shell}>
      <button
        type="button"
        className={styles.hamburger}
        aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>

      <aside className={`${styles.sidebarDesktop}`}>
        <Sidebar />
      </aside>

      {drawerOpen && (
        <div className={styles.drawerBackdrop} onClick={() => setDrawerOpen(false)}>
          <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
