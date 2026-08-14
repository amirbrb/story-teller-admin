import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabaseClient'
import { useAdminSession } from '@/lib/useAdminSession'
import { getUser, grantTokens, setPremium, setAdmin, setAiAutocomplete, type AdminUserDetail } from '@/lib/adminApi'
import { formatDate, formatDateTime, formatNumber, formatUsd } from '@/lib/formatters'
import DataTable, { type Column } from '@/components/DataTable'
import Button from '@/components/Button'
import ConfirmDialog from '@/components/ConfirmDialog'
import common from '@/styles/common.module.css'
import styles from './UserDetail.module.css'

type TokenTransaction = {
  id: string
  amount: number
  reason: string
  balance_after: number
  created_at: string
}

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
  | { type: 'grant'; amount: number; note: string }
  | { type: 'premium'; next: boolean }
  | { type: 'admin'; next: boolean }
  | { type: 'autocomplete'; next: boolean }

export default function UserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const { session } = useAdminSession()
  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [transactions, setTransactions] = useState<TokenTransaction[]>([])
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
      supabase
        .from('token_transactions')
        .select('id, amount, reason, balance_after, created_at')
        .eq('profile_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('ai_call_log')
        .select('id, created_at, function_name, model, status, total_tokens, cost_usd')
        .eq('profile_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
      .then(([userResult, txResult, aiResult]) => {
        setUser(userResult)
        if (txResult.error) throw txResult.error
        setTransactions(txResult.data ?? [])
        if (aiResult.error) throw aiResult.error
        setAiCalls(aiResult.data ?? [])
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
        await grantTokens(userId, pending.amount, pending.note)
        setGrantAmount('')
        setGrantNote('')
      } else if (pending.type === 'premium') {
        await setPremium(userId, pending.next)
      } else if (pending.type === 'admin') {
        await setAdmin(userId, pending.next)
      } else {
        await setAiAutocomplete(userId, pending.next)
      }
      setPending(null)
      loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusy(false)
    }
  }

  const txColumns: Column<TokenTransaction>[] = [
    { key: 'created_at', header: 'When', render: (r) => formatDateTime(r.created_at) },
    { key: 'reason', header: 'Reason', render: (r) => r.reason },
    { key: 'amount', header: 'Amount', render: (r) => (r.amount > 0 ? `+${r.amount}` : r.amount), align: 'right' },
    { key: 'balance_after', header: 'Balance after', render: (r) => formatNumber(r.balance_after), align: 'right' },
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
          {user.is_premium && <span className={styles.badgeSuccess}>Premium</span>}
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
            <dt>Token balance</dt>
            <dd>{formatNumber(user.token_balance)}</dd>
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
              Grant tokens
              <div className={styles.grantInputs}>
                <input
                  type="number"
                  min={1}
                  placeholder="Amount"
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
              onClick={() => setPending({ type: 'grant', amount: Number(grantAmount), note: grantNote })}
            >
              Grant
            </Button>
          </div>

          <div className={styles.actionRow}>
            <span>{user.is_premium ? 'Remove premium access' : 'Grant premium access'}</span>
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
              {user.ai_autocomplete_enabled
                ? 'Turn off AI autocomplete (the "continue writing" editor suggestion)'
                : 'Turn on AI autocomplete (the "continue writing" editor suggestion)'}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPending({ type: 'autocomplete', next: !user.ai_autocomplete_enabled })}
            >
              {user.ai_autocomplete_enabled ? 'Turn off autocomplete' : 'Turn on autocomplete'}
            </Button>
          </div>
        </section>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Token transactions</h2>
        <DataTable columns={txColumns} rows={transactions} rowKey={(r) => r.id} emptyMessage="No transactions." />
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>AI usage</h2>
        <DataTable columns={aiColumns} rows={aiCalls} rowKey={(r) => r.id} emptyMessage="No AI calls." />
      </section>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.type === 'grant'
            ? `Grant ${pending.amount} tokens?`
            : pending?.type === 'premium'
              ? pending.next
                ? 'Grant premium access?'
                : 'Remove premium access?'
              : pending?.type === 'admin'
                ? pending.next
                  ? 'Grant admin access?'
                  : 'Revoke admin access?'
                : pending?.type === 'autocomplete'
                  ? pending.next
                    ? 'Turn on AI autocomplete?'
                    : 'Turn off AI autocomplete?'
                  : ''
        }
        description={
          pending?.type === 'admin' && pending.next
            ? 'This user will be able to view every user, their AI usage, and grant/revoke admin access.'
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
