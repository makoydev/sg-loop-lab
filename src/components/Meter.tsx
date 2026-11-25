import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { clamp, cn, FILM_TONE, PAPER_TONE, type Tone } from '@/lib/cn'
import type { Surface } from './ui'

const defaultFormat = (n: number) => Math.round(n).toLocaleString('en-SG')

/** A number that eases to its new value instead of jumping. */
export function AnimatedNumber({
  value,
  format = defaultFormat,
  className,
  style,
}: {
  value: number
  format?: (n: number) => string
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const mv = useMotionValue(value)
  const reduce = useReducedMotion()
  // Rendered once; afterwards the text node is driven by the motion value.
  const [initial] = useState(() => format(value))
  const formatRef = useRef(format)

  useEffect(() => {
    formatRef.current = format
    if (ref.current) ref.current.textContent = format(mv.get())
  }, [format, mv])

  useEffect(() => {
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration: 0.55, ease: [0.2, 0.7, 0.2, 1] })
    return () => controls.stop()
  }, [value, mv, reduce])

  useMotionValueEvent(mv, 'change', (v) => {
    if (ref.current) ref.current.textContent = formatRef.current(v)
  })

  return (
    <span ref={ref} className={cn('num', className)} style={style}>
      {initial}
    </span>
  )
}

/**
 * A live metric: label, animated value, and an optional bar with a target
 * marker. The tone is decided by the caller (it knows what "good" means).
 */
export function Meter({
  label,
  value,
  format,
  unit,
  tone = 'neutral',
  surface = 'film',
  bar,
  hint,
  className,
}: {
  label: ReactNode
  value: number
  format?: (n: number) => string
  unit?: ReactNode
  tone?: Tone
  surface?: Surface
  /** Bar scale. `target` draws a marker (a budget, an SLO, a limit). */
  bar?: { max: number; target?: number; targetLabel?: string }
  hint?: ReactNode
  className?: string
}) {
  const film = surface === 'film'
  const color = (film ? FILM_TONE : PAPER_TONE)[tone]
  const valueColor =
    tone === 'neutral' ? (film ? 'var(--color-film-text)' : 'var(--color-ink)') : color
  const pct = bar ? clamp((value / bar.max) * 100, 0, 100) : 0
  const targetPct = bar?.target != null ? clamp((bar.target / bar.max) * 100, 0, 100) : null

  return (
    <div
      className={cn(
        'min-w-0 rounded-xl border px-3 py-2.5',
        film ? 'border-film-rule bg-film-2/80' : 'border-rule bg-card',
        className,
      )}
    >
      <div className={cn('kicker truncate', film ? 'text-film-muted' : 'text-ink-3')}>{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <AnimatedNumber
          value={value}
          format={format}
          className="text-[22px] leading-none font-medium transition-colors duration-300"
          style={{ color: valueColor }}
        />
        {unit && (
          <span className={cn('num text-[12px]', film ? 'text-film-muted' : 'text-ink-3')}>
            {unit}
          </span>
        )}
        <span
          className="ml-auto size-2 shrink-0 rounded-full transition-colors duration-300"
          style={{ backgroundColor: color }}
          aria-hidden
        />
      </div>
      {bar && (
        <div
          className={cn(
            'relative mt-2.5 h-1.5 rounded-full',
            film ? 'bg-film-3' : 'bg-paper-3',
          )}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
          {targetPct != null && (
            <div
              className={cn(
                'absolute -top-1 h-3.5 w-px',
                film ? 'bg-film-text' : 'bg-ink',
              )}
              style={{ left: `${targetPct}%` }}
              title={bar.targetLabel}
            />
          )}
        </div>
      )}
      {(hint || bar?.targetLabel) && (
        <div
          className={cn(
            'mt-1.5 text-[11.5px] leading-snug',
            film ? 'text-film-muted' : 'text-ink-3',
          )}
        >
          {hint ?? bar?.targetLabel}
        </div>
      )}
    </div>
  )
}

/** A tiny line chart with an optional scrub cursor and threshold line. */
export function Sparkline({
  data,
  width = 240,
  height = 44,
  max,
  min = 0,
  cursor,
  threshold,
  tone = 'trace',
  surface = 'film',
  fill = true,
  className,
  label,
}: {
  data: number[]
  width?: number
  height?: number
  max?: number
  min?: number
  /** Index to mark with a dot and a vertical rule. */
  cursor?: number
  threshold?: number
  tone?: Tone
  surface?: Surface
  fill?: boolean
  className?: string
  /** Accessible description of what the chart shows. */
  label: string
}) {
  const color = (surface === 'film' ? FILM_TONE : PAPER_TONE)[tone]
  const hi = Math.max(max ?? 0, threshold ?? 0, ...data, min + 1e-9)
  const pad = 3
  const n = Math.max(1, data.length - 1)
  const x = (i: number) => pad + (i / n) * (width - pad * 2)
  const y = (v: number) =>
    height - pad - ((clamp(v, min, hi) - min) / (hi - min)) * (height - pad * 2)
  const line = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(data.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`
  const c = cursor != null ? clamp(cursor, 0, data.length - 1) : null

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('block w-full', className)}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {fill && data.length > 1 && <path d={area} fill={color} opacity={0.12} />}
      {threshold != null && (
        <line
          x1={pad}
          x2={width - pad}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke={surface === 'film' ? 'var(--color-film-muted)' : 'var(--color-ink-3)'}
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {data.length > 1 && (
        <path
          d={line}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {c != null && (
        <>
          <line
            x1={x(c)}
            x2={x(c)}
            y1={pad}
            y2={height - pad}
            stroke={color}
            strokeWidth={1}
            opacity={0.5}
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={x(c)} cy={y(data[c] ?? 0)} r={2.6} fill={color} />
        </>
      )}
    </svg>
  )
}
