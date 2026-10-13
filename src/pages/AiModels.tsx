import { useEffect, useState, type FormEvent } from 'react'
import {
  deleteAiModel,
  listAiModelPrices,
  listAiModels,
  listAiSettings,
  listChapterModelCosts,
  setAiModelPrice,
  setAiSetting,
  upsertAiModel,
  type AiModelPriceRow,
  type AiModelRow,
  type ChapterModelCostRow,
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
  {
    key: 'autocomplete_model',
    label: 'Autocomplete',
    hint: 'Powers the "continue writing" ghost-text suggestion writers trigger from the editor. Streamed and explicit-trigger rather than typed-as-you-go, but still needs to feel fast — pick for latency over quality here.',
    optional: false,
  },
  {
    key: 'chapter_audio_model',
    label: 'Chapter audio',
    hint: 'Reads a chapter aloud into an MP3 when a writer asks for it through the MCP server (create_chapter_audio). Must be a text-to-speech model that can return mp3. Unlike the others, it isn\'t limited to providers that don\'t train on requests. A chapter keeps its approved audio until the writer approves a new take.',
    optional: false,
  },
  {
    key: 'chapter_audio_voice_he_female',
    label: 'Chapter audio: Hebrew female voice',
    hint: 'The default narrator for Hebrew chapters. A voice id from the Fish Audio voice library (the 32-character id in a voice page\'s fish.audio/m/… address); pick a native Hebrew speaker, or the narration gets a foreign accent. Other languages use the model\'s default voice.',
    optional: false,
  },
  {
    key: 'chapter_audio_voice_he_male',
    label: 'Chapter audio: Hebrew male voice',
    hint: 'Reads a Hebrew chapter when the writer asks for a male voice. A Fish Audio voice id, like the one above.',
    optional: false,
  },
] as const

type ModelForm = {
  id: string
  label: string
  description: string
  sort_order: string
  is_enabled: boolean
  // USD per million tokens, as typed. Both blank means no price.
  input_price: string
  output_price: string
}

const EMPTY_FORM: ModelForm = {
  id: '',
  label: '',
  description: '',
  sort_order: '0',
  is_enabled: true,
  input_price: '',
  output_price: '',
}

function toForm(row: AiModelRow, price: AiModelPriceRow | undefined): ModelForm {
  return {
    id: row.id,
    label: row.label,
    description: row.description ?? '',
    sort_order: String(row.sort_order),
    is_enabled: row.is_enabled,
    input_price: price ? String(price.input_usd_per_mtok) : '',
    output_price: price ? String(price.output_usd_per_mtok) : '',
  }
}

// The family card a model lands in on the writer's side, read off the id's provider prefix the
// same way story-teller's src/lib/aiChapterModels.ts does. Shown so an operator can see the
// grouping a new id will get before saving it. Keep the two maps in step.
const FAMILY_NAMES: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  'x-ai': 'Grok',
  'meta-llama': 'Llama',
  mistralai: 'Mistral',
  google: 'Gemini',
  deepseek: 'DeepSeek',
}

function familyOf(id: string): string {
  const slash = id.indexOf('/')
  const key = slash > 0 ? id.slice(0, slash) : id
  return FAMILY_NAMES[key] ?? key
}

// '' -> null (no price); otherwise a plain decimal with up to four places, below 1,000,000 — what
// the column (numeric(10,4)) can hold exactly. Anything else (more places, "1e3", "0x10", too big)
// returns undefined so the form refuses it rather than the database rounding or rejecting it.
function parsePrice(value: string): number | null | undefined {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^\d{1,6}(\.\d{1,4})?$/.test(trimmed)) return undefined
  return Number(trimmed)
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}`
}

// Operator screen for swapping which OpenRouter models the app uses, without a redeploy. Two
// separate concerns share the page: what a writer can pick and pay for, and what runs the app's
// internal AI calls.
export default function AiModels() {
  const [models, setModels] = useState<AiModelRow[]>([])
  const [prices, setPrices] = useState<Record<string, AiModelPriceRow>>({})
  // False when the price list couldn't be read. The form then leaves prices alone on save: blank
  // fields there mean "unknown", and saving them would clear a price that exists.
  const [pricesLoaded, setPricesLoaded] = useState(false)
  const [costs, setCosts] = useState<Record<string, ChapterModelCostRow>>({})
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
    Promise.all([
      listAiModels(),
      listAiSettings(),
      // Also informational for the page as a whole: before story-teller's 0075 is deployed the table
      // doesn't exist, and that shouldn't take the model list and internal settings down with it.
      listAiModelPrices().catch(() => null),
      // Informational only: a failure here shouldn't take the editable parts of the page down.
      listChapterModelCosts().catch(() => [] as ChapterModelCostRow[]),
    ])
      .then(([modelRows, settingRows, priceRows, costRows]) => {
        setModels(modelRows)
        setPrices(Object.fromEntries((priceRows ?? []).map((p) => [p.model_id, p])))
        setPricesLoaded(priceRows !== null)
        setCosts(Object.fromEntries(costRows.map((c) => [c.model_id, c])))
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
    setForm(toForm(row, prices[row.id]))
    setEditingExisting(true)
  }

  function submitForm(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    const input = parsePrice(form.input_price)
    const output = parsePrice(form.output_price)
    if (input === undefined || output === undefined) {
      setError('Prices must be plain numbers from 0 to 999999.9999, up to four decimal places (USD per million tokens).')
      return
    }
    // Half a price would make every estimate and fallback charge wrong in one direction.
    if ((input === null) !== (output === null)) {
      setError('Set both prices, or leave both blank for no price.')
      return
    }
    setError(null)
    setPendingSave(form)
  }

  // Resolves true on success, so a caller can keep its form open (and the operator's input) when
  // the save failed.
  async function runMutation(action: () => Promise<void>, successMessage: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      await action()
      setNotice(successMessage)
      load()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The change could not be saved.'
      // The RPCs raise this when a change would disable or delete the last enabled model.
      setError(
        message.includes('last_enabled_model')
          ? 'At least one model must stay enabled — writers would have nothing to draft with otherwise.'
          : message,
      )
      // A two-step save can fail after its first step landed; reload so the table shows what was
      // actually written rather than the state before the attempt.
      load()
      return false
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<AiModelRow>[] = [
    { key: 'id', header: 'OpenRouter id', render: (r) => <code className={styles.code}>{r.id}</code> },
    { key: 'label', header: 'Label', render: (r) => r.label },
    { key: 'family', header: 'Family', render: (r) => familyOf(r.id) },
    {
      key: 'price',
      header: 'Price in / out ($ per 1M)',
      align: 'right',
      render: (r) => {
        const p = prices[r.id]
        return p ? (
          `${formatUsd(p.input_usd_per_mtok)} / ${formatUsd(p.output_usd_per_mtok)}`
        ) : (
          <span className={common.muted}>Not set</span>
        )
      },
    },
    {
      key: 'typical',
      header: 'Typical chapter',
      align: 'right',
      render: (r) => {
        const c = costs[r.id]
        if (!c || c.typical_tokens === null) return <span className={common.muted}>—</span>
        return (
          <>
            {c.typical_tokens.toLocaleString('en-US')} tokens{' '}
            <span className={common.muted}>{c.observed ? '(measured)' : '(estimate)'}</span>
          </>
        )
      },
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
              What a writer can choose between when drafting, grouped into one card per family (read
              from the id's prefix) and ordered by sort order. A call is billed on what it actually
              cost at OpenRouter (see Billing). The price here is the model's OpenRouter listing: it
              sets the balance a writer needs to start a chapter, prices a call OpenRouter returned no
              cost for, and estimates the &ldquo;about N tokens a chapter&rdquo; figure writers see
              until five real chapters replace it. A model with no price falls back to the global
              reserve and flat fallback charge.
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
          onRefresh={load}
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
            <div className={styles.formGrid}>
              <label>
                Input price ($ per 1M tokens)
                <input
                  inputMode="decimal"
                  value={form.input_price}
                  onChange={(e) => setForm({ ...form, input_price: e.target.value })}
                  disabled={!pricesLoaded}
                  placeholder="e.g. 2 (blank for no price)"
                />
              </label>
              <label>
                Output price ($ per 1M tokens)
                <input
                  inputMode="decimal"
                  value={form.output_price}
                  onChange={(e) => setForm({ ...form, output_price: e.target.value })}
                  disabled={!pricesLoaded}
                  placeholder="e.g. 10 (blank for no price)"
                />
              </label>
            </div>
            <p className={common.muted}>
              Family: {form.id.trim() ? familyOf(form.id.trim()) : '—'}.{' '}
              {pricesLoaded
                ? 'Copy the prices from the model\u2019s OpenRouter page.'
                : 'Prices couldn\u2019t be loaded, so saving leaves them as they are.'}
            </p>
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
                placeholder={
                  key.startsWith('chapter_audio_voice')
                    ? 'Fish Audio voice id'
                    : optional
                      ? 'OpenRouter model id (optional)'
                      : 'OpenRouter model id'
                }
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

        </div>
      </section>

      <ConfirmDialog
        open={pendingSave !== null}
        title={editingExisting ? 'Update this model?' : 'Add this model?'}
        description={
          pendingSave
            ? `${pendingSave.id} — ${pendingSave.is_enabled ? 'offered to writers' : 'hidden from writers'}, ${
                !pricesLoaded
                  ? 'price unchanged'
                  : pendingSave.input_price.trim()
                  ? `priced at $${pendingSave.input_price.trim()} in / $${pendingSave.output_price.trim()} out per 1M tokens`
                  : 'no price (global reserve and flat fallback apply)'
              }.`
            : undefined
        }
        confirmLabel="Save"
        busy={busy}
        onCancel={() => setPendingSave(null)}
        onConfirm={() => {
          const target = pendingSave!
          setPendingSave(null)
          void runMutation(async () => {
            // Model first: the price row references it.
            await upsertAiModel({
              id: target.id.trim(),
              label: target.label.trim(),
              description: target.description.trim() || null,
              sort_order: Number(target.sort_order),
              is_enabled: target.is_enabled,
            })
            if (!pricesLoaded) return
            try {
              await setAiModelPrice(
                target.id.trim(),
                parsePrice(target.input_price) ?? null,
                parsePrice(target.output_price) ?? null,
              )
            } catch (err) {
              // The model row is already saved at this point; say so, so the operator retries only
              // the price instead of wondering whether anything happened.
              const message = err instanceof Error ? err.message : 'unknown error'
              throw new Error(`The model was saved, but its price wasn't: ${message}. Fix the price and save again.`)
            }
          }, `Saved ${target.id.trim()}.`).then((ok) => {
            if (ok) setForm(null)
          })
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
