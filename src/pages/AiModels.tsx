import { useEffect, useState, type FormEvent } from 'react'
import {
  deleteAiModel,
  listAiModels,
  listAiSettings,
  setAiSetting,
  upsertAiModel,
  type AiModelRow,
} from '@/lib/adminApi'
import Button from '@/components/Button'
import ConfirmDialog from '@/components/ConfirmDialog'
import DataTable, { type Column } from '@/components/DataTable'
import common from '@/styles/common.module.css'
import styles from './AiModels.module.css'

// The internal roles, in the order an operator most likely wants to reason about them. Keys must
// match admin_set_ai_setting's allowlist in 0014_admin_ai_models.sql.
const INTERNAL_MODEL_KEYS = [
  {
    key: 'bible_model',
    label: 'Story bible',
    hint: 'Maintains each story\'s canon and decides whether a chapter contradicts it. The only model here that can block a save, so a weak one produces false conflicts that stop writers.',
    optional: false,
  },
  {
    key: 'bible_fallback_model',
    label: 'Story bible fallback',
    hint: 'Tried when the model above fails or is rate-limited. Worth setting if that one is free. Leave blank for no fallback.',
    optional: true,
  },
  {
    key: 'style_model',
    label: 'Style analysis',
    hint: 'Powers the writer-facing "Analyze my style" action.',
    optional: false,
  },
] as const

type ModelForm = {
  id: string
  label: string
  description: string
  token_cost: string
  sort_order: string
  is_enabled: boolean
}

const EMPTY_FORM: ModelForm = { id: '', label: '', description: '', token_cost: '0', sort_order: '0', is_enabled: true }

function toForm(row: AiModelRow): ModelForm {
  return {
    id: row.id,
    label: row.label,
    description: row.description ?? '',
    token_cost: String(row.token_cost),
    sort_order: String(row.sort_order),
    is_enabled: row.is_enabled,
  }
}

// Operator screen for swapping which OpenRouter models the app uses, without a redeploy. Two
// separate concerns share the page: what a writer can pick and pay for, and what runs the app's
// internal AI calls.
export default function AiModels() {
  const [models, setModels] = useState<AiModelRow[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [form, setForm] = useState<ModelForm | null>(null)
  const [editingExisting, setEditingExisting] = useState(false)
  const [pendingSave, setPendingSave] = useState<ModelForm | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AiModelRow | null>(null)
  const [pendingSetting, setPendingSetting] = useState<{ key: string; label: string; value: string } | null>(null)

  function load() {
    setLoading(true)
    Promise.all([listAiModels(), listAiSettings()])
      .then(([modelRows, settingRows]) => {
        setModels(modelRows)
        setSettings(Object.fromEntries(settingRows.map((s) => [s.key, s.value])))
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load AI model settings.'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // The migration refuses to leave zero enabled models — an empty picker would break chapter
  // drafting app-wide. Surfaced here too so the reason is visible before the click, not only after.
  const enabledCount = models.filter((m) => m.is_enabled).length

  function startAdd() {
    setForm(EMPTY_FORM)
    setEditingExisting(false)
  }

  function startEdit(row: AiModelRow) {
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
      // The RPCs raise this when a change would disable or delete the last enabled model.
      setError(
        message.includes('last_enabled_model')
          ? 'At least one model must stay enabled — writers would have nothing to draft with otherwise.'
          : message,
      )
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<AiModelRow>[] = [
    { key: 'id', header: 'OpenRouter id', render: (r) => <code className={styles.code}>{r.id}</code> },
    { key: 'label', header: 'Label', render: (r) => r.label },
    {
      key: 'token_cost',
      header: 'Token cost',
      align: 'right',
      render: (r) => (r.token_cost === 0 ? <span className={styles.freeBadge}>Free</span> : r.token_cost),
    },
    { key: 'sort_order', header: 'Order', align: 'right', render: (r) => r.sort_order },
    {
      key: 'is_enabled',
      header: 'Status',
      render: (r) => (r.is_enabled ? 'Enabled' : <span className={common.muted}>Disabled</span>),
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
      <h1>AI models</h1>
      <p className={common.muted}>
        Which OpenRouter models the app uses. Ids must match OpenRouter's catalogue exactly — an
        unrecognised id fails when a writer tries to generate, not when it is saved here. Changes to
        the internal roles can take a minute or two to take effect while running Edge Function
        instances recycle.
      </p>

      {error && <p className={common.error}>{error}</p>}
      {notice && <p className={styles.notice}>{notice}</p>}

      <section className={common.card}>
        <div className={styles.sectionHead}>
          <div>
            <h2>Writer-facing drafting models</h2>
            <p className={common.muted}>
              What a writer can choose between, and what each costs them in app tokens. A cost of 0
              charges nothing — no token ledger entry is written at all.
            </p>
          </div>
          <Button onClick={startAdd} disabled={busy}>
            Add model
          </Button>
        </div>

        <DataTable
          columns={columns}
          rows={models}
          rowKey={(r) => r.id}
          loading={loading}
          emptyMessage="No models configured."
        />

        {form && (
          <form className={styles.form} onSubmit={submitForm}>
            <h3>{editingExisting ? `Edit ${form.id}` : 'Add a model'}</h3>
            <div className={styles.formGrid}>
              <label>
                OpenRouter id
                <input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="e.g. mistralai/mistral-small-3.1-24b-instruct"
                  readOnly={editingExisting}
                  required
                />
              </label>
              <label>
                Label
                <input
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Shown in the writer's picker"
                  required
                />
              </label>
              <label>
                Token cost
                <input
                  type="number"
                  min={0}
                  value={form.token_cost}
                  onChange={(e) => setForm({ ...form, token_cost: e.target.value })}
                  required
                />
              </label>
              <label>
                Sort order
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  required
                />
              </label>
            </div>
            <label>
              Description
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="One short line shown under the label"
              />
            </label>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={form.is_enabled}
                onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
              />
              Offered to writers
            </label>
            <div className={styles.formActions}>
              <Button type="button" variant="ghost" onClick={() => setForm(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Save model
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className={common.card}>
        <h2>Internal models</h2>
        <p className={common.muted}>
          Used by the app's own AI calls, never chosen by a writer and never charged for. These
          calls expect JSON back, so prefer a model whose <code className={styles.code}>supported_parameters</code>{' '}
          includes <code className={styles.code}>response_format</code> — one that doesn't is retried without it, but
          complies less reliably. The story bible model runs on every substantive chapter save, so it
          also affects how quickly saving feels.
        </p>

        <div className={styles.settingList}>
          {INTERNAL_MODEL_KEYS.map(({ key, label, hint, optional }) => (
            <div key={key} className={styles.settingRow}>
              <div className={styles.settingMeta}>
                <strong>{label}</strong>
                <span className={common.muted}>{hint}</span>
              </div>
              <input
                value={settings[key] ?? ''}
                onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                placeholder={optional ? 'OpenRouter model id (optional)' : 'OpenRouter model id'}
                aria-label={label}
              />
              {/* An optional setting must stay saveable when blank — clearing the fallback is how
                  you turn it off, so a "don't save empty" guard would make it permanent. */}
              <Button
                variant="secondary"
                size="sm"
                disabled={busy || (!optional && !(settings[key] ?? '').trim())}
                onClick={() => setPendingSetting({ key, label, value: settings[key] ?? '' })}
              >
                Save
              </Button>
            </div>
          ))}

          <div className={styles.settingRow}>
            <div className={styles.settingMeta}>
              <strong>Style analysis cost</strong>
              <span className={common.muted}>App tokens charged for the writer-triggered style analysis. 0 makes it free.</span>
            </div>
            <input
              type="number"
              min={0}
              value={settings.style_analysis_cost ?? ''}
              onChange={(e) => setSettings({ ...settings, style_analysis_cost: e.target.value })}
              aria-label="Style analysis cost"
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={busy || !(settings.style_analysis_cost ?? '').trim()}
              onClick={() =>
                setPendingSetting({
                  key: 'style_analysis_cost',
                  label: 'Style analysis cost',
                  value: settings.style_analysis_cost ?? '',
                })
              }
            >
              Save
            </Button>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={pendingSave !== null}
        title={editingExisting ? 'Update this model?' : 'Add this model?'}
        description={
          pendingSave
            ? `${pendingSave.id} — ${pendingSave.token_cost} tokens, ${pendingSave.is_enabled ? 'offered to writers' : 'hidden from writers'}.`
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
              upsertAiModel({
                id: target.id.trim(),
                label: target.label.trim(),
                description: target.description.trim() || null,
                token_cost: Number(target.token_cost),
                sort_order: Number(target.sort_order),
                is_enabled: target.is_enabled,
              }),
            `Saved ${target.id.trim()}.`,
          ).then(() => setForm(null))
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this model?"
        description={
          pendingDelete
            ? `${pendingDelete.id} will no longer be offered to writers.${enabledCount <= 1 && pendingDelete.is_enabled ? ' This is the only enabled model, so this will be refused.' : ''}`
            : undefined
        }
        confirmLabel="Delete"
        danger
        busy={busy}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete!
          setPendingDelete(null)
          void runMutation(() => deleteAiModel(target.id), `Deleted ${target.id}.`)
        }}
      />

      <ConfirmDialog
        open={pendingSetting !== null}
        title="Change this setting?"
        description={
          pendingSetting
            ? `${pendingSetting.label} → ${pendingSetting.value.trim() || '(cleared — no fallback will be used)'}`
            : undefined
        }
        confirmLabel="Save"
        busy={busy}
        onCancel={() => setPendingSetting(null)}
        onConfirm={() => {
          const target = pendingSetting!
          setPendingSetting(null)
          void runMutation(() => setAiSetting(target.key, target.value.trim()), `Saved ${target.label}.`)
        }}
      />
    </div>
  )
}
