import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getFeedbackEntry,
  signFeedbackAttachments,
  setFeedbackStatus,
  type FeedbackRow,
  type SignedFeedbackAttachment,
} from '@/lib/adminApi'
import { formatDateTime } from '@/lib/formatters'
import Badge, { type BadgeTone } from '@/components/Badge'
import Button from '@/components/Button'
import ConfirmDialog from '@/components/ConfirmDialog'
import common from '@/styles/common.module.css'
import styles from './IssueDetail.module.css'

const STATUS_TONE: Record<FeedbackRow['status'], BadgeTone> = {
  new: 'warning',
  filed: 'success',
  dismissed: 'neutral',
}

type PendingAction = { type: 'dismiss' } | { type: 'reopen' } | { type: 'file'; cardUrl: string }

// One feedback item from the "Send feedback" drawer, with the same triage actions the
// file-feedback skill has via the (now admin-hidden) mcp-server tools: dismiss a non-issue, or
// mark it filed — by hand here, or automatically once the skill creates the Trello card.
export default function IssueDetail() {
  const { id } = useParams<{ id: string }>()

  const [entry, setEntry] = useState<FeedbackRow | null>(null)
  const [attachments, setAttachments] = useState<SignedFeedbackAttachment[]>([])
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cardUrlInput, setCardUrlInput] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)

  function load() {
    if (!id) return
    setLoading(true)
    setError(null)

    getFeedbackEntry(id)
      .then((data) => {
        setEntry(data)
        if (data?.card_url) setCardUrlInput(data.card_url)
        if (data && data.attachments.length > 0) {
          setAttachmentsLoading(true)
          return signFeedbackAttachments(data.id)
            .then(setAttachments)
            .finally(() => setAttachmentsLoading(false))
        }
        setAttachments([])
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load this item.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(load, [id])

  async function runPending() {
    if (!pending || !entry) return
    setBusy(true)
    setError(null)
    try {
      if (pending.type === 'dismiss') {
        await setFeedbackStatus(entry.id, 'dismissed')
      } else if (pending.type === 'reopen') {
        await setFeedbackStatus(entry.id, 'new')
      } else {
        await setFeedbackStatus(entry.id, 'filed', pending.cardUrl)
      }
      setPending(null)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !entry) {
    return (
      <main className={common.page}>
        <p className={common.muted}>Loading…</p>
      </main>
    )
  }

  if (!entry) {
    return (
      <main className={common.page}>
        {error && <p className={common.error}>{error}</p>}
        {!error && <p className={common.muted}>That feedback item was not found.</p>}
        <Button variant="secondary" to="/issues">
          Back to issues
        </Button>
      </main>
    )
  }

  const cardUrlValid = /^https?:\/\//.test(cardUrlInput.trim())

  return (
    <main className={common.page}>
      <div className={styles.heading}>
        <div>
          <h1>Feedback #{entry.number}</h1>
          <p className={common.muted}>{formatDateTime(entry.created_at)}</p>
        </div>
        <Badge tone={STATUS_TONE[entry.status]}>{entry.status}</Badge>
      </div>

      <Button variant="secondary" size="sm" to="/issues">
        Back to issues
      </Button>

      {error && (
        <p role="alert" className={common.error}>
          {error}
        </p>
      )}

      <section className={`${common.card} ${styles.messageCard}`}>
        <h2 className={styles.sectionTitle}>Message</h2>
        <p className={styles.message}>{entry.message}</p>
      </section>

      <section className={`${common.card} ${styles.factsCard}`}>
        <h2 className={styles.sectionTitle}>Details</h2>
        <dl className={styles.facts}>
          <div>
            <dt>Reporter</dt>
            <dd>{entry.reporter_name ?? '—'}</dd>
          </div>
          <div>
            <dt>Profile id</dt>
            <dd className={styles.mono}>{entry.profile_id ?? '—'}</dd>
          </div>
          <div>
            <dt>Page</dt>
            <dd className={styles.mono}>{entry.page ?? '—'}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>{entry.language ?? '—'}</dd>
          </div>
          <div>
            <dt>User agent</dt>
            <dd className={styles.mono}>{entry.user_agent ?? '—'}</dd>
          </div>
          <div>
            <dt>Filed at</dt>
            <dd>{formatDateTime(entry.filed_at)}</dd>
          </div>
          <div>
            <dt>Card</dt>
            <dd>
              {entry.card_url ? (
                <a href={entry.card_url} target="_blank" rel="noreferrer">
                  {entry.card_url}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
      </section>

      {entry.attachments.length > 0 && (
        <section className={`${common.card} ${styles.attachmentsCard}`}>
          <h2 className={styles.sectionTitle}>Attachments</h2>
          {attachmentsLoading && <p className={common.muted}>Signing links…</p>}
          {!attachmentsLoading && (
            <ul className={styles.attachments}>
              {attachments.map((a, i) => (
                <li key={i}>
                  {a.url ? (
                    a.kind === 'image' ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className={styles.attachmentLink}>
                        <img src={a.url} alt={a.name} className={styles.thumb} />
                        {a.name}
                      </a>
                    ) : (
                      <a href={a.url} target="_blank" rel="noreferrer" className={styles.attachmentLink}>
                        {a.name}
                      </a>
                    )
                  ) : (
                    <span className={common.muted}>{a.name} (file no longer available)</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className={`${common.card} ${styles.actionsCard}`}>
        <h2 className={styles.sectionTitle}>Actions</h2>

        {entry.status !== 'dismissed' && (
          <div className={styles.actionRow}>
            <span>Not a real issue</span>
            <Button variant="danger" size="sm" onClick={() => setPending({ type: 'dismiss' })}>
              Dismiss
            </Button>
          </div>
        )}

        {entry.status !== 'new' && (
          <div className={styles.actionRow}>
            <span>Put this back in the queue</span>
            <Button variant="secondary" size="sm" onClick={() => setPending({ type: 'reopen' })}>
              Reopen
            </Button>
          </div>
        )}

        <div className={styles.actionRow}>
          <label className={styles.cardUrlLabel}>
            Trello card URL
            <input
              type="url"
              placeholder="https://trello.com/c/..."
              value={cardUrlInput}
              onChange={(e) => setCardUrlInput(e.target.value)}
            />
          </label>
          <Button
            variant="primary"
            size="sm"
            disabled={!cardUrlValid}
            onClick={() => setPending({ type: 'file', cardUrl: cardUrlInput.trim() })}
          >
            Mark filed
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.type === 'dismiss'
            ? 'Dismiss this item?'
            : pending?.type === 'reopen'
              ? 'Reopen this item?'
              : 'Mark this item filed?'
        }
        description={
          pending?.type === 'dismiss'
            ? "It stops appearing as new and won't be filed to Trello by the skill."
            : pending?.type === 'file'
              ? 'Records the card URL and takes it out of the file-feedback queue.'
              : undefined
        }
        danger={pending?.type === 'dismiss'}
        busy={busy}
        confirmLabel="Confirm"
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      />
    </main>
  )
}
