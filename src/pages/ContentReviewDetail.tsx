import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getContentReviewEntry,
  lookupStoryTitles,
  lookupProfileNames,
  approveContentReview,
  rejectContentReview,
  type ContentReviewRow,
} from '@/lib/adminApi'
import { formatDateTime } from '@/lib/formatters'
import Badge, { type BadgeTone } from '@/components/Badge'
import Button from '@/components/Button'
import ConfirmDialog from '@/components/ConfirmDialog'
import common from '@/styles/common.module.css'
import styles from './IssueDetail.module.css'

const STATUS_TONE: Record<ContentReviewRow['status'], BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
}

type PendingAction = { type: 'approve' } | { type: 'reject' }

function stripHtmlForPreview(html: string): string {
  return html
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// One chapter that a writer's explicit save/publish couldn't get past automatic moderation
// (see ContentReviews.tsx / story-teller's _shared/chapterSave.ts). Approving re-saves it through
// the same service-role path submit-chapter uses, moderation skipped, rated 'mature' — rejecting
// just records why, which the writer then sees verbatim in their notification (review_note is
// required for that reason, not optional the way it is on approve).
export default function ContentReviewDetail() {
  const { id } = useParams<{ id: string }>()

  const [entry, setEntry] = useState<ContentReviewRow | null>(null)
  const [storyTitle, setStoryTitle] = useState<string | null>(null)
  const [writerName, setWriterName] = useState<string | null>(null)
  const [reviewerName, setReviewerName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)

  function load() {
    if (!id) return
    setLoading(true)
    setError(null)

    getContentReviewEntry(id)
      .then(async (data) => {
        setEntry(data)
        setNoteInput('')
        if (!data) return
        const profileIds = [data.profile_id, data.reviewed_by].filter((v): v is string => Boolean(v))
        const [titles, names] = await Promise.all([lookupStoryTitles([data.story_id]), lookupProfileNames(profileIds)])
        setStoryTitle(titles[data.story_id] ?? null)
        setWriterName(data.profile_id ? (names[data.profile_id] ?? null) : null)
        setReviewerName(data.reviewed_by ? (names[data.reviewed_by] ?? null) : null)
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
      if (pending.type === 'approve') {
        await approveContentReview(entry.id, noteInput.trim() || undefined)
      } else {
        await rejectContentReview(entry.id, noteInput.trim())
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
        {!error && <p className={common.muted}>That content review request was not found.</p>}
        <Button variant="secondary" to="/content-reviews">
          Back to content reviews
        </Button>
      </main>
    )
  }

  const rejectDisabled = noteInput.trim().length === 0

  return (
    <main className={common.page}>
      <div className={styles.heading}>
        <div>
          <h1>Content review</h1>
          <p className={common.muted}>{formatDateTime(entry.created_at)}</p>
        </div>
        <Badge tone={STATUS_TONE[entry.status]}>{entry.status}</Badge>
      </div>

      <Button variant="secondary" size="sm" to="/content-reviews">
        Back to content reviews
      </Button>

      {error && (
        <p role="alert" className={common.error}>
          {error}
        </p>
      )}

      <section className={`${common.card} ${styles.messageCard}`}>
        <h2 className={styles.sectionTitle}>{entry.title || '(untitled)'}</h2>
        <p className={styles.message}>{stripHtmlForPreview(entry.content)}</p>
      </section>

      <section className={`${common.card} ${styles.factsCard}`}>
        <h2 className={styles.sectionTitle}>Details</h2>
        <dl className={styles.facts}>
          <div>
            <dt>Writer</dt>
            <dd>{writerName ?? '—'}</dd>
          </div>
          <div>
            <dt>Story</dt>
            <dd>{storyTitle ?? '—'}</dd>
          </div>
          <div>
            <dt>Kind</dt>
            <dd>{entry.kind}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>{entry.language}</dd>
          </div>
          <div>
            <dt>Would publish</dt>
            <dd>{entry.publish ? 'Yes' : 'No, saved as draft'}</dd>
          </div>
          <div>
            <dt>Flagged for</dt>
            <dd>{entry.moderation_categories.length ? entry.moderation_categories.join(', ') : '—'}</dd>
          </div>
          <div>
            <dt>Edits existing chapter</dt>
            <dd className={styles.mono}>{entry.chapter_id ?? 'No — new chapter'}</dd>
          </div>
        </dl>
      </section>

      {entry.status !== 'pending' && (
        <section className={`${common.card} ${styles.factsCard}`}>
          <h2 className={styles.sectionTitle}>Decision</h2>
          <dl className={styles.facts}>
            <div>
              <dt>Decided by</dt>
              <dd>{reviewerName ?? '—'}</dd>
            </div>
            <div>
              <dt>Decided at</dt>
              <dd>{formatDateTime(entry.reviewed_at)}</dd>
            </div>
            <div>
              <dt>Note shown to writer</dt>
              <dd>{entry.review_note ?? '—'}</dd>
            </div>
          </dl>
        </section>
      )}

      {entry.status === 'pending' && (
        <section className={`${common.card} ${styles.actionsCard}`}>
          <h2 className={styles.sectionTitle}>Decision</h2>
          <label className={styles.cardUrlLabel}>
            Note to the writer (required to reject, optional to approve)
            <textarea rows={3} value={noteInput} onChange={(e) => setNoteInput(e.target.value)} />
          </label>
          <div className={styles.actionRow}>
            <span>The content is allowed after all</span>
            <Button variant="primary" size="sm" onClick={() => setPending({ type: 'approve' })}>
              Approve &amp; save
            </Button>
          </div>
          <div className={styles.actionRow}>
            <span>The content should not be allowed</span>
            <Button variant="danger" size="sm" disabled={rejectDisabled} onClick={() => setPending({ type: 'reject' })}>
              Reject
            </Button>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pending?.type === 'approve' ? 'Approve this chapter?' : 'Reject this chapter?'}
        description={
          pending?.type === 'approve'
            ? "Saves it exactly as the writer submitted it, rated 'mature', and notifies them it's live."
            : 'The note above is sent to the writer as-is, explaining why. This cannot be undone.'
        }
        danger={pending?.type === 'reject'}
        busy={busy}
        confirmLabel="Confirm"
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      />
    </main>
  )
}
