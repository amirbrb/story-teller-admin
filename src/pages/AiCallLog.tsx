import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  listAiCallLog,
  AI_LOG_FUNCTION_NAMES,
  type AiCallLogRow,
  type AiCallLogFilters,
} from '@/lib/adminApi'
import { formatDateTime, formatNumber, formatUsd } from '@/lib/formatters'
import DataTable, { type Column } from '@/components/DataTable'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import common from '@/styles/common.module.css'
import styles from './AiCallLog.module.css'

const PAGE_SIZE = 25

// Every AI call the app makes, one row per attempt. The filters exist because the question is
// almost never "what happened" but "what happened to this model / this writer / today" — and
// defaulting Status to errors would hide the successes needed to tell a broken model from a quiet
// one, so it starts unfiltered.
export default function AiCallLog() {
  const navigate = useNavigate()
  // Filters live in the URL so a filtered view can be linked to — the natural thing to paste into a
  // bug report, and what makes "all calls for this user" work as a link from UserDetail.
  const [searchParams, setSearchParams] = useSearchParams()

  const [rows, setRows] = useState<AiCallLogRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filters: AiCallLogFilters = {
    functionName: searchParams.get('function') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    profileId: searchParams.get('profile') ?? undefined,
    dateFrom: searchParams.get('from') ?? undefined,
    dateTo: searchParams.get('to') ?? undefined,
  }

  // Serialized so the effect below depends on the filters' contents rather than the object identity
  // a new render creates each time.
  const filterKey = JSON.stringify(filters)

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
    setPage(0)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    listAiCallLog(JSON.parse(filterKey) as AiCallLogFilters, PAGE_SIZE, page * PAGE_SIZE)
      .then((data) => {
        if (cancelled) return
        setRows(data.rows)
        setTotalCount(data.total)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load the AI call log.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [filterKey, page])

  const columns: Column<AiCallLogRow>[] = [
    { key: 'created_at', header: 'When', render: (r) => formatDateTime(r.created_at) },
    { key: 'function_name', header: 'Function', render: (r) => r.function_name },
    { key: 'model', header: 'Model', render: (r) => <span className={styles.model}>{r.model}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (r) =>
        r.status === 'success' ? <Badge tone="success">ok</Badge> : <Badge tone="error">error</Badge>,
    },
    { key: 'user', header: 'User', render: (r) => r.profiles?.display_name ?? '—' },
    { key: 'total_tokens', header: 'Tokens', render: (r) => formatNumber(r.total_tokens), align: 'right' },
    { key: 'cost_usd', header: 'Cost', render: (r) => formatUsd(r.cost_usd), align: 'right' },
    { key: 'latency_ms', header: 'Latency', render: (r) => `${formatNumber(r.latency_ms)} ms`, align: 'right' },
  ]

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <main className={common.page}>
      <h1>AI Call Log</h1>
      <p className={common.muted}>
        Every OpenRouter call, success or failure. Open a row to see the prompt and the model's reply —
        both are kept on failed calls only.
      </p>

      <div className={styles.filters}>
        <label>
          Function
          <select value={filters.functionName ?? ''} onChange={(e) => updateFilter('function', e.target.value)}>
            <option value="">All</option>
            {AI_LOG_FUNCTION_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status ?? ''} onChange={(e) => updateFilter('status', e.target.value)}>
            <option value="">All</option>
            <option value="error">Errors only</option>
            <option value="success">Successes only</option>
          </select>
        </label>
        <label>
          From
          <input type="date" value={filters.dateFrom ?? ''} onChange={(e) => updateFilter('from', e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={filters.dateTo ?? ''} onChange={(e) => updateFilter('to', e.target.value)} />
        </label>
      </div>

      {error && (
        <p role="alert" className={common.error}>
          {error}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/ai-call-log/${r.id}`)}
        loading={loading}
        emptyMessage="No AI calls match these filters."
      />

      <div className={styles.pagination}>
        <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Previous
        </Button>
        <span className={common.muted}>
          Page {page + 1} of {totalPages} ({totalCount.toLocaleString()} calls)
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </main>
  )
}
