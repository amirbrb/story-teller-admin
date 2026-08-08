import styles from './StatTile.module.css'

type Props = {
  label: string
  value: string
  sublabel?: string
}

export default function StatTile({ label, value, sublabel }: Props) {
  return (
    <div className={styles.tile}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {sublabel && <div className={styles.sublabel}>{sublabel}</div>}
    </div>
  )
}
