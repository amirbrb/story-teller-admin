import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAdminSession } from '@/lib/useAdminSession'
import {
  clearProfileFlag,
  dollarsToMicros,
  getUser,
  grantCredit,
  listCreditTransactions,
  listFeatureFlags,
  microsToDollars,
  setPremium,
  setAdmin,
  setChapterAutosave,
  setProfileFlag,
  type AdminUserDetail,
  type CreditTransactionRow,
  type FeatureFlagRow,
} from '@/lib/adminApi'
import { formatDate, formatDateTime, formatNumber, formatUsd } from '@/lib/formatters'
import DataTable, { type Column } from '@/components/DataTable'
import Button from '@/components/Button'
import ConfirmDialog from '@/components/ConfirmDialog'
import common from '@/styles/common.module.css'
import styles from './UserDetail.module.css'

type AiCallLogRow = {
  id: string
  created_at: string
  function_name: string
  model: string
  status: string
  total_tokens: number | null
  cost_usd: number | null
}

type PendingAction =
  | { type: 'grant'; dollars: string; note: string }
  | { type: 'premium'; next: boolean }
  | { type: 'admin'; next: boolean }
  | { type: 'autosave'; next: boolean }
  | { type: 'flag'; key: string; label: string; next: boolean }
  | { type: 'clearFlag'; key: string; label: string }

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const { session } = useAdminSession()
  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [transactions, setTransactions] = useState<CreditTransactionRow[]>([])
  const [flags, setFlags] = useState<FeatureFlagRow[]>([])
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [aiCalls, setAiCalls] = useState<AiCallLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [grantAmount, setGrantAmount] = useState('')
  const [grantNote, setGrantNote] = useState('')
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)

  function loadAll() {
    if (!userId) return
    setLoading(true)
    setError(null)

    Promise.all([
      getUser(userId),
      listCreditTransactions(userId),
      supabase
        .from('ai_call_log')
        .select('id, created_at, function_name, model, status, total_tokens, cost_usd')
        .eq('profile_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      listFeatureFlags(),
      supabase.from('profile_feature_flags').select('flag_key, enabled').eq('profile_id', userId),
    ])
      .then(([userResult, txRows, aiResult, flagRows, overrideResult]) => {
        setUser(userResult)
        setTransactions(txRows)
        if (aiResult.error) throw aiResult.error
        setAiCalls(aiResult.data ?? [])
        setFlags(flagRows)
        if (overrideResult.error) throw overrideResult.error
        setOverrides(
          Object.fromEntries((overrideResult.data ?? []).map((row) => [row.flag_key as string, row.enabled as boolean])),
        )
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load user.')
      })
      .finally(() => setLoading(false))
  }

  useEffect(loadAll, [userId])

  async function runPending() {
    if (!pending || !userId) return
    setBusy(true)
    setError(null)
    try {
      if (pending.type === 'grant') {
        await grantCredit(userId, dollarsToMicros(pending.dollars), pending.note)
        setGrantAmount('')
        setGrantNote('')
      } else if (pending.type === 'premium') {
        await setPremium(userId, pending.next)
      } else if (pending.type === 'admin') {
        await setAdmin(userId, pending.next)
      } else if (pending.type === 'flag') {
        await setProfileFlag(userId, pending.key, pending.next)
      } else if (pending.type === 'clearFlag') {
        await clearProfileFlag(userId, pending.key)
      } else {
        await setChapterAutosave(userId, pending.next)
      }
      setPending(null)
      loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusy(false)
    }
  }

  const txColumns: Column<CreditTransactionRow>[] = [
    { key: 'created_at', header: 'When', render: (r) => formatDateTime(r.created_at) },
    { key: 'reason', header: 'Reason', render: (r) => r.reason },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (r) => `${r.amount_micros > 0 ? '+' : '-'}$${microsToDollars(Math.abs(r.amount_micros))}`,
    },
    {
      key: 'balance_after',
      header: 'Balance after',
      align: 'right',
      render: (r) => `$${microsToDollars(r.balance_after_micros)}`,
    },
  ]

  const aiColumns: Column<AiCallLogRow>[] = [
    { key: 'created_at', header: 'When', render: (r) => formatDateTime(r.created_at) },
    { key: 'function_name', header: 'Function', render: (r) => r.function_name },
    { key: 'model', header: 'Model', render: (r) => r.model },
    { key: 'status', header: 'Status', render: (r) => r.status },
    { key: 'total_tokens', header: 'Tokens', render: (r) => formatNumber(r.total_tokens), align: 'right' },
    { key: 'cost_usd', header: 'Cost', render: (r) => formatUsd(r.cost_usd), align: 'right' },
  ]

  if (loading && !user) {
    return (
      <main className={common.page}>
        <p className={common.muted}>Loading…</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className={common.page}>
        {error && <p className={common.error}>{error}</p>}
        {!error && <p className={common.muted}>User not found.</p>}
      </main>
    )
  }

  const isSelf = session?.user.id === user.id

  return (
    <main className={common.page}>
      <div className={styles.header}>
        <div>
          <h1>{user.display_name}</h1>
          <p className={common.muted}>{user.email}</p>
        </div>
        <div className={styles.badges}>
          {user.is_premium && (
            <span className={styles.badgeSuccess}>
              {user.premium_source === 'admin' ? 'Premium (comped)' : 'Premium'}
            </span>
          )}
          {user.has_pending_premium_request && <span className={styles.badgeAdmin}>Wants premium</span>}
          {user.is_admin && <span className={styles.badgeAdmin}>Admin</span>}
        </div>
      </div>

      {error && (
        <p role="alert" className={common.error}>
          {error}
        </p>
      )}

      <div className={styles.grid}>
        <section className={common.card}>
          <h2 className={styles.sectionTitle}>Profile</h2>
          <dl className={styles.fields}>
            <dt>AI credit</dt>
            <dd>${microsToDollars(user.credit_micros)}</dd>
            <dt>Premium</dt>
            <dd>
              {user.is_premium
                ? user.premium_source === 'admin'
                  ? 'Granted by an admin — AI is unmetered'
                  : 'Bought through Paddle'
                : 'No'}
            </dd>
            {user.premium_granted_at && (
              <>
                <dt>Premium since</dt>
                <dd>{formatDate(user.premium_granted_at)}</dd>
              </>
            )}
            <dt>Joined</dt>
            <dd>{formatDate(user.created_at)}</dd>
            <dt>Adult content allowed</dt>
            <dd>{user.adult_content_allowed ? 'Yes' : 'No'}</dd>
            <dt>Bio</dt>
            <dd>{user.bio || '—'}</dd>
          </dl>
        </section>

        <section className={common.card}>
          <h2 className={styles.sectionTitle}>Actions</h2>

          <div className={styles.actionRow}>
            <label className={styles.grantLabel}>
              Grant AI credit (USD)
              <div className={styles.grantInputs}>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  placeholder="10.00"
                  value={grantAmount}
                  onChange={(e) => setGrantAmount(e.target.value)}
                  className={styles.amountInput}
                />
                <input
                  type="text"
                  placeholder="Note (optional)"
                  value={grantNote}
                  onChange={(e) => setGrantNote(e.target.value)}
                />
              </div>
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={!grantAmount || Number(grantAmount) <= 0}
              onClick={() => setPending({ type: 'grant', dollars: grantAmount, note: grantNote })}
            >
              Grant
            </Button>
          </div>

          <div className={styles.actionRow}>
            <span>
              {user.is_premium
                ? 'Remove premium access'
                : 'Grant premium access — full AI, not billed against credit'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPending({ type: 'premium', next: !user.is_premium })}
            >
              {user.is_premium ? 'Remove premium' : 'Make premium'}
            </Button>
          </div>

          <div className={styles.actionRow}>
            <span>
              {isSelf ? "Can't change your own admin access" : user.is_admin ? 'Revoke admin access' : 'Grant admin access'}
            </span>
            <Button
              variant="danger"
              size="sm"
              disabled={isSelf}
              onClick={() => setPending({ type: 'admin', next: !user.is_admin })}
            >
              {user.is_admin ? 'Revoke admin' : 'Make admin'}
            </Button>
          </div>

          <div className={styles.actionRow}>
            <span>
              {user.chapter_autosave_enabled
                ? 'Turn off chapter autosave (in-progress chapters stop syncing to their account)'
                : 'Turn on chapter autosave (in-progress chapters sync to their account)'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPending({ type: 'autosave', next: !user.chapter_autosave_enabled })}
            >
              {user.chapter_autosave_enabled ? 'Turn off autosave' : 'Turn on autosave'}
            </Button>
          </div>
        </section>
      </div>

      <section className={common.card}>
        <h2 className={styles.sectionTitle}>Feature flags</h2>
        <p className={common.muted}>
          Per-writer overrides. Clearing one hands them back to the flag's default. An admin-granted
          premium is never metered whatever ai_credit_metering says.
        </p>
        {flags.map((flag) => {
          const override = overrides[flag.key]
          const effective = override ?? flag.default_enabled
          return (
            <div key={flag.key} className={styles.actionRow}>
              <span>
                <strong>{flag.label}</strong>
                <br />
                {effective ? 'On' : 'Off'}
                {override === undefined ? ' (following the default)' : ' (set for this writer)'}
                {flag.description ? ` — ${flag.description}` : ''}
              </span>
              <span className={styles.flagActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPending({ type: 'flag', key: flag.key, label: flag.label, next: !effective })}
                >
                  {effective ? 'Turn off' : 'Turn on'}
                </Button>
                {override !== undefined && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPending({ type: 'clearFlag', key: flag.key, label: flag.label })}
                  >
                    Clear
                  </Button>
                )}
              </span>
            </div>
          )
        })}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Credit ledger</h2>
        <DataTable
          columns={txColumns}
          rows={transactions}
          rowKey={(r) => r.id}
          onRefresh={loadAll}
          loading={loading}
          emptyMessage="No transactions."
        />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>AI usage</h2>
        <DataTable
          columns={aiColumns}
          rows={aiCalls}
          rowKey={(r) => r.id}
          onRefresh={loadAll}
          loading={loading}
          emptyMessage="No AI calls."
        />
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.type === 'grant'
            ? `Grant $${pending.dollars} of AI credit?`
            : pending?.type === 'premium'
              ? pending.next
                ? 'Grant premium access?'
                : 'Remove premium access?'
              : pending?.type === 'admin'
                ? pending.next
                  ? 'Grant admin access?'
                  : 'Revoke admin access?'
                : pending?.type === 'flag'
                  ? `${pending.next ? 'Turn on' : 'Turn off'} ${pending.label} for this writer?`
                  : pending?.type === 'clearFlag'
                    ? `Clear ${pending.label} for this writer?`
                    : pending?.type === 'autosave'
                      ? pending.next
                        ? 'Turn on chapter autosave?'
                        : 'Turn off chapter autosave?'
                      : ''
        }
        description={
          pending?.type === 'admin' && pending.next
            ? 'This user will be able to view every user, their AI usage, and grant/revoke admin access.'
            : pending?.type === 'premium' && pending.next
              ? 'Every AI feature opens up for them immediately, and their usage is not billed against credit — this is the comped path, not a purchase.'
              : pending?.type === 'premium' && !pending.next
                ? 'They lose access to every AI feature. Any credit they hold stays on the account.'
                : pending?.type === 'flag' && pending.key === 'ai_credit_metering' && pending.next
                  ? "From their next AI call, usage is charged against their credit and stops when it runs out — unless their premium was granted by an admin, which is never metered."
                  : pending?.type === 'flag' && pending.key === 'paddle_checkout' && pending.next
                    ? 'The premium page will offer them real Paddle checkout instead of the "coming soon" message.'
                    : pending?.type === 'clearFlag'
                      ? "They go back to following the flag's default."
                      : undefined
        }
        danger={pending?.type === 'admin'}
        busy={busy}
        confirmLabel="Confirm"
        onConfirm={runPending}
        onCancel={() => setPending(null)}
      />
    </main>
  )
}
