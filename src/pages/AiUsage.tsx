import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatNumber, formatUsd } from '@/lib/formatters'
import DataTable, { type Column } from '@/components/DataTable'
import LineChart from '@/components/LineChart'
import common from '@/styles/common.module.css'

type ByUserRow = {
  profile_id: string
  display_name: string
  call_count: number
  total_tokens: number | null
  total_cost_usd: number | null
}

type ByModelRow = {
  model: string
  call_count: number
  total_tokens: number | null
  total_cost_usd: number | null
  error_count: number
}

type DailyRow = {
  day: string
  model: string
  call_count: number
  total_tokens: number | null
  total_cost_usd: number | null
}

export default function AiUsage() {
  const [byUser, setByUser] = useState<ByUserRow[]>([])
  const [byModel, setByModel] = useState<ByModelRow[]>([])
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('ai_usage_by_user').select('*').order('total_cost_usd', { ascending: false }).limit(50),
      supabase.from('ai_usage_by_model').select('*').order('total_cost_usd', { ascending: false }),
      supabase.from('ai_usage_daily').select('*').order('day', { ascending: true }),
    ])
      .then(([userRes, modelRes, dailyRes]) => {
        if (userRes.error) throw userRes.error
        setByUser(userRes.data ?? [])
        if (modelRes.error) throw modelRes.error
        setByModel(modelRes.data ?? [])
        if (dailyRes.error) throw dailyRes.error
        setDaily(dailyRes.data ?? [])
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load AI usage.'))
      .finally(() => setLoading(false))
  }, [])

  // ai_usage_daily is grouped by (day, model) — collapse to one total-cost-per-day series for
  // the trend chart; the model breakdown lives in the by-model table below.
  const costByDay = new Map<string, number>()
  for (const row of daily) {
    costByDay.set(row.day, (costByDay.get(row.day) ?? 0) + (row.total_cost_usd ?? 0))
  }
  const costTrend = Array.from(costByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))

  const userColumns: Column<ByUserRow>[] = [
    { key: 'display_name', header: 'User', render: (r) => r.display_name },
    { key: 'call_count', header: 'Calls', render: (r) => formatNumber(r.call_count), align: 'right' },
    { key: 'total_tokens', header: 'Tokens', render: (r) => formatNumber(r.total_tokens), align: 'right' },
    { key: 'total_cost_usd', header: 'Cost', render: (r) => formatUsd(r.total_cost_usd), align: 'right' },
  ]

  const modelColumns: Column<ByModelRow>[] = [
    { key: 'model', header: 'Model', render: (r) => r.model },
    { key: 'call_count', header: 'Calls', render: (r) => formatNumber(r.call_count), align: 'right' },
    { key: 'error_count', header: 'Errors', render: (r) => formatNumber(r.error_count), align: 'right' },
    { key: 'total_tokens', header: 'Tokens', render: (r) => formatNumber(r.total_tokens), align: 'right' },
    { key: 'total_cost_usd', header: 'Cost', render: (r) => formatUsd(r.total_cost_usd), align: 'right' },
  ]

  return (
    <main className={common.page}>
      <h1>AI Usage</h1>

      {error && (
        <p role="alert" className={common.error}>
          {error}
        </p>
      )}

      <LineChart title="Daily AI cost (USD)" data={costTrend} valueFormatter={(v) => formatUsd(v)} />

      <h2>By user</h2>
      <DataTable
        columns={userColumns}
        rows={byUser}
        rowKey={(r) => r.profile_id}
        loading={loading}
        emptyMessage="No AI usage yet."
      />

      <h2>By model</h2>
      <DataTable
        columns={modelColumns}
        rows={byModel}
        rowKey={(r) => r.model}
        loading={loading}
        emptyMessage="No AI usage yet."
      />
    </main>
  )
}
