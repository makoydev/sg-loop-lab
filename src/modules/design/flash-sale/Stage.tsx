import { useMemo, type ReactNode } from 'react'
import { FlowDiagram } from '@/components/FlowDiagram'
import { Sparkline } from '@/components/Meter'
import { cn, FILM_TONE, type Tone } from '@/lib/cn'
import { buildDiagram, DIAGRAM_HEIGHT, DIAGRAM_WIDTH } from './diagram'
import { fmtCount, fmtInt, fmtLatency, STOCK, TARGETS, TIMEOUT, type Run } from './logic'
import { narrate } from './narrate'

/** A small chart with its current value: one series of the run, cursor at "now". */
export function Trend({
  label,
  value,
  tone,
  data,
  cursor,
  threshold,
  min,
  max,
  children,
}: {
  label: string
  value: string
  tone: Tone
  data: number[]
  cursor: number
  threshold?: number
  min?: number
  max?: number
  children?: ReactNode
}) {
  return (
    <div className="min-w-0 rounded-xl border border-film-rule bg-film-2/80 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="kicker truncate text-film-muted">{label}</span>
        <span
          className="num shrink-0 text-[15px] leading-none font-medium"
          style={{ color: tone === 'neutral' ? 'var(--color-film-text)' : FILM_TONE[tone] }}
        >
          {value}
        </span>
      </div>
      <Sparkline
        data={data}
        cursor={cursor}
        threshold={threshold}
        min={min}
        max={max}
        tone={tone === 'neutral' ? 'trace' : tone}
        label={`${label} over the run`}
        className="mt-2 h-11"
      />
      {children}
    </div>
  )
}

const clock = (t: number) => `00:00:${t.toFixed(2).padStart(5, '0')}`

/**
 * The live picture of one run at one moment: the architecture with traffic
 * moving through it, a sentence about what is going on, and three series that
 * show where this moment sits in the whole twenty seconds.
 */
export function Stage({ run, index, className }: { run: Run; index: number; className?: string }) {
  const tick = run.ticks[Math.min(index, run.ticks.length - 1)]!
  const { nodes, edges } = useMemo(() => buildDiagram(run, tick), [run, tick])
  const series = useMemo(
    () => ({
      queue: run.ticks.map((t) => t.appQueue + t.invQueue + t.writeQueue),
      p99: run.ticks.map((t) => t.p99),
      stock: run.ticks.map((t) => t.stock),
    }),
    [run],
  )
  const narration = narrate(run, tick)
  const queued = tick.appQueue + tick.invQueue + tick.writeQueue
  const lowestStock = Math.min(0, ...series.stock)

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <FlowDiagram
        nodes={nodes}
        edges={edges}
        width={DIAGRAM_WIDTH}
        height={DIAGRAM_HEIGHT}
        label={`Flash sale architecture at ${tick.t.toFixed(2)} seconds. ${narration.text}`}
      />

      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-xl border border-film-rule bg-film-2/60 px-3 py-2">
        <span className="num shrink-0 rounded-md bg-film-3 px-2 py-1 text-[13px] leading-none text-trace">
          {clock(tick.t)}
        </span>
        <span className="flex min-w-0 flex-1 items-start gap-2 pt-0.5 text-[13.5px] leading-snug text-film-text">
          <span
            className="mt-[5px] size-2 shrink-0 rounded-full"
            style={{ backgroundColor: FILM_TONE[narration.tone] }}
            aria-hidden
          />
          <span>{narration.text}</span>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Trend
          label="Queued in your stack"
          value={fmtCount(queued)}
          tone={queued >= 1 ? (tick.p99 > TARGETS.p99 ? 'bad' : 'warn') : 'ok'}
          data={series.queue}
          cursor={index}
        />
        <Trend
          label="Buy-path p99"
          value={tick.p99 > 0 ? fmtLatency(tick.p99) : 'idle'}
          tone={tick.p99 > TARGETS.p99 ? 'bad' : 'ok'}
          data={series.p99}
          cursor={index}
          threshold={TARGETS.p99}
          max={TIMEOUT}
        />
        <Trend
          label="Stock left"
          value={`${tick.stock < 0 ? '−' : ''}${fmtInt(Math.abs(tick.stock))}`}
          tone={tick.stock < -0.5 ? 'bad' : 'trace'}
          data={series.stock}
          cursor={index}
          threshold={lowestStock < 0 ? 0 : undefined}
          min={lowestStock}
          max={STOCK}
        />
      </div>
    </div>
  )
}
