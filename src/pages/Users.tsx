import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listUsers, type AdminUserRow } from '@/lib/adminApi'
import { formatDate } from '@/lib/formatters'
import DataTable, { type Column } from '@/components/DataTable'
import Button from '@/components/Button'
import common from '@/styles/common.module.css'
import styles from './Users.module.css'

const PAGE_SIZE = 25

export default function Users() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handle = setTimeout(() => {
      setPage(0)
      setSearch(searchInput.trim())
    }, 300)
    return () => clearTimeout(handle)
  }, [searchInput])

  function load() {
    let cancelled = false
    setLoading(true)
    setError(null)

    const promise = listUsers(search, PAGE_SIZE, page * PAGE_SIZE)
      .then((data) => {
        if (cancelled) return
        setRows(data)
        setTotalCount(data[0]?.total_count ?? 0)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load users.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return {
      cancel: () => {
        cancelled = true
      },
      promise,
    }
  }

  useEffect(() => {
    const handle = load()
    return handle.cancel
  }, [search, page])

  const columns: Column<AdminUserRow>[] = [
    { key: 'email', header: 'Email', render: (r) => r.email },
    { key: 'display_name', header: 'Name', render: (r) => r.display_name },
    {
      key: 'is_premium',
      header: 'Premium',
      render: (r) => (r.is_premium ? <span className={styles.badgeSuccess}>Premium</span> : '—'),
    },
    { key: 'token_balance', header: 'Tokens', render: (r) => r.token_balance.toLocaleString(), align: 'right' },
    { key: 'created_at', header: 'Joined', render: (r) => formatDate(r.created_at) },
    {
      key: 'is_admin',
      header: 'Admin',
      render: (r) => (r.is_admin ? <span className={styles.badgeAdmin}>Admin</span> : '—'),
    },
  ]

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <main className={common.pageFill}>
      <h1>Users</h1>

      <input
        type="search"
        placeholder="Search by name or email…"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className={styles.search}
        aria-label="Search users"
      />

      {error && (
        <p role="alert" className={common.error}>
          {error}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/users/${r.id}`)}
        onRefresh={() => load().promise}
        loading={loading}
        emptyMessage="No users found."
        fill
      />

      <div className={styles.pagination}>
        <Button
          variant="secondary"
          size="sm"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous
        </Button>
        <span className={common.muted}>
          Page {page + 1} of {totalPages} ({totalCount.toLocaleString()} users)
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </main>
  )
}
