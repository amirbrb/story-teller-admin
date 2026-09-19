import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  listContentReviews,
  lookupStoryTitles,
  lookupProfileNames,
  type ContentReviewRow,
  type ContentReviewFilters,
} from '@/lib/adminApi'
import { formatDateTime } from '@/lib/formatters'
import DataTable, { type Column } from '@/components/DataTable'
import Badge, { type BadgeTone } from '@/components/Badge'
import Button from '@/components/Button'
import common from '@/styles/common.module.css'
import styles from './SystemErrors.module.css'

const PAGE_SIZE = 25

const STATUS_TONE: Record<ContentReviewRow['status'], BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
}

function stripHtmlForPreview(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Chapters the writer's explicit save/publish couldn't get past automatic moderation
// (moderation.categories['sexual/minors'] — see story-teller CLAUDE.md and
// _shared/chapterSave.ts), and asked a human to look at instead (request-content-review). This is
// the queue: pending items need a decision, approved/rejected ones are the paper trail of past
// ones. See ContentReviewDetail for the actual approve/reject actions.
export default function ContentReviews() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [rows, setRows] = useState<ContentReviewRow[]>([])
  const [storyTitles, setStoryTitles] = useState<Record<string, string>>({})
  const [writerNames, setWriterNames] = useState<Record<string, string>>({})
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filters: ContentReviewFilters = {
    status: searchParams.get('status') ?? 'pending',
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

    const parsedFilters = JSON.parse(filterKey) as ContentReviewFilters
    const promise = listContentReviews({ ...parsedFilters, status: parsedFilters.status || undefined }, PAGE_SIZE, page * PAGE_SIZE)
      .then(async (data) => {
        if (cancelled) return
        setRows(data.rows)
        setTotalCount(data.total)
        const storyIds = [...new Set(data.rows.map((r) => r.story_id))]
        const profileIds = [...new Set(data.rows.filter((r) => r.profile_id).map((r) => r.profile_id as string))]
        const [titles, names] = await Promise.all([lookupStoryTitles(storyIds), lookupProfileNames(profileIds)])
        if (cancelled) return
        setStoryTitles(titles)
        setWriterNames(names)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load content review requests.')
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

  const columns: Column<ContentReviewRow>[] = [
    { key: 'created_at', header: 'When', render: (r) => formatDateTime(r.created_at) },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
    { key: 'writer', header: 'Writer', render: (r) => (r.profile_id ? (writerNames[r.profile_id] ?? '—') : '—') },
    { key: 'story', header: 'Story', render: (r) => storyTitles[r.story_id] ?? '—' },
    { key: 'kind', header: 'Kind', render: (r) => r.kind },
    { key: 'categories', header: 'Flagged for', render: (r) => (r.moderation_categories.length ? r.moderation_categories.join(', ') : '—') },
    {
      key: 'content',
      header: 'Content',
      render: (r) => {
        const preview = stripHtmlForPreview(r.content)
        return preview.length > 100 ? `${preview.slice(0, 100)}…` : preview
      },
    },
  ]

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <main className={common.pageFill}>
      <h1>Content reviews</h1>
      <p className={common.muted}>
        Chapters a writer's save/publish couldn't get past automatic moderation. <strong>Pending</strong> needs a
        decision; <strong>approved</strong> was saved anyway; <strong>rejected</strong> was declined with a note the
        writer already saw.
      </p>

      <div className={styles.filters}>
        <label>
          Status
          <select value={filters.status ?? ''} onChange={(e) => updateFilter('status', e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
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
        onRowClick={(r) => navigate(`/content-reviews/${r.id}`)}
        onRefresh={() => load().promise}
        loading={loading}
        emptyMessage="No content review requests match these filters."
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
