import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatUsd } from '@/lib/formatters'
import StatTile from '@/components/StatTile'
import LineChart from '@/components/LineChart'
import common from '@/styles/common.module.css'
import styles from './Dashboard.module.css'

type DailyPoint = { date: string; value: number }

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export default function Dashboard() {
  const [totalUsers, setTotalUsers] = useState<number | null>(null)
  const [premiumUsers, setPremiumUsers] = useState<number | null>(null)
  const [monthCostUsd, setMonthCostUsd] = useState<number | null>(null)
  const [newUsersTrend, setNewUsersTrend] = useState<DailyPoint[]>([])
  const [loginsTrend, setLoginsTrend] = useState<DailyPoint[]>([])
  const [aiCostTrend, setAiCostTrend] = useState<DailyPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const since = daysAgoIso(30)
    const monthStart = new Date()
    monthStart.setDate(1)
    const monthStartIso = monthStart.toISOString().slice(0, 10)

    Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_premium', true),
      supabase.from('new_users_daily').select('day, new_users').gte('day', since).order('day', { ascending: true }),
      supabase.from('logins_daily').select('day, logins').gte('day', since).order('day', { ascending: true }),
      supabase.from('ai_usage_daily').select('day, total_cost_usd').gte('day', since).order('day', { ascending: true }),
      supabase.from('ai_usage_daily').select('total_cost_usd').gte('day', monthStartIso),
    ])
      .then(([usersRes, premiumRes, newUsersRes, loginsRes, aiDailyRes, aiMonthRes]) => {
        if (usersRes.error) throw usersRes.error
        setTotalUsers(usersRes.count ?? 0)
        if (premiumRes.error) throw premiumRes.error
        setPremiumUsers(premiumRes.count ?? 0)

        if (newUsersRes.error) throw newUsersRes.error
        setNewUsersTrend((newUsersRes.data ?? []).map((r) => ({ date: r.day, value: r.new_users })))

        if (loginsRes.error) throw loginsRes.error
        setLoginsTrend((loginsRes.data ?? []).map((r) => ({ date: r.day, value: r.logins })))

        if (aiDailyRes.error) throw aiDailyRes.error
        const byDay = new Map<string, number>()
        for (const row of aiDailyRes.data ?? []) {
          byDay.set(row.day, (byDay.get(row.day) ?? 0) + (row.total_cost_usd ?? 0))
        }
        setAiCostTrend(
          Array.from(byDay.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, value]) => ({ date, value })),
        )

        if (aiMonthRes.error) throw aiMonthRes.error
        const monthTotal = (aiMonthRes.data ?? []).reduce((sum, r) => sum + (r.total_cost_usd ?? 0), 0)
        setMonthCostUsd(monthTotal)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard.'))
  }, [])

  return (
    <main className={common.page}>
      <h1>Dashboard</h1>

      {error && (
        <p role="alert" className={common.error}>
          {error}
        </p>
      )}

      <div className={styles.tiles}>
        <StatTile label="Total users" value={totalUsers === null ? '…' : totalUsers.toLocaleString()} />
        <StatTile label="Premium users" value={premiumUsers === null ? '…' : premiumUsers.toLocaleString()} />
        <StatTile label="AI cost this month" value={monthCostUsd === null ? '…' : formatUsd(monthCostUsd)} />
      </div>

      <div className={styles.charts}>
        <LineChart title="New users (last 30 days)" data={newUsersTrend} />
        <LineChart title="Logins (last 30 days)" data={loginsTrend} />
        <LineChart title="AI cost (last 30 days)" data={aiCostTrend} valueFormatter={(v) => formatUsd(v)} />
      </div>
    </main>
  )
}
