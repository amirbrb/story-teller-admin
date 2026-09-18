import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { listFeedback, type FeedbackRow, type FeedbackFilters } from '@/lib/adminApi'
import { formatDateTime } from '@/lib/formatters'
import DataTable, { type Column } from '@/components/DataTable'
import Badge, { type BadgeTone } from '@/components/Badge'
import Button from '@/components/Button'
import common from '@/styles/common.module.css'
import styles from './SystemErrors.module.css'

const PAGE_SIZE = 25

const STATUS_TONE: Record<FeedbackRow['status'], BadgeTone> = {
  new: 'warning',
  filed: 'success',
  dismissed: 'neutral',
}

// In-app "Send feedback" reports (see story-teller/src/components/FeedbackDrawer.tsx). The app
// only stores these; this page is where an admin actually triages them — deciding what's a real
// issue, dismissing what isn't, or marking one filed by hand. The file-feedback skill drains `new`
// items into Trello on its own schedule, so most of what's here day to day is either brand new or
// already handled.
export default function Issues() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [rows, setRows] = useState<FeedbackRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filters: FeedbackFilters = {
    status: searchParams.get('status') ?? undefined,
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

    const promise = listFeedback(JSON.parse(filterKey) as FeedbackFilters, PAGE_SIZE, page * PAGE_SIZE)
      .then((data) => {
        if (cancelled) return
        setRows(data.rows)
        setTotalCount(data.total)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load feedback.')
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

  const columns: Column<FeedbackRow>[] = [
    { key: 'number', header: '#', render: (r) => r.number },
    { key: 'created_at', header: 'When', render: (r) => formatDateTime(r.created_at) },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
    { key: 'reporter', header: 'Reporter', render: (r) => r.reporter_name ?? '—' },
    {
      key: 'message',
      header: 'Message',
      render: (r) => (r.message.length > 100 ? `${r.message.slice(0, 100)}…` : r.message),
    },
    { key: 'page', header: 'Page', render: (r) => r.page ?? '—' },
    { key: 'attachments', header: 'Files', render: (r) => (r.attachments.length ? r.attachments.length : '—'), align: 'right' },
  ]

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <main className={common.pageFill}>
      <h1>Issues</h1>
      <p className={common.muted}>
        In-app feedback from the "Send feedback" drawer. <strong>New</strong> is untriaged;{' '}
        <strong>filed</strong> has a Trello card; <strong>dismissed</strong> was reviewed and isn't actionable.
      </p>

      <div className={styles.filters}>
        <label>
          Status
          <select value={filters.status ?? ''} onChange={(e) => updateFilter('status', e.target.value)}>
            <option value="">All</option>
            <option value="new">New</option>
            <option value="filed">Filed</option>
            <option value="dismissed">Dismissed</option>
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
        onRowClick={(r) => navigate(`/issues/${r.id}`)}
        onRefresh={() => load().promise}
        loading={loading}
        emptyMessage="No feedback matches these filters."
        fill
      />

      <div className={styles.pagination}>
        <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Previous
        </Button>
        <span className={common.muted}>
          Page {page + 1} of {totalPages} ({totalCount.toLocaleString()} items)
        </span>
        <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </main>
  )
}
