import { ArrowRight, CircleCheck, Info, Siren, TriangleAlert } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Film, FilmPanel } from '@/components/Film'
import { Meter, Sparkline } from '@/components/Meter'
import { Scrubber } from '@/components/Scrubber'
import { Callout, Chip, Segmented } from '@/components/ui'
import { cn, type Tone } from '@/lib/cn'
import { usePlayback } from '@/lib/usePlayback'
import {
  FUNNEL_DESIGN,
  fmtInt,
  fmtMoney,
  MISSION_BUYERS,
  NO_FAULTS,
  scorecard,
  simulate,
  TARGETS,
  TICKS,
  type Design,
  type Run,
  type Scenario,
  type TargetId,
} from './logic'
import { runMarks } from './marks'
import {
  billRemarks,
  firstToGive,
  PUSHBACKS,
  signalsFor,
  type PushbackId,
  type Signal,
} from './pushbacks'
import { Stage } from './Stage'

const SHORT: Record<TargetId, string> = {
  oversold: 'Oversold',
  duplicates: 'Duplicate orders',
  p99: 'Worst p99',
  success: 'Admitted and answered',
  cost: 'Monthly cost',
}

/** A design, as the short list of choices that define it. */
function describe(design: Design, pods: number): string[] {
  const out: string[] = [design.page === 'cdn' ? 'Page from CDN' : 'Page from origin']
  if (design.admission === 'waitingroom') out.push(`Waiting room, ${fmtInt(design.admitRate)}/s`)
  else out.push(design.admission === 'ratelimit' ? 'Per-user rate limit' : 'No admission control')
  out.push(
    {
      rw: 'Read, then write',
      lock: 'Row lock',
      atomic: 'Atomic update',
      redis: 'Redis pre-decrement',
    }[design.inventory],
  )
  out.push(design.orderWrite === 'queue' ? 'Queue + worker' : 'Order written in the request')
  out.push(design.idempotency ? 'Idempotency key' : 'No idempotency key')
  out.push(
    design.capacity === 'prewarm'
      ? `Pre-warmed, ${fmtInt(pods)} pods`
      : design.capacity === 'reactive'
        ? 'Reactive autoscaling'
        : `Fixed, ${fmtInt(pods)} pods`,
  )
  if (design.botDefence) out.push('Bot defence')
  return out
}

function SignalCard({ signal, index }: { signal: Signal; index: number }) {
  const quiet = signal.firesAt === null
  const tone: Tone = quiet ? 'ok' : signal.severity === 'page' ? 'bad' : 'warn'
  const now = signal.series[Math.min(index, signal.series.length - 1)] ?? 0
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-film-rule bg-film-2/80 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] leading-tight font-medium text-film-text">{signal.label}</span>
        <span className="num shrink-0 text-[13px] text-film-text">{signal.format(now)}</span>
      </div>
      <Sparkline
        data={signal.series}
        cursor={index}
        threshold={signal.threshold}
        min={signal.min}
        max={signal.max}
        tone={quiet ? 'trace' : tone}
        label={`${signal.label} over the run`}
        className="h-12"
      />
      <div className="flex items-start gap-2 text-[12px] leading-snug text-film-muted">
        <Siren size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-film-text">Alert. </span>
          {signal.alert}
        </span>
      </div>
      <Chip surface="film" tone={tone} dot className="self-start">
        {quiet
          ? 'stays quiet in this run'
          : `${signal.severity === 'page' ? 'pages' : 'informs'} at ${signal.firesAt!.toFixed(2)} s`}
      </Chip>
      <p className="text-[12.5px] leading-snug text-film-muted">{signal.reading}</p>
    </div>
  )
}

function BeforeAfter({ planned, pushed }: { planned: Run; pushed: Run }) {
  const before = scorecard(planned.summary)
  const after = scorecard(pushed.summary)
  const soldOut = (run: Run) =>
    run.summary.soldOutAt === null ? 'not in 20 s' : `${run.summary.soldOutAt.toFixed(2)} s`
  return (
    <FilmPanel title="As planned, then under this pushback">
      <ul className="flex flex-col gap-1.5">
        {after.map((target, i) => (
          <li
            key={target.id}
            className="grid grid-cols-[minmax(0,1fr)_auto_0.75rem_auto] items-baseline gap-x-2 text-[12.5px]"
          >
            <span className="truncate text-film-muted">{SHORT[target.id]}</span>
            <span className={cn('num', before[i]!.met ? 'text-f-ok' : 'text-f-bad')}>
              {before[i]!.value}
            </span>
            <ArrowRight size={11} className="self-center text-film-muted" aria-hidden />
            <span className={cn('num text-right', target.met ? 'text-f-ok' : 'text-f-bad')}>
              {target.value}
              <span className="sr-only">{target.met ? ' (met)' : ' (missed)'}</span>
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[minmax(0,1fr)_auto_0.75rem_auto] items-baseline gap-x-2 border-t border-film-rule/70 pt-1.5 text-[12.5px]">
          <span className="truncate text-film-muted">Sold out after</span>
          <span className="num text-film-text">{soldOut(planned)}</span>
          <ArrowRight size={11} className="self-center text-film-muted" aria-hidden />
          <span className="num text-right text-film-text">{soldOut(pushed)}</span>
        </li>
      </ul>
    </FilmPanel>
  )
}

function Bill({ run }: { run: Run }) {
  const { summary } = run
  const lines = [...summary.costLines].sort((a, b) => b.monthly - a.monthly)
  const largest = lines[0]?.monthly ?? 1
  const over = summary.monthlyCost - TARGETS.budget
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <FilmPanel
        title={`the bill · ${fmtMoney(summary.monthlyCost)} a month`}
        right={
          <Chip surface="film" tone={over > 0 ? 'bad' : 'ok'}>
            {over > 0 ? `${fmtMoney(over)} over budget` : 'within budget'}
          </Chip>
        }
      >
        <ul className="flex flex-col gap-3">
          {lines.map((line) => (
            <li key={line.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium text-film-text">{line.label}</span>
                <span className="num shrink-0 text-[13px] text-film-text">
                  {fmtMoney(line.monthly)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-film-3">
                <div
                  className="h-full rounded-full bg-line transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.max(1.5, (line.monthly / largest) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[12px] leading-snug text-film-muted">{line.note}</p>
            </li>
          ))}
        </ul>
      </FilmPanel>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
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
            label="Pods during the sale"
            value={summary.pods}
            hint={
              run.design.capacity === 'reactive'
                ? `${fmtInt(summary.plan.eventually)} arrive after it ends`
                : `${fmtInt(summary.plan.needed)} would cover the planned peak`
            }
          />
        </div>
        <FilmPanel title="What to say to finance">
          <ul className="flex flex-col gap-2.5">
            {billRemarks(run).map((remark) => (
              <li
                key={remark}
                className="border-l-2 border-line/70 pl-3 text-[13px] leading-snug text-film-text"
              >
                {remark}
              </li>
            ))}
          </ul>
        </FilmPanel>
      </div>
    </div>
  )
}

const VERDICT_ICON: Record<Tone, typeof Info> = {
  ok: CircleCheck,
  warn: TriangleAlert,
  bad: TriangleAlert,
  neutral: Info,
  info: Info,
  trace: Info,
}

/**
 * The X-Ray: the second half of the round. The interviewer changes one thing;
 * the design is re-run, and the run itself says which stage gives first, what
 * a dashboard would show, and which alert should already have fired.
 */
export function Pushbacks({ design, buyers }: { design: Design; buyers: number }) {
  const [id, setId] = useState<PushbackId>('double')
  const [subject, setSubject] = useState<'mine' | 'funnel'>('mine')
  const reduce = useReducedMotion()

  const subjectDesign = subject === 'mine' ? design : FUNNEL_DESIGN
  const planned: Scenario = useMemo(
    () => ({ buyers: Math.max(buyers, MISSION_BUYERS), faults: NO_FAULTS }),
    [buyers],
  )
  const pushback = PUSHBACKS.find((p) => p.id === id) ?? PUSHBACKS[0]!
  const plannedRun = useMemo(() => simulate(subjectDesign, planned), [subjectDesign, planned])
  const run = useMemo(
    () => simulate(subjectDesign, pushback.apply(planned)),
    [subjectDesign, planned, pushback],
  )
  const playback = usePlayback(TICKS, {
    stepMs: 130,
    autoPlay: !reduce,
    loop: true,
    resetKey: `${id}|${subject}`,
  })
  const signals = useMemo(() => signalsFor(id, run), [id, run])
  const verdict = useMemo(() => firstToGive(id, run), [id, run])
  const marks = useMemo(() => runMarks(run), [run])
  const VerdictIcon = VERDICT_ICON[verdict.tone]
  const plannedMisses = scorecard(plannedRun.summary).filter((t) => !t.met).length

  return (
    <Film
      title="The interviewer pushes on the design"
      right={
        <Segmented
          surface="film"
          size="sm"
          label="Which design to push on"
          value={subject}
          onChange={setSubject}
          options={[
            { value: 'mine', label: 'Your design' },
            { value: 'funnel', label: 'Reference funnel' },
          ]}
        />
      }
      footer={id === 'bill' ? undefined : <Scrubber playback={playback} marks={marks} />}
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="group" aria-label="Pushbacks">
        {PUSHBACKS.map((p, i) => {
          const active = p.id === id
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => setId(p.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150',
                active
                  ? 'border-trace bg-trace/10 text-film-text'
                  : 'border-film-rule text-film-muted hover:border-film-muted hover:text-film-text',
              )}
            >
              <span className={cn('num text-[11px]', active ? 'text-trace' : 'text-film-muted')}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="text-[13.5px] leading-tight font-medium">{p.title}</span>
            </button>
          )
        })}
      </div>

      <blockquote className="display mt-5 max-w-3xl text-[20px] leading-[1.32] font-[420] text-film-text italic">
        “{pushback.quote}”
      </blockquote>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="kicker mr-1 text-film-muted">
          {subject === 'mine' ? 'your design' : 'reference funnel'}
        </span>
        {describe(subjectDesign, plannedRun.summary.pods).map((choice) => (
          <Chip key={choice} surface="film">
            {choice}
          </Chip>
        ))}
      </div>

      {subject === 'mine' && plannedMisses > 0 && (
        <Callout surface="film" tone="info" icon={<Info size={17} />} className="mt-3">
          Your design is already missing {plannedMisses} of the five targets before anything is
          pushed, so each pushback lands on something that was broken anyway. Switch to the
          reference funnel to see what surviving one looks like, then go back and close the gap.
        </Callout>
      )}

      {id === 'bill' ? (
        <Bill run={run} />
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <Stage run={run} index={playback.index} />
            <div className="flex min-w-0 flex-col gap-3">
              <Callout
                surface="film"
                tone={verdict.tone}
                icon={<VerdictIcon size={18} />}
                title={verdict.headline}
              >
                <span className="text-[13.5px] leading-snug">{verdict.detail}</span>
              </Callout>
              <BeforeAfter planned={plannedRun} pushed={run} />
            </div>
          </div>

          <div className="mt-5">
            <div className="kicker text-film-muted">
              What the dashboard shows, and which alert should already have fired
            </div>
            <div className="mt-2.5 grid gap-3 md:grid-cols-3">
              {signals.map((signal) => (
                <SignalCard key={signal.id} signal={signal} index={playback.index} />
              ))}
            </div>
          </div>
        </>
      )}
    </Film>
  )
}
