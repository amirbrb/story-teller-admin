import { useState, type ReactNode } from 'react'
import styles from './DataTable.module.css'

export type Column<T> = {
  key: string
  header: string
  render: (row: T) => ReactNode
  align?: 'left' | 'right'
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  onRefresh?: () => void | Promise<void>
  loading?: boolean
  emptyMessage?: string
  // Stretches to fill its flex parent instead of capping at a fixed viewport fraction. Use this
  // on pages laid out with common.pageFill, where a footer (e.g. pagination) below the table must
  // stay on-screen — the page itself is viewport-height and the table absorbs the remaining space.
  fill?: boolean
}

// Generic sortable-free table shell reused by Users, UserDetail (history tables), AiModels, and
// AiUsage. Sorting/pagination is left to the caller (each page's data need is different enough
// that a built-in sort/paginate layer would just be indirection).
//
// The body scrolls within a capped height with a sticky header, rather than letting a long table
// push the rest of the page past the viewport — see CLAUDE.md.
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  onRefresh,
  loading,
  emptyMessage,
  fill,
}: Props<T>) {
  const [refreshing, setRefreshing] = useState(false)
  const spinning = refreshing || Boolean(loading)

  async function handleRefresh() {
    if (!onRefresh || spinning) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className={fill ? `${styles.wrapper} ${styles.fill}` : styles.wrapper}>
      {onRefresh && (
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={handleRefresh}
            disabled={spinning}
            aria-label="Refresh"
          >
            <svg
              className={spinning ? `${styles.refreshIcon} ${styles.spinning}` : styles.refreshIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
        </div>
      )}
      <div className={styles.scrollArea}>
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={col.align === 'right' ? styles.alignRight : undefined}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={columns.length} className={styles.status}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className={styles.status}>
                  {emptyMessage ?? 'No rows.'}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={onRowClick ? styles.clickable : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={col.align === 'right' ? styles.alignRight : undefined}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
