import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getSystemErrorEntry, type SystemErrorDetailRow } from '@/lib/adminApi'
import { formatDateTime, formatNumber } from '@/lib/formatters'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import CodeBlock from '@/components/CodeBlock'
import common from '@/styles/common.module.css'
import styles from './AiCallLogDetail.module.css'

// Deliberately reuses AiCallLogDetail.module.css. The two detail pages are the same layout — a
// heading, an error panel, a facts grid, then text blocks — and a second copy of that CSS would be
// two files to keep in step for no visual difference.
export default function SystemErrorDetail() {
  const { id } = useParams<{ id: string }>()
  const [entry, setEntry] = useState<SystemErrorDetailRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    getSystemErrorEntry(id)
      .then((data) => {
        if (cancelled) return
        setEntry(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load this error.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <main className={common.page}>
        <p className={common.muted}>Loading…</p>
      </main>
    )
  }

  if (error || !entry) {
    return (
      <main className={common.page}>
        <p role="alert" className={common.error}>
          {error ?? 'That error was not found.'}
        </p>
        <Button variant="secondary" to="/system-errors">
          Back to system errors
        </Button>
      </main>
    )
  }

  return (
    <main className={common.page}>
      <div className={styles.heading}>
        <div>
          <h1>{entry.function_name}</h1>
          <p className={common.muted}>{formatDateTime(entry.created_at)}</p>
        </div>
        {entry.kind === 'uncaught' ? <Badge tone="error">uncaught</Badge> : <Badge tone="warning">handled</Badge>}
      </div>

      <Button variant="secondary" size="sm" to="/system-errors">
        Back to system errors
      </Button>

      {entry.error_message && (
        <div className={styles.errorPanel} role="alert">
          <h2 className={styles.errorTitle}>{entry.error_code ?? 'Error'}</h2>
          {/* Preserves newlines: for an uncaught exception this field holds the stack trace, which
              is unreadable collapsed onto one line. */}
          <p className={`${styles.errorText} ${styles.preserveLines}`}>{entry.error_message}</p>
        </div>
      )}

      <section className={`${common.card} ${styles.factsCard}`}>
        <dl className={styles.facts}>
          <div>
            <dt>Kind</dt>
            <dd>{entry.kind}</dd>
          </div>
          <div>
            <dt>Status code</dt>
            <dd>{entry.status_code}</dd>
          </div>
          <div>
            <dt>Error code</dt>
            <dd className={styles.mono}>{entry.error_code ?? '—'}</dd>
          </div>
          <div>
            <dt>Method</dt>
            <dd>{entry.request_method}</dd>
          </div>
          <div>
            <dt>User</dt>
            <dd>{entry.profiles?.display_name ?? '—'}</dd>
          </div>
          <div>
            <dt>Profile id</dt>
            <dd className={styles.mono}>{entry.profile_id ?? '—'}</dd>
          </div>
          <div>
            <dt>Latency</dt>
            <dd>{formatNumber(entry.latency_ms)} ms</dd>
          </div>
        </dl>
      </section>

      <CodeBlock
        label="Request body"
        value={entry.request_body}
        emptyMessage="No request body was recorded — the request had none, or it could not be read."
      />
    </main>
  )
}
