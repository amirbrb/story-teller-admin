import { useEffect, useState, type FormEvent } from 'react'
import { deleteChallenge, listChallenges, upsertChallenge, type ChallengeRow } from '@/lib/adminApi'
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
}

const EMPTY_FORM: ChallengeForm = { id: null, title: '', description: '', start_date: '', end_date: '' }

function toForm(row: ChallengeRow): ChallengeForm {
  return { id: row.id, title: row.title, description: row.description, start_date: row.start_date, end_date: row.end_date }
}

// Operator screen for the community challenges writers can join from their own /challenges page
// in the main app. Participation-only — no target metric, no progress tracking — so this is plain
// CRUD on a small table, same shape as AiModels' model list: a table, an add/edit form staged into
// pendingSave, and a ConfirmDialog before every write.
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
        Community writing challenges. Writers see and join these from their own Challenges page — participation
        only, no word-count or progress tracking. A challenge stops being offered once its end date passes.
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
        description={pendingSave ? `${pendingSave.title} — ${pendingSave.start_date} to ${pendingSave.end_date}.` : undefined}
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
