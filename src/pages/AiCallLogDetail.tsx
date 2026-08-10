import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getAiCallLogEntry, type AiCallLogDetailRow } from '@/lib/adminApi'
import { formatDateTime, formatNumber, formatUsd } from '@/lib/formatters'
import Badge from '@/components/Badge'
import Button from '@/components/Button'
import CodeBlock from '@/components/CodeBlock'
import common from '@/styles/common.module.css'
import styles from './AiCallLogDetail.module.css'

// One AI call, in full. A route rather than a modal so it can be linked to from a bug report — the
// main reason anyone opens this page is to show someone else what a model actually returned.
export default function AiCallLogDetail() {
  const { id } = useParams<{ id: string }>()
  const [entry, setEntry] = useState<AiCallLogDetailRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    getAiCallLogEntry(id)
      .then((data) => {
        if (cancelled) return
        setEntry(data)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load this call.')
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
          {error ?? 'That call was not found.'}
        </p>
        <Button variant="secondary" to="/ai-call-log">
          Back to the AI call log
        </Button>
      </main>
    )
  }

  const failed = entry.status === 'error'

  return (
    <main className={common.page}>
      <div className={styles.heading}>
        <div>
          <h1>{entry.function_name}</h1>
          <p className={common.muted}>{formatDateTime(entry.created_at)}</p>
        </div>
        {failed ? <Badge tone="error">error</Badge> : <Badge tone="success">ok</Badge>}
      </div>

      <Button variant="secondary" size="sm" to="/ai-call-log">
        Back to the AI call log
      </Button>

      {entry.error_message && (
        <div className={styles.errorPanel} role="alert">
          <h2 className={styles.errorTitle}>Error</h2>
          <p className={styles.errorText}>{entry.error_message}</p>
        </div>
      )}

      <section className={`${common.card} ${styles.factsCard}`}>
        <dl className={styles.facts}>
          <div>
            <dt>Model</dt>
            <dd className={styles.mono}>{entry.model}</dd>
          </div>
          <div>
            <dt>Attempt</dt>
            <dd>{entry.attempt}</dd>
          </div>
          <div>
            <dt>User</dt>
            <dd>{entry.profiles?.display_name ?? '—'}</dd>
          </div>
          <div>
            <dt>Latency</dt>
            <dd>{formatNumber(entry.latency_ms)} ms</dd>
          </div>
          <div>
            <dt>Prompt tokens</dt>
            <dd>{formatNumber(entry.prompt_tokens)}</dd>
          </div>
          <div>
            <dt>Completion tokens</dt>
            <dd>{formatNumber(entry.completion_tokens)}</dd>
          </div>
          <div>
            <dt>Total tokens</dt>
            <dd>{formatNumber(entry.total_tokens)}</dd>
          </div>
          <div>
            <dt>Cost</dt>
            <dd>{formatUsd(entry.cost_usd)}</dd>
          </div>
          <div>
            <dt>Charged to writer</dt>
            <dd>{formatNumber(entry.token_cost)} tokens</dd>
          </div>
          <div>
            <dt>Story</dt>
            <dd className={styles.mono}>{entry.story_id ?? '—'}</dd>
          </div>
          <div>
            <dt>Chapter</dt>
            <dd className={styles.mono}>{entry.chapter_id ?? '—'}</dd>
          </div>
          <div>
            <dt>OpenRouter id</dt>
            <dd className={styles.mono}>{entry.generation_id ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <CodeBlock
        label="Request"
        value={entry.request}
        emptyMessage={
          failed
            ? 'No prompt was recorded for this failure.'
            : 'Prompts are kept for failed calls only, to keep the log small.'
        }
      />
      <CodeBlock
        label="Response"
        value={entry.response}
        emptyMessage={
          failed
            ? 'No reply was received — the call itself failed before the model responded.'
            : 'Replies are kept for failed calls only, to keep the log small.'
        }
      />
    </main>
  )
}
