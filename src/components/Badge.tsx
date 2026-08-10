import type { ReactNode } from 'react'
import styles from './Badge.module.css'

// Tones name a meaning, not a color, so a status reads the same way on every page that shows it.
export type BadgeTone = 'success' | 'error' | 'warning' | 'neutral' | 'info'

type Props = {
  tone: BadgeTone
  children: ReactNode
}

// The log tables lean on these heavily — a page of rows is scanned for the handful that failed, and
// color does that job faster than reading a status column word by word.
export default function Badge({ tone, children }: Props) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>
}
