import { useMemo, useRef, useState, type PointerEvent } from 'react'
import styles from './LineChart.module.css'

type Point = { date: string; value: number }

type Props = {
  title: string
  data: Point[]
  valueFormatter?: (value: number) => string
  emptyMessage?: string
}

const WIDTH = 600
const HEIGHT = 200
const PADDING = { top: 16, right: 16, bottom: 28, left: 44 }

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Single-series daily trend line (new users, logins, AI cost). No legend — a lone series is
// named by the card title, per the dataviz skill. Hover drives a crosshair + tooltip instead of
// per-point hit targets, since the reader is aiming at a date, not a 2px line.
export default function LineChart({ title, data, valueFormatter = (v) => v.toLocaleString(), emptyMessage }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const { points, maxValue, xTickIndexes, yTicks } = useMemo(() => {
    if (data.length === 0) {
      return { points: [] as { x: number; y: number }[], maxValue: 0, xTickIndexes: [] as number[], yTicks: [] as number[] }
    }
    const max = Math.max(1, ...data.map((d) => d.value))
    const innerW = WIDTH - PADDING.left - PADDING.right
    const innerH = HEIGHT - PADDING.top - PADDING.bottom
    const pts = data.map((d, i) => ({
      x: PADDING.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
      y: PADDING.top + innerH - (d.value / max) * innerH,
    }))
    const yTickVals = Array.from(new Set([0, Math.round(max / 2), max]))
    const xTickIdxs = data.length <= 5 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 2), data.length - 1]
    return { points: pts, maxValue: max, xTickIndexes: xTickIdxs, yTicks: yTickVals }
  }, [data])

  if (data.length === 0) {
    return (
      <div className={styles.card}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.empty}>{emptyMessage ?? 'No data yet.'}</p>
      </div>
    )
  }

  const innerH = HEIGHT - PADDING.top - PADDING.bottom
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const lastPoint = points[points.length - 1]
  const lastValue = data[data.length - 1].value

  function handleMove(e: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const localX = ((e.clientX - rect.left) / rect.width) * WIDTH
    let nearest = 0
    let nearestDist = Infinity
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - localX)
      if (dist < nearestDist) {
        nearestDist = dist
        nearest = i
      }
    })
    setHoverIndex(nearest)
  }

  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null
  const hoverDatum = hoverIndex !== null ? data[hoverIndex] : null

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      <svg
        ref={svgRef}
        className={styles.svg}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        onPointerMove={handleMove}
        onPointerLeave={() => setHoverIndex(null)}
        role="img"
        aria-label={title}
      >
        {yTicks.map((tick) => {
          const y = PADDING.top + innerH - (tick / maxValue) * innerH
          return (
            <g key={tick}>
              <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} className={styles.gridline} />
              <text x={PADDING.left - 8} y={y} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                {tick.toLocaleString()}
              </text>
            </g>
          )
        })}

        {xTickIndexes.map((i) => (
          <text key={i} x={points[i].x} y={HEIGHT - 8} className={styles.axisLabel} textAnchor="middle">
            {formatShortDate(data[i].date)}
          </text>
        ))}

        <path d={pathD} className={styles.line} fill="none" />

        {hoverPoint && (
          <line x1={hoverPoint.x} x2={hoverPoint.x} y1={PADDING.top} y2={HEIGHT - PADDING.bottom} className={styles.crosshair} />
        )}
        {hoverPoint && <circle cx={hoverPoint.x} cy={hoverPoint.y} r={5} className={styles.hoverDot} />}

        <circle cx={lastPoint.x} cy={lastPoint.y} r={4} className={styles.endDot} />
        <text x={lastPoint.x} y={lastPoint.y - 10} textAnchor="end" className={styles.endLabel}>
          {valueFormatter(lastValue)}
        </text>
      </svg>

      {hoverDatum && (
        <div className={styles.tooltip}>
          <span className={styles.tooltipDate}>{formatShortDate(hoverDatum.date)}</span>
          <span className={styles.tooltipValue}>{valueFormatter(hoverDatum.value)}</span>
        </div>
      )}
    </div>
  )
}
