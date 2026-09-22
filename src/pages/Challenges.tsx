import { useEffect, useState, type FormEvent } from 'react'
import {
  deleteChallenge,
  listChallenges,
  upsertChallenge,
  type ChallengeGoalMetric,
  type ChallengeRow,
} from '@/lib/adminApi'
import Button from '@/components/Button'
import ConfirmDialog from '@/components/ConfirmDialog'
import DataTable, { type Column } from '@/components/DataTable'
import common from '@/styles/common.module.css'
import styles from './Challenges.module.css'

type ChallengeForm = {
  id: string | null
  title: string
  description: string
  start_date: string
  end_date: string
  // '' means "everyone" (null on the wire) — an <select> can't hold a null value directly.
  target_locale: string
  // '' means "no goal": the writer's page then shows what they wrote during the window with
  // nothing to measure it against. Metric and target go to the wire together or not at all.
  goal_metric: string
  goal_target: string
}

const EMPTY_FORM: ChallengeForm = {
  id: null,
  title: '',
  description: '',
  start_date: '',
  end_date: '',
  target_locale: '',
  goal_metric: '',
  goal_target: '',
}

const TARGET_LOCALE_LABELS: Record<string, string> = { en: 'English', he: 'Hebrew' }

const GOAL_METRIC_LABELS: Record<string, string> = { chapters: 'chapters', words: 'words' }

function toForm(row: ChallengeRow): ChallengeForm {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    start_date: row.start_date,
    end_date: row.end_date,
    target_locale: row.target_locale ?? '',
    goal_metric: row.goal_metric ?? '',
    goal_target: row.goal_target === null ? '' : String(row.goal_target),
  }
}

function goalSummary(form: ChallengeForm): string {
  if (!form.goal_metric) return 'no goal'
  return `${form.goal_target} ${GOAL_METRIC_LABELS[form.goal_metric] ?? form.goal_metric}`
}

// Operator screen for the community challenges writers can join from their own /challenges page
// in the main app. Plain CRUD on a small table, same shape as AiModels' model list: a table, an
// add/edit form staged into pendingSave, and a ConfirmDialog before every write. A challenge can
// carry an optional goal (N chapters or N words inside the date range), which is what the writer's
// page renders a progress meter against; leave it off and they just see their count for the window.
export default function Challenges() {
  const [challenges, setChallenges] = useState<ChallengeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState<ChallengeForm | null>(null)
  const [editingExisting, setEditingExisting] = useState(false)
  const [pendingSave, setPendingSave] = useState<ChallengeForm | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ChallengeRow | null>(null)

  function load() {
    setLoading(true)
    listChallenges()
      .then((rows) => {
        setChallenges(rows)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load challenges.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  function startAdd() {
    setForm(EMPTY_FORM)
    setEditingExisting(false)
  }

  function startEdit(row: ChallengeRow) {
    setForm(toForm(row))
    setEditingExisting(true)
  }

  function submitForm(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setPendingSave(form)
  }

  async function runMutation(action: () => Promise<void>, successMessage: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setNotice(successMessage)
      load()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The change could not be saved.'
      setError(
        message.includes('end_date must be on or after start_date')
          ? 'The end date must be on or after the start date.'
          : message,
      )
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<ChallengeRow>[] = [
    { key: 'title', header: 'Title', render: (r) => r.title },
    { key: 'start_date', header: 'Start', render: (r) => r.start_date },
    { key: 'end_date', header: 'End', render: (r) => r.end_date },
    {
      key: 'target_locale',
      header: 'Target',
      render: (r) => r.target_locale ? TARGET_LOCALE_LABELS[r.target_locale] ?? r.target_locale : <span className={common.muted}>Everyone</span>,
    },
    {
      key: 'goal',
      header: 'Goal',
      render: (r) =>
        r.goal_metric && r.goal_target !== null ? (
          `${r.goal_target} ${GOAL_METRIC_LABELS[r.goal_metric] ?? r.goal_metric}`
        ) : (
          <span className={common.muted}>No goal</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className={styles.rowActions}>
          <Button variant="secondary" size="sm" onClick={() => startEdit(r)}>
            Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setPendingDelete(r)}>
            Delete
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className={common.page}>
      <h1>Challenges</h1>
      <p className={common.muted}>
        Community writing challenges. Writers see and join these from their own Challenges page, where a
        challenge they've joined shows their progress for the window. Give it a goal to show them a meter
        against it; leave the goal off and they just see what they've written. A challenge stops being
        offered once its end date passes.
      </p>

      {error && <p className={common.error}>{error}</p>}
      {notice && <p className={styles.notice}>{notice}</p>}

      <section className={common.card}>
        <div className={styles.sectionHead}>
          <h2>All challenges</h2>
          <Button onClick={startAdd} disabled={busy}>
            Add challenge
          </Button>
        </div>

        <DataTable
          columns={columns}
          rows={challenges}
          rowKey={(r) => r.id}
          onRefresh={load}
          loading={loading}
          emptyMessage="No challenges yet."
        />

        {form && (
          <form className={styles.form} onSubmit={submitForm}>
            <h3>{editingExisting ? 'Edit challenge' : 'Add a challenge'}</h3>
            <label>
              Title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                required
              />
            </label>
            <div className={styles.formGrid}>
              <label>
                Start date
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  required
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              Target language
              <select value={form.target_locale} onChange={(e) => setForm({ ...form, target_locale: e.target.value })}>
                <option value="">Everyone</option>
                <option value="en">English</option>
                <option value="he">Hebrew</option>
              </select>
            </label>
            <div className={styles.formGrid}>
              <label>
                Goal
                <select
                  value={form.goal_metric}
                  onChange={(e) =>
                    // Clearing the metric clears the number with it — the RPC rejects one without
                    // the other, and a stale number left in a hidden field would be confusing.
                    setForm({ ...form, goal_metric: e.target.value, goal_target: e.target.value ? form.goal_target : '' })
                  }
                >
                  <option value="">No goal</option>
                  <option value="chapters">Chapters written</option>
                  <option value="words">Words written</option>
                </select>
              </label>
              <label>
                Target
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.goal_target}
                  onChange={(e) => setForm({ ...form, goal_target: e.target.value })}
                  disabled={!form.goal_metric}
                  required={form.goal_metric !== ''}
                  placeholder={form.goal_metric === 'words' ? 'e.g. 50000' : 'e.g. 8'}
                />
              </label>
            </div>
            <div className={styles.formActions}>
              <Button type="button" variant="ghost" onClick={() => setForm(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Save challenge
              </Button>
            </div>
          </form>
        )}
      </section>

      <ConfirmDialog
        open={pendingSave !== null}
        title={editingExisting ? 'Update this challenge?' : 'Add this challenge?'}
        description={
          pendingSave
            ? `${pendingSave.title} — ${pendingSave.start_date} to ${pendingSave.end_date}, ${pendingSave.target_locale ? `${TARGET_LOCALE_LABELS[pendingSave.target_locale]} only` : 'everyone'}, ${goalSummary(pendingSave)}.`
            : undefined
        }
        confirmLabel="Save"
        busy={busy}
        onCancel={() => setPendingSave(null)}
        onConfirm={() => {
          const target = pendingSave!
          setPendingSave(null)
          void runMutation(
            () =>
              upsertChallenge({
                id: target.id,
                title: target.title.trim(),
                description: target.description.trim(),
                start_date: target.start_date,
                end_date: target.end_date,
                target_locale: target.target_locale || null,
                goal_metric: (target.goal_metric || null) as ChallengeGoalMetric | null,
                goal_target: target.goal_metric ? Number(target.goal_target) : null,
              }),
            `Saved ${target.title.trim()}.`,
          ).then(() => setForm(null))
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this challenge?"
        description={pendingDelete ? `${pendingDelete.title} will no longer be offered to writers.` : undefined}
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete!
          setPendingDelete(null)
          void runMutation(() => deleteChallenge(target.id), `Deleted ${target.title}.`)
        }}
      />
    </div>
  )
}
