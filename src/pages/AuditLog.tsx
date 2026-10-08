import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AUDIT_EVENT_LABELS,
  AUDIT_EVENT_TYPES,
  listAuditEvents,
  type AuditEventFilters,
  type AuditEventRow,
  type AuditEventType,
} from '@/lib/adminApi'
import { formatDateTime } from '@/lib/formatters'
import DataTable, { type Column } from '@/components/DataTable'
import Badge, { type BadgeTone } from '@/components/Badge'
import Button from '@/components/Button'
import common from '@/styles/common.module.css'
import styles from './AuditLog.module.css'

const PAGE_SIZE = 50

const SOURCE_LABELS: Record<AuditEventRow['source'], string> = {
  app: 'App',
  mcp: 'MCP',
  system: 'System',
}

function isEventType(value: string | null): value is AuditEventType {
  return AUDIT_EVENT_TYPES.includes(value as AuditEventType)
}

const EVENT_TONES: Record<AuditEventRow['event_type'], BadgeTone> = {
  user_created: 'success',
  chapter_read: 'neutral',
  chapter_created: 'info',
  chapter_updated: 'info',
  chapter_deleted: 'error',
}

// Who did what to which chapter, and from where: reads, creates, edits and deletes of chapters,
// plus each account's signup. Repeats by the same person on the same chapter within half an hour
// (autosave ticks, re-opening a chapter) fold into one row with a count.
export default function AuditLog() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '')

  const [rows, setRows] = useState<AuditEventRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const eventParam = searchParams.get('event')
  const queryParam = searchParams.get('q') ?? ''
  const filters: AuditEventFilters = {
    // An unknown ?event= would silently match nothing while the dropdown shows "All".
    eventType: isEventType(eventParam) ? eventParam : undefined,
    search: searchParams.get('q') ?? undefined,
    userId: searchParams.get('user') ?? undefined,
  }
  const filterKey = JSON.stringify(filters)

  // Updater form, so a debounced search landing after another filter change builds on the latest
  // URL rather than the one from when the user typed.
  function updateFilter(key: string, value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  // Any filter change (including the sidebar link clearing them all) starts from page 1.
  useEffect(() => {
    setPage(0)
  }, [filterKey])

  useEffect(() => {
    const handle = setTimeout(() => {
      const value = searchInput.trim()
      if (value !== queryParam) updateFilter('q', value)
    }, 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  // Keep the box in step when the URL changes from outside it (sidebar link, back button).
  useEffect(() => {
    setSearchInput((current) => (current.trim() === queryParam ? current : queryParam))
  }, [queryParam])

  function load() {
    let cancelled = false
    setLoading(true)
    setError(null)

    const promise = listAuditEvents(JSON.parse(filterKey) as AuditEventFilters, PAGE_SIZE, page * PAGE_SIZE)
      .then((data) => {
        if (cancelled) return
        setRows(data.rows)
        setTotalCount(data.total)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load the audit log.')
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

  const columns: Column<AuditEventRow>[] = [
    {
      key: 'when',
      header: 'When',
      render: (r) =>
        r.occurrences > 1 ? (
          <div className={styles.stack}>
            <span>{formatDateTime(r.last_occurred_at)}</span>
            <span className={styles.sub}>since {formatDateTime(r.created_at)}</span>
          </div>
        ) : (
          formatDateTime(r.created_at)
        ),
    },
    {
      key: 'event',
      header: 'Event',
      render: (r) => <Badge tone={EVENT_TONES[r.event_type]}>{AUDIT_EVENT_LABELS[r.event_type]}</Badge>,
    },
    {
      key: 'count',
      header: 'Times',
      align: 'right',
      render: (r) => r.occurrences.toLocaleString(),
    },
    {
      key: 'user',
      header: 'User',
      render: (r) =>
        r.user_id ? (
          <div className={styles.stack}>
            <span>{r.user_email ?? '—'}</span>
            <span className={styles.sub}>{r.user_id}</span>
          </div>
        ) : (
          <span className={common.muted}>Signed out</span>
        ),
    },
    { key: 'ip', header: 'IP', render: (r) => <span className={styles.mono}>{r.ip ?? '—'}</span> },
    { key: 'story', header: 'Story', render: (r) => <span dir="auto">{r.story_title ?? '—'}</span> },
    {
      key: 'chapter',
      header: 'Chapter',
      render: (r) => {
        if (!r.chapter_id) return '—'
        const label = r.chapter_title || (r.chapter_number !== null ? `Chapter ${r.chapter_number}` : 'Untitled')
        return <span dir="auto">{label}</span>
      },
    },
    { key: 'source', header: 'Via', render: (r) => SOURCE_LABELS[r.source] },
  ]

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <main className={common.pageFill}>
      <h1>Audit Log</h1>
      <p className={common.muted}>
        Signups and chapter reads, creates, edits and deletes, with the user, IP, story and chapter at the
        time. Repeats by the same person on the same chapter within 30 minutes are folded into one row.
      </p>

      <div className={styles.filters}>
        <label>
          Event
          <select value={filters.eventType ?? ''} onChange={(e) => updateFilter('event', e.target.value)}>
            <option value="">All</option>
            {AUDIT_EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {AUDIT_EVENT_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            type="search"
            placeholder="Email, user id, IP, story or chapter…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>
      </div>

      {filters.userId && (
        <p className={common.muted}>
          Showing one user only.{' '}
          <Button variant="ghost" size="sm" onClick={() => updateFilter('user', '')}>
            Show everyone
          </Button>
        </p>
      )}

      {error && (
        <p role="alert" className={common.error}>
          {error}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => r.user_id && navigate(`/users/${r.user_id}`)}
        onRefresh={() => load().promise}
        loading={loading}
        emptyMessage="No audit events match these filters."
        fill
      />

      <div className={styles.pagination}>
        <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
          Previous
        </Button>
        <span className={common.muted}>
          Page {page + 1} of {totalPages} ({totalCount.toLocaleString()} events)
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
