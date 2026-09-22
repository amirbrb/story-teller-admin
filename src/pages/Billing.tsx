import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  deleteCreditPack,
  dollarsToMicros,
  listBillingSettings,
  listCreditPacks,
  listPremiumRequests,
  microsToDollars,
  resolvePremiumRequest,
  setBillingSetting,
  setProfileFlag,
  upsertCreditPack,
  type BillingSettingRow,
  type CreditPackRow,
  type PremiumRequestRow,
} from '@/lib/adminApi'
import Button from '@/components/Button'
import ConfirmDialog from '@/components/ConfirmDialog'
import DataTable, { type Column } from '@/components/DataTable'
import common from '@/styles/common.module.css'
import styles from './Billing.module.css'

// Everything about what premium costs and who's asking for it
// (story-teller/supabase/migrations/0049_premium_credit.sql).
//
// Credit packs are the contract between Paddle and the app: a paid transaction grants whatever the
// matching pack says, looked up by the Paddle price id the webhook reports. Nothing the browser
// sends decides an amount, so the numbers here are the only place a purchase's value is set — get
// a credit_micros wrong and writers get the wrong balance for real money.
//
// The settings below are read on every AI call. markup_multiplier is the whole pricing model: a
// writer pays what the model cost times this.

const SETTING_HINTS: Record<string, { label: string; hint: string; unit: 'multiplier' | 'dollars' }> = {
  markup_multiplier: {
    label: 'Markup',
    hint: 'What a writer pays per unit of what OpenRouter charges us. 1.5 means a call that costs us $0.10 costs them $0.15.',
    unit: 'multiplier',
  },
  min_call_reserve_micros: {
    label: 'Minimum balance to start a call',
    hint: "An AI call won't start below this, which bounds how far one in-flight call can push a balance negative.",
    unit: 'dollars',
  },
  low_balance_threshold_micros: {
    label: 'Low balance warning',
    hint: 'When a charge takes a writer under this, they get an email — before the hard stop interrupts them mid-sentence.',
    unit: 'dollars',
  },
  fallback_cost_micros: {
    label: 'Fallback cost per call',
    hint: "Charged (before markup) when OpenRouter reports no cost for a call, so an unpriced call is never silently free.",
    unit: 'dollars',
  },
}

type PackForm = {
  paddle_price_id: string
  kind: 'premium' | 'topup'
  label: string
  description: string
  credit_dollars: string
  grants_premium: boolean
  display_amount: string
  sort_order: string
  is_enabled: boolean
}

const EMPTY_PACK: PackForm = {
  paddle_price_id: '',
  kind: 'topup',
  label: '',
  description: '',
  credit_dollars: '10.00',
  grants_premium: false,
  display_amount: '$10',
  sort_order: '0',
  is_enabled: true,
}

type Pending =
  | { type: 'savePack'; form: PackForm; isNew: boolean }
  | { type: 'deletePack'; id: string }
  | { type: 'saveSetting'; key: string; value: string }
  | { type: 'resolveRequest'; id: string; name: string }
  | { type: 'enableCheckout'; profileId: string; name: string }

export default function Billing() {
  const [packs, setPacks] = useState<CreditPackRow[]>([])
  const [settings, setSettings] = useState<BillingSettingRow[]>([])
  const [requests, setRequests] = useState<PremiumRequestRow[]>([])
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({})
  const [form, setForm] = useState<PackForm>(EMPTY_PACK)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  function loadAll() {
    setLoading(true)
    Promise.all([listCreditPacks(), listBillingSettings(), listPremiumRequests(false)])
      .then(([packRows, settingRows, requestRows]) => {
        setPacks(packRows)
        setSettings(settingRows)
        setRequests(requestRows)
        setSettingDrafts(
          Object.fromEntries(
            settingRows.map((row) => [
              row.key,
              SETTING_HINTS[row.key]?.unit === 'dollars' ? microsToDollars(Number(row.value)) : row.value,
            ]),
          ),
        )
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load billing.'))
      .finally(() => setLoading(false))
  }

  useEffect(loadAll, [])

  async function runPending() {
    if (!pending) return
    setBusy(true)
    try {
      if (pending.type === 'savePack') {
        await upsertCreditPack({
          paddle_price_id: pending.form.paddle_price_id.trim(),
          kind: pending.form.kind,
          label: pending.form.label.trim(),
          description: pending.form.description.trim() || null,
          credit_micros: dollarsToMicros(pending.form.credit_dollars),
          grants_premium: pending.form.grants_premium,
          display_amount: pending.form.display_amount.trim(),
          sort_order: Number(pending.form.sort_order) || 0,
          is_enabled: pending.form.is_enabled,
        })
        setForm(EMPTY_PACK)
        setEditingId(null)
      } else if (pending.type === 'deletePack') {
        await deleteCreditPack(pending.id)
      } else if (pending.type === 'saveSetting') {
        const hint = SETTING_HINTS[pending.key]
        const value = hint?.unit === 'dollars' ? String(dollarsToMicros(pending.value)) : pending.value
        await setBillingSetting(pending.key, value)
      } else if (pending.type === 'resolveRequest') {
        await resolvePremiumRequest(pending.id)
      } else if (pending.type === 'enableCheckout') {
        await setProfileFlag(pending.profileId, 'paddle_checkout', true)
      }
      setPending(null)
      setError(null)
      loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusy(false)
    }
  }

  function submitPack(e: FormEvent) {
    e.preventDefault()
    if (!form.paddle_price_id.trim() || !form.label.trim()) return
    setPending({ type: 'savePack', form, isNew: !editingId })
  }

  const packColumns: Column<CreditPackRow>[] = [
    { key: 'label', header: 'Pack', render: (r) => r.label },
    { key: 'kind', header: 'Kind', render: (r) => (r.grants_premium ? 'Premium + credit' : 'Top-up') },
    { key: 'display_amount', header: 'Price shown', render: (r) => r.display_amount },
    {
      key: 'credit',
      header: 'Grants',
      align: 'right',
      render: (r) => `$${microsToDollars(r.credit_micros)}`,
    },
    { key: 'price_id', header: 'Paddle price', render: (r) => <code className={styles.code}>{r.paddle_price_id}</code> },
    { key: 'enabled', header: 'State', render: (r) => (r.is_enabled ? 'Live' : 'Disabled') },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <span className={styles.rowActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setEditingId(r.paddle_price_id)
              setForm({
                paddle_price_id: r.paddle_price_id,
                kind: r.kind,
                label: r.label,
                description: r.description ?? '',
                credit_dollars: microsToDollars(r.credit_micros),
                grants_premium: r.grants_premium,
                display_amount: r.display_amount,
                sort_order: String(r.sort_order),
                is_enabled: r.is_enabled,
              })
            }}
          >
            Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setPending({ type: 'deletePack', id: r.paddle_price_id })}>
            Delete
          </Button>
        </span>
      ),
    },
  ]

  const requestColumns: Column<PremiumRequestRow>[] = [
    {
      key: 'who',
      header: 'Writer',
      render: (r) => <Link to={`/users/${r.profile_id}`}>{r.display_name || r.email}</Link>,
    },
    { key: 'email', header: 'Email', render: (r) => r.email },
    { key: 'asked', header: 'Asked', render: (r) => new Date(r.created_at).toLocaleDateString() },
    { key: 'premium', header: 'Premium', render: (r) => (r.is_premium ? 'Yes' : 'No') },
    { key: 'checkout', header: 'Checkout', render: (r) => (r.checkout_enabled ? 'On' : 'Off') },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <span className={styles.rowActions}>
          {!r.checkout_enabled && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setPending({ type: 'enableCheckout', profileId: r.profile_id, name: r.display_name || r.email })
              }
            >
              Let them buy
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPending({ type: 'resolveRequest', id: r.id, name: r.display_name || r.email })}
          >
            Mark handled
          </Button>
        </span>
      ),
    },
  ]

  return (
    <main className={common.page}>
      <h1>Billing</h1>

      {error && (
        <p role="alert" className={common.error}>
          {error}
        </p>
      )}

      <section className={common.card}>
        <h2 className={styles.sectionTitle}>Premium requests</h2>
        <p className={common.muted}>
          Writers who pressed "tell me when it's ready" because their checkout flag is off. Either let
          them buy it themselves, or grant premium from their user page.
        </p>
        <DataTable
          columns={requestColumns}
          rows={requests}
          rowKey={(r) => r.id}
          loading={loading}
          emptyMessage="Nobody is waiting."
        />
      </section>

      <section className={common.card}>
        <h2 className={styles.sectionTitle}>Credit packs</h2>
        <p className={common.muted}>
          What a Paddle purchase grants, matched by price id when the webhook arrives. These numbers
          are the only place a purchase's value is set — nothing the browser sends can change it.
        </p>
        <DataTable
          columns={packColumns}
          rows={packs}
          rowKey={(r) => r.paddle_price_id}
          loading={loading}
          emptyMessage="No packs configured."
        />

        <form className={styles.form} onSubmit={submitPack}>
          <h3 className={styles.formTitle}>{editingId ? `Edit ${editingId}` : 'Add a pack'}</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Paddle price id</span>
              <input
                value={form.paddle_price_id}
                onChange={(e) => setForm({ ...form, paddle_price_id: e.target.value })}
                disabled={!!editingId}
                placeholder="pri_01..."
                required
              />
            </label>
            <label className={styles.field}>
              <span>Label</span>
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Nibb Premium"
                required
              />
            </label>
            <label className={styles.field}>
              <span>Kind</span>
              <select
                value={form.kind}
                onChange={(e) =>
                  setForm({
                    ...form,
                    kind: e.target.value as 'premium' | 'topup',
                    grants_premium: e.target.value === 'premium',
                  })
                }
              >
                <option value="premium">Premium (grants access)</option>
                <option value="topup">Top-up (credit only)</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Credit granted (USD)</span>
              <input
                value={form.credit_dollars}
                onChange={(e) => setForm({ ...form, credit_dollars: e.target.value })}
                inputMode="decimal"
                required
              />
            </label>
            <label className={styles.field}>
              <span>Price shown to writers</span>
              <input
                value={form.display_amount}
                onChange={(e) => setForm({ ...form, display_amount: e.target.value })}
                placeholder="$20"
                required
              />
            </label>
            <label className={styles.field}>
              <span>Sort order</span>
              <input
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                inputMode="numeric"
              />
            </label>
          </div>
          <label className={styles.field}>
            <span>Description</span>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Shown on the premium page."
            />
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={(e) => setForm({ ...form, is_enabled: e.target.checked })}
            />
            <span>Offered to writers</span>
          </label>
          <div className={styles.formActions}>
            <Button type="submit" size="sm">
              {editingId ? 'Save pack' : 'Add pack'}
            </Button>
            {editingId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingId(null)
                  setForm(EMPTY_PACK)
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </section>

      <section className={common.card}>
        <h2 className={styles.sectionTitle}>Metering</h2>
        <p className={common.muted}>Read on every AI call. Changes take effect on the next one.</p>
        <div className={styles.settingList}>
          {settings.map((row) => {
            const hint = SETTING_HINTS[row.key]
            return (
              <div key={row.key} className={styles.settingRow}>
                <div className={styles.settingMeta}>
                  <strong>{hint?.label ?? row.key}</strong>
                  <span className={common.muted}>{hint?.hint}</span>
                </div>
                <input
                  value={settingDrafts[row.key] ?? ''}
                  onChange={(e) => setSettingDrafts({ ...settingDrafts, [row.key]: e.target.value })}
                  inputMode="decimal"
                  aria-label={hint?.label ?? row.key}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPending({ type: 'saveSetting', key: row.key, value: settingDrafts[row.key] ?? '' })}
                >
                  Save
                </Button>
              </div>
            )
          })}
        </div>
      </section>

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        danger={pending?.type === 'deletePack'}
        title={
          pending?.type === 'deletePack'
            ? `Delete pack ${pending.id}?`
            : pending?.type === 'savePack'
              ? pending.isNew
                ? `Add "${pending.form.label}"?`
                : `Save "${pending.form.label}"?`
              : pending?.type === 'saveSetting'
                ? `Set ${SETTING_HINTS[pending.key]?.label ?? pending.key}?`
                : pending?.type === 'resolveRequest'
                  ? `Mark ${pending.name}'s request handled?`
                  : pending?.type === 'enableCheckout'
                    ? `Let ${pending.name} buy premium?`
                    : ''
        }
        description={
          pending?.type === 'savePack'
            ? `A completed purchase of this Paddle price will grant $${pending.form.credit_dollars} of credit${pending.form.grants_premium ? ' and permanent premium access' : ''}.`
            : pending?.type === 'saveSetting' && pending.key === 'markup_multiplier'
              ? 'This changes what every metered writer pays for AI from their next call onward.'
              : pending?.type === 'enableCheckout'
                ? 'Turns on their paddle_checkout flag, so the premium page offers them real checkout instead of the "coming soon" message.'
                : pending?.type === 'deletePack'
                  ? 'Any future purchase of this Paddle price will arrive matching no pack, and grant nothing.'
                  : undefined
        }
        confirmLabel={pending?.type === 'deletePack' ? 'Delete' : 'Confirm'}
        onConfirm={() => void runPending()}
        onCancel={() => setPending(null)}
      />
    </main>
  )
}
