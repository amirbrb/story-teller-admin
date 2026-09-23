import { useEffect, useState, type FormEvent } from 'react'
import {
  clearProfileFlag,
  deleteFeatureFlag,
  listFeatureFlags,
  listFlagOverrides,
  listUsers,
  setProfileFlag,
  upsertFeatureFlag,
  type FeatureFlagRow,
  type FlagOverrideRow,
  type AdminUserRow,
} from '@/lib/adminApi'
import Button from '@/components/Button'
import ConfirmDialog from '@/components/ConfirmDialog'
import DataTable, { type Column } from '@/components/DataTable'
import common from '@/styles/common.module.css'
import styles from './FeatureFlags.module.css'

// Per-user feature flags (story-teller/supabase/migrations/0049_premium_credit.sql).
//
// This is where the premium rollout is actually driven. Both seeded flags default off, so the
// billing work ships inert and becomes real one writer at a time:
//   ai_token_metering — charge this writer's AI usage against their token balance, stopping at
//                       zero. Off means their AI is unmetered, exactly as before billing existed.
//   paddle_checkout   — give this writer real Paddle checkout. Off means they see "coming soon"
//                       and their request lands in the premium queue instead.
// Turning a flag back off is the rollback, and it takes effect on the writer's next AI call.
//
// Note an operator comp outranks both: a writer whose premium was granted from the user page is
// never metered, whatever ai_token_metering says. That's deliberate — it's how the team uses the
// app's own AI without a balance getting in the way.

type FlagForm = {
  key: string
  label: string
  description: string
  default_enabled: boolean
}

const EMPTY_FORM: FlagForm = { key: '', label: '', description: '', default_enabled: false }

type Pending =
  | { type: 'saveFlag'; form: FlagForm; isNew: boolean }
  | { type: 'deleteFlag'; key: string }
  | { type: 'setOverride'; profileId: string; name: string; key: string; enabled: boolean }
  | { type: 'clearOverride'; profileId: string; name: string; key: string }

export default function FeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlagRow[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<FlagOverrideRow[]>([])
  const [form, setForm] = useState<FlagForm>(EMPTY_FORM)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState<AdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)

  function loadFlags() {
    setLoading(true)
    listFeatureFlags()
      .then((rows) => {
        setFlags(rows)
        setSelectedKey((current) => current ?? rows[0]?.key ?? null)
        setError(null)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load feature flags.'))
      .finally(() => setLoading(false))
  }

  useEffect(loadFlags, [])

  function loadOverrides(key: string | null) {
    if (!key) {
      setOverrides([])
      return
    }
    listFlagOverrides(key, 200, 0)
      .then(setOverrides)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load overrides.'))
  }

  useEffect(() => loadOverrides(selectedKey), [selectedKey])

  // Debounced so typing a name doesn't fire a query per keystroke — same shape as Users.tsx.
  useEffect(() => {
    if (!userSearch.trim()) {
      setUserResults([])
      return
    }
    const handle = setTimeout(() => {
      listUsers(userSearch.trim(), 10, 0)
        .then(setUserResults)
        .catch(() => setUserResults([]))
    }, 300)
    return () => clearTimeout(handle)
  }, [userSearch])

  async function runPending() {
    if (!pending) return
    setBusy(true)
    try {
      if (pending.type === 'saveFlag') {
        await upsertFeatureFlag({
          key: pending.form.key.trim(),
          label: pending.form.label.trim(),
          description: pending.form.description.trim() || null,
          default_enabled: pending.form.default_enabled,
        })
        setForm(EMPTY_FORM)
        setEditingKey(null)
        loadFlags()
      } else if (pending.type === 'deleteFlag') {
        await deleteFeatureFlag(pending.key)
        if (selectedKey === pending.key) setSelectedKey(null)
        loadFlags()
      } else if (pending.type === 'setOverride') {
        await setProfileFlag(pending.profileId, pending.key, pending.enabled)
        loadOverrides(selectedKey)
        loadFlags()
      } else if (pending.type === 'clearOverride') {
        await clearProfileFlag(pending.profileId, pending.key)
        loadOverrides(selectedKey)
        loadFlags()
      }
      setPending(null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.')
    } finally {
      setBusy(false)
    }
  }

  function submitForm(e: FormEvent) {
    e.preventDefault()
    if (!form.key.trim() || !form.label.trim()) return
    setPending({ type: 'saveFlag', form, isNew: !editingKey })
  }

  const selectedFlag = flags.find((f) => f.key === selectedKey) ?? null

  const flagColumns: Column<FeatureFlagRow>[] = [
    { key: 'key', header: 'Key', render: (r) => <code className={styles.code}>{r.key}</code> },
    { key: 'label', header: 'Label', render: (r) => r.label },
    {
      key: 'default_enabled',
      header: 'Default',
      render: (r) => (r.default_enabled ? 'On for everyone' : 'Off'),
    },
    {
      key: 'overrides',
      header: 'Overrides',
      align: 'right',
      render: (r) => `${r.enabled_count} on / ${r.override_count} set`,
    },
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
              setEditingKey(r.key)
              setForm({
                key: r.key,
                label: r.label,
                description: r.description ?? '',
                default_enabled: r.default_enabled,
              })
            }}
          >
            Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setPending({ type: 'deleteFlag', key: r.key })}>
            Delete
          </Button>
        </span>
      ),
    },
  ]

  const overrideColumns: Column<FlagOverrideRow>[] = [
    { key: 'who', header: 'Writer', render: (r) => r.display_name || r.email },
    { key: 'email', header: 'Email', render: (r) => r.email },
    { key: 'enabled', header: 'State', render: (r) => (r.enabled ? 'On' : 'Off') },
    {
      key: 'updated_at',
      header: 'Set',
      render: (r) => new Date(r.updated_at).toLocaleDateString(),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <span className={styles.rowActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              setPending({
                type: 'setOverride',
                profileId: r.profile_id,
                name: r.display_name || r.email,
                key: selectedKey!,
                enabled: !r.enabled,
              })
            }
          >
            {r.enabled ? 'Turn off' : 'Turn on'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setPending({
                type: 'clearOverride',
                profileId: r.profile_id,
                name: r.display_name || r.email,
                key: selectedKey!,
              })
            }
          >
            Clear
          </Button>
        </span>
      ),
    },
  ]

  return (
    <main className={common.page}>
      <h1>Feature flags</h1>
      <p className={common.muted}>
        Per-writer switches. Both premium flags default off, so nothing changes for anyone until you
        turn one on for a specific account — and turning it back off is the rollback.
      </p>

      {error && (
        <p role="alert" className={common.error}>
          {error}
        </p>
      )}

      <section className={common.card}>
        <h2 className={styles.sectionTitle}>Flags</h2>
        <DataTable
          columns={flagColumns}
          rows={flags}
          rowKey={(r) => r.key}
          onRowClick={(r) => setSelectedKey(r.key)}
          loading={loading}
          emptyMessage="No flags defined."
        />

        <form className={styles.form} onSubmit={submitForm}>
          <h3 className={styles.formTitle}>{editingKey ? `Edit ${editingKey}` : 'Add a flag'}</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Key</span>
              <input
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                disabled={!!editingKey}
                placeholder="new_thing_enabled"
                required
              />
            </label>
            <label className={styles.field}>
              <span>Label</span>
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="New thing"
                required
              />
            </label>
          </div>
          <label className={styles.field}>
            <span>Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="What turning this on does to a writer's experience."
            />
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={form.default_enabled}
              onChange={(e) => setForm({ ...form, default_enabled: e.target.checked })}
            />
            <span>On by default for everyone without an override</span>
          </label>
          <div className={styles.formActions}>
            <Button type="submit" size="sm">
              {editingKey ? 'Save flag' : 'Add flag'}
            </Button>
            {editingKey && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingKey(null)
                  setForm(EMPTY_FORM)
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </section>

      <section className={common.card}>
        <h2 className={styles.sectionTitle}>
          {selectedFlag ? `Who has "${selectedFlag.key}" set` : 'Per-writer overrides'}
        </h2>
        {selectedFlag?.description && <p className={common.muted}>{selectedFlag.description}</p>}

        {!selectedFlag ? (
          <p className={common.muted}>Pick a flag above to see and change who has it.</p>
        ) : (
          <>
            <DataTable
              columns={overrideColumns}
              rows={overrides}
              rowKey={(r) => r.profile_id}
              emptyMessage="Nobody has an override for this flag — everyone follows the default."
            />

            <div className={styles.addOverride}>
              <h3 className={styles.formTitle}>Turn it on for someone</h3>
              <input
                className={styles.search}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search writers by name or email"
              />
              {userResults.length > 0 && (
                <ul className={styles.results}>
                  {userResults.map((user) => (
                    <li key={user.id} className={styles.result}>
                      <span>
                        {user.display_name || '—'} <span className={common.muted}>{user.email}</span>
                      </span>
                      <span className={styles.rowActions}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setPending({
                              type: 'setOverride',
                              profileId: user.id,
                              name: user.display_name || user.email,
                              key: selectedFlag.key,
                              enabled: true,
                            })
                          }
                        >
                          Turn on
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setPending({
                              type: 'setOverride',
                              profileId: user.id,
                              name: user.display_name || user.email,
                              key: selectedFlag.key,
                              enabled: false,
                            })
                          }
                        >
                          Turn off
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={pending !== null}
        busy={busy}
        danger={pending?.type === 'deleteFlag'}
        title={
          pending?.type === 'deleteFlag'
            ? `Delete "${pending.key}"?`
            : pending?.type === 'saveFlag'
              ? pending.isNew
                ? `Add "${pending.form.key}"?`
                : `Save "${pending.form.key}"?`
              : pending?.type === 'setOverride'
                ? `${pending.enabled ? 'Turn on' : 'Turn off'} "${pending.key}" for ${pending.name}?`
                : pending?.type === 'clearOverride'
                  ? `Clear "${pending.key}" for ${pending.name}?`
                  : ''
        }
        description={
          pending?.type === 'deleteFlag'
            ? 'Every per-writer override for this flag goes with it, and anything checking it will fall back to off.'
            : pending?.type === 'saveFlag' && pending.form.default_enabled
              ? 'This flag will be on for every writer who has no override set.'
              : pending?.type === 'setOverride' && pending.key === 'ai_token_metering' && pending.enabled
                ? "From their next AI call, this writer's usage costs tokens and stops when the balance runs out."
                : pending?.type === 'setOverride' && pending.key === 'paddle_checkout' && pending.enabled
                  ? 'This writer will get real Paddle checkout instead of the "coming soon" message.'
                  : pending?.type === 'clearOverride'
                    ? "The writer goes back to following the flag's default."
                    : undefined
        }
        confirmLabel={pending?.type === 'deleteFlag' ? 'Delete' : 'Confirm'}
        onConfirm={() => void runPending()}
        onCancel={() => setPending(null)}
      />
    </main>
  )
}
