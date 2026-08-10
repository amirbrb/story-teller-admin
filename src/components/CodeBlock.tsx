import styles from './CodeBlock.module.css'

type Props = {
  label: string
  value: string | null
  // Shown instead of the block when there is no value. The distinction matters on a log detail
  // page: "no reply arrived" and "nobody recorded the reply" are different failures, and a blank
  // panel would read as the same thing for both.
  emptyMessage: string
}

// A prompt or a model reply, at the length they actually are. Scrolls inside its own box rather
// than stretching the page, and preserves whitespace — a truncated JSON reply is usually only
// readable with its original line breaks intact.
export default function CodeBlock({ label, value, emptyMessage }: Props) {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h3 className={styles.label}>{label}</h3>
        {value && <span className={styles.meta}>{value.length.toLocaleString()} chars</span>}
      </div>
      {value ? <pre className={styles.block}>{value}</pre> : <p className={styles.empty}>{emptyMessage}</p>}
    </section>
  )
}
