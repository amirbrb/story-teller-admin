import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  listSystemErrors,
  SYSTEM_ERROR_FUNCTION_NAMES,
  type SystemErrorRow,
  type SystemErrorFilters,
} from '@/lib/adminApi'
import { formatDateTime, formatNumber } from '@/lib/formatters'
import DataTable, { type Column } from '@/components/DataTable'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import common from '@/styles/common.module.css'
import styles from './SystemErrors.module.css'

const PAGE_SIZE = 25

// Failures outside the AI calls: rejected input, failed lookups, unavailable moderation, and bugs
// that escaped a handler. Only errors are recorded here, so an empty page is the healthy state.
export default function SystemErrors() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [rows, setRows] = useState<SystemErrorRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filters: SystemErrorFilters = {
    functionName: searchParams.get('function') ?? undefined,
    kind: searchParams.get('kind') ?? undefined,
    statusCode: searchParams.get('status') ?? undefined,
    profileId: searchParams.get('profile') ?? undefined,
    dateFrom: searchParams.get('from') ?? undefined,
    dateTo: searchParams.get('to') ?? undefined,
  }

  const filterKey = JSON.stringify(filters)

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
    setPage(0)
  }

  function load() {
    let cancelled = false
    setLoading(true)
    setError(null)

    const promise = listSystemErrors(JSON.parse(filterKey) as SystemErrorFilters, PAGE_SIZE, page * PAGE_SIZE)
      .then((data) => {
        if (cancelled) return
        setRows(data.rows)
        setTotalCount(data.total)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load system errors.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return {
      cancel: () => {
        cancelled = true
      },
      promise,
    }
  }

  useEffect(() => {
    const handle = load()
    return handle.cancel
  }, [filterKey, page])

  const columns: Column<SystemErrorRow>[] = [
    { key: 'created_at', header: 'When', render: (r) => formatDateTime(r.created_at) },
    { key: 'function_name', header: 'Function', render: (r) => r.function_name },
    {
      key: 'kind',
      header: 'Kind',
      // An uncaught exception is a bug by definition, so it gets the louder tone — a handled error
      // is usually the app correctly refusing something.
      render: (r) =>
        r.kind === 'uncaught' ? <Badge tone="error">uncaught</Badge> : <Badge tone="warning">handled</Badge>,
    },
    {
      key: 'status_code',
      header: 'Status',
      render: (r) => <Badge tone={r.status_code >= 500 ? 'error' : 'neutral'}>{r.status_code}</Badge>,
    },
    { key: 'error_code', header: 'Code', render: (r) => r.error_code ?? '—' },
    { key: 'user', header: 'User', render: (r) => r.profiles?.display_name ?? '—' },
    { key: 'latency_ms', header: 'Latency', render: (r) => `${formatNumber(r.latency_ms)} ms`, align: 'right' },
  ]

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <main className={common.pageFill}>
      <h1>System Errors</h1>
      <p className={common.muted}>
        Non-AI failures from the edge functions. <strong>Handled</strong> means the function refused the
        request on purpose; <strong>uncaught</strong> means something threw that nothing was expecting.
      </p>

      <div className={styles.filters}>
        <label>
          Function
          <select value={filters.functionName ?? ''} onChange={(e) => updateFilter('function', e.target.value)}>
            <option value="">All</option>
            {SYSTEM_ERROR_FUNCTION_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kind
          <select value={filters.kind ?? ''} onChange={(e) => updateFilter('kind', e.target.value)}>
            <option value="">All</option>
            <option value="uncaught">Uncaught only</option>
            <option value="handled">Handled only</option>
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
        onRowClick={(r) => navigate(`/system-errors/${r.id}`)}
        onRefresh={() => load().promise}
        loading={loading}
        emptyMessage="No system errors match these filters."
        fill
      />

      <div className={styles.pagination}>
        <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Previous
        </Button>
        <span className={common.muted}>
          Page {page + 1} of {totalPages} ({totalCount.toLocaleString()} errors)
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
