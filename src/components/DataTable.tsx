import type { ReactNode } from 'react'
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
  loading?: boolean
  emptyMessage?: string
}

// Generic sortable-free table shell reused by Users, UserDetail (history tables), and AiUsage.
// Sorting/pagination is left to the caller (each page's data need is different enough that a
// built-in sort/paginate layer would just be indirection).
export default function DataTable<T>({ columns, rows, rowKey, onRowClick, loading, emptyMessage }: Props<T>) {
  return (
    <div className={styles.wrapper}>
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
  )
}
