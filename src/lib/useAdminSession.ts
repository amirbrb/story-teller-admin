import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'

type AdminSession = {
  session: Session | null
  isAdmin: boolean | null
  loading: boolean
}

// Mirrors story-teller's useSession() shape, plus resolving admin status once a session exists.
// This client-side check is a UX nicety (fast redirect + clear messaging), not the security
// boundary — that's the RLS policies and admin_* RPCs, which enforce is_admin independently of
// whatever this hook does. A non-admin who authenticates is signed out immediately.
export function useAdminSession(): AdminSession {
  const [session, setSession] = useState<Session | null>(null)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        setIsAdmin(null)
        setLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    setLoading(true)

    supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        const admin = !error && !!data?.is_admin
        setIsAdmin(admin)
        setLoading(false)
        if (!admin) {
          supabase.auth.signOut()
        }
      })

    return () => {
      cancelled = true
    }
  }, [session])

  return { session, isAdmin, loading }
}
