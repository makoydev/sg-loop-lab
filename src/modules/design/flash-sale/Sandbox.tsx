import { ArrowRight, CircleCheck, Info } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { memo, useMemo } from 'react'
import { Film, FilmPanel } from '@/components/Film'
import { Meter } from '@/components/Meter'
import { Scorecard } from '@/components/Scorecard'
import { Scrubber } from '@/components/Scrubber'
import { Callout, Chip } from '@/components/ui'
import { cn, type Tone } from '@/lib/cn'
import { usePlayback } from '@/lib/usePlayback'
import { Controls, type ChangeNote } from './Controls'
import {
  DURATION,
  fmtCount,
  fmtInt,
  fmtLatency,
  fmtMoney,
  fmtPercent,
  MISSION_BUYERS,
  scorecard,
  TARGETS,
  TICKS,
  type Design,
  type Fault,
  type Run,
  type Summary,
} from './logic'
import { runMarks } from './marks'
import { Stage } from './Stage'

/** The most recent design change, and the run summary from just before it. */
export type LastChange = ChangeNote & { before: Summary }

type DeltaRow = {
  label: string
  before: string
  after: string
  /** Did the number move in the direction you want? */
  verdict: 'better' | 'worse'
}

function deltas(before: Summary, after: Summary): DeltaRow[] {
  const rows: DeltaRow[] = []
  const add = (
    label: string,
    b: number,
    a: number,
    format: (n: number) => string,
    lowerIsBetter: boolean,
  ) => {
    const from = format(b)
    const to = format(a)
    if (from === to) return
    rows.push({
      label,
      before: from,
      after: to,
      verdict: a < b === lowerIsBetter ? 'better' : 'worse',
    })
  }
  add('Oversold', before.oversold, after.oversold, fmtInt, true)
  add('Duplicate orders', before.duplicates, after.duplicates, fmtInt, true)
  add('Worst p99', before.peakP99, after.peakP99, fmtLatency, true)
  add('Admitted and answered', before.successRate, after.successRate, fmtPercent, false)
  add('Monthly cost', before.monthlyCost, after.monthlyCost, fmtMoney, true)
  add('Pods during the sale', before.pods, after.pods, fmtInt, true)
  return rows
}

function LastChangePanel({ last, summary }: { last: LastChange | null; summary: Summary }) {
  if (!last) {
    return (
      <FilmPanel title="Your last change">
        <p className="text-[13px] leading-snug text-film-muted">
          Change one thing at a time. This panel will say what that one change moved, and what it
          left exactly where it was.
        </p>
      </FilmPanel>
    )
  }
  const rows = deltas(last.before, summary)
  return (
    <FilmPanel title="Your last change">
      <div className="text-[14px] font-semibold text-film-text">{last.what}</div>
      <p className="mt-1 text-[12.5px] leading-snug text-film-muted">{last.how}</p>
      {rows.length === 0 ? (
        <p className="mt-2.5 border-t border-film-rule/70 pt-2.5 text-[13px] leading-snug text-f-warn">
          Nothing on the scorecard moved. Whatever is limiting this design, it was not this.
        </p>
      ) : (
        <ul className="mt-2.5 grid gap-x-5 gap-y-1 border-t border-film-rule/70 pt-2.5 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="truncate text-film-muted">{row.label}</span>
              <span className="num flex shrink-0 items-center gap-1.5">
                <span className="text-film-muted">{row.before}</span>
                <ArrowRight size={11} className="text-film-muted" aria-hidden />
                <span className={row.verdict === 'better' ? 'text-f-ok' : 'text-f-bad'}>
                  {row.after}
                </span>
                <span className="sr-only">{row.verdict}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </FilmPanel>
  )
}

/** Everything that depends on the whole run, not on the scrubbed moment. */
const RunPanels = memo(function RunPanels({
  run,
  last,
  solved,
}: {
  run: Run
  last: LastChange | null
  solved: boolean
}) {
  const { summary, scenario } = run
  const targets = useMemo(() => scorecard(summary), [summary])
  const allMet = targets.every((t) => t.met)
  const overBudget = summary.monthlyCost > TARGETS.budget
  const realShare = 1 - summary.botShare
  const shareTone: Tone = realShare >= 0.85 ? 'ok' : realShare >= 0.5 ? 'warn' : 'bad'

  return (
    <>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <Scorecard targets={targets} />
        <div className="grid grid-cols-2 gap-3">
          <Meter
            label="Monthly cost"
            value={summary.monthlyCost}
            format={fmtMoney}
            tone={overBudget ? 'bad' : 'ok'}
            bar={{ max: 30_000, target: TARGETS.budget }}
            hint={`budget ${fmtMoney(TARGETS.budget)}, one sale a night`}
          />
          <Meter
            label="Per good order"
            value={summary.costPerOrder ?? 0}
            format={(n) => (summary.costPerOrder === null ? 'none' : `S$${n.toFixed(3)}`)}
            hint={
              summary.costPerOrder === null
                ? 'no buyer got a clean confirmation'
                : 'the phone sells for S$1'
            }
          />
          <Meter
            label="Sold out after"
            value={summary.soldOutAt ?? DURATION}
            format={(n) => (summary.soldOutAt === null ? 'not yet' : `${n.toFixed(2)} s`)}
            hint={`${fmtInt(summary.unitsSold)} of 5,000 units gone`}
          />
          <Meter
            label="To real buyers"
            value={realShare * 100}
            format={(n) => `${Math.round(n)}%`}
            tone={shareTone}
            hint={scenario.faults.bots ? 'during the bot swarm' : 'bots are a tenth of traffic'}
          />
        </div>
      </div>

      {solved ? (
        <Callout
          surface="film"
          tone="ok"
          icon={<CircleCheck size={18} />}
          title="All five targets met, at full scale, with nothing injected."
        >
          An interviewer would start pushing now. Open the X-Ray to see what this design does when
          the plan turns out to be wrong.
        </Callout>
      ) : allMet ? (
        <Callout surface="film" tone="info" icon={<Info size={18} />} title="All five met, with an asterisk.">
          The mission is judged at {fmtCount(MISSION_BUYERS)} buyers or more, with no fault
          injected. Clear the faults and restore the crowd to count it.
        </Callout>
      ) : null}

      <LastChangePanel last={last} summary={summary} />
    </>
  )
})

/**
 * The struggle: a live architecture you reshape until the scorecard is clean.
 * The run loops; scrub it to see the queues build and drain.
 */
export function Sandbox({
  run,
  solved,
  last,
  onDesign,
  onBuyers,
  onFault,
  onReset,
}: {
  run: Run
  solved: boolean
  last: LastChange | null
  onDesign: (patch: Partial<Design>, note: ChangeNote) => void
  onBuyers: (buyers: number) => void
  onFault: (fault: Fault, on: boolean) => void
  onReset: () => void
}) {
  const reduce = useReducedMotion()
  const playback = usePlayback(TICKS, { stepMs: 130, autoPlay: !reduce, loop: true })
  const { summary, scenario } = run

  const marks = useMemo(() => runMarks(run), [run])

  return (
    <Film
      kicker="Live"
      title="00:00:00 on 11.11, the first 20 seconds"
      right={
        <Chip surface="film" tone="neutral">
          teaching model
        </Chip>
      }
      footer={
        <div className="flex flex-col gap-1.5">
          <Scrubber playback={playback} marks={marks} />
          <p className="text-[11.5px] leading-snug text-film-muted">
            Each step is a quarter of a second. Ticks on the bar mark where stock ran out
            <span className="text-f-ok"> (green)</span>, where something first saturated or oversold
            <span className="text-f-bad"> (red)</span>, and any injected failure
            <span className="text-f-info"> (violet)</span>.
          </p>
        </div>
      }
    >
      <p className="max-w-3xl text-[13.5px] leading-relaxed text-film-muted">
        <span className="font-semibold text-film-text">
          Meet all five targets at {fmtCount(MISSION_BUYERS)} buyers.
        </span>{' '}
        You start with the design that serves a normal Tuesday. The numbers come from a small
        simulation written for this lab: they show shape and direction, and they are not
        benchmarks.
      </p>

      <div className={cn('mt-4 grid gap-4', 'lg:grid-cols-[19.5rem_minmax(0,1fr)]')}>
        <div className="order-2 min-w-0 lg:order-1">
          <Controls
            design={run.design}
            scenario={scenario}
            plan={summary.plan}
            costLines={summary.costLines}
            onDesign={onDesign}
            onBuyers={onBuyers}
            onFault={onFault}
            onReset={onReset}
          />
        </div>
        <div className="order-1 flex min-w-0 flex-col gap-3 lg:order-2">
          <Stage run={run} index={playback.index} />
          <RunPanels run={run} last={last} solved={solved} />
        </div>
      </div>
    </Film>
  )
}
