import { Navigate, Outlet } from 'react-router-dom'
import { useAdminSession } from '@/lib/useAdminSession'
import Button from './Button'
import common from '@/styles/common.module.css'
import styles from './AdminRouteGuard.module.css'

// The single admit/reject point for the guarded route tree — both the password-login and
// Google OAuth-redirect paths converge here, since Login.tsx itself does no is_admin check.
export default function AdminRouteGuard() {
  const { session, isAdmin, loading } = useAdminSession()

  if (loading) {
    return (
      <main className={common.page}>
        <p className={common.muted}>Loading…</p>
      </main>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (isAdmin === false) {
    return (
      <main className={common.page}>
        <div className={`${common.card} ${styles.notAuthorized}`}>
          <h1>Not authorized</h1>
          <p className={common.muted}>
            This account doesn't have admin access to Storyteller Admin. You've been signed out.
          </p>
          <Button to="/login">Back to login</Button>
        </div>
      </main>
    )
  }

  return <Outlet />
}
