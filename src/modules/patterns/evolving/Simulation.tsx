import { ArrowRight, Check, Minus, Plus, RotateCcw, TimerOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { CodePanel, type LineTone } from '@/components/CodePanel'
import { AnimatedNumber } from '@/components/Meter'
import { Button, Callout, Card, Chip, Kicker } from '@/components/ui'
import { cn } from '@/lib/cn'
import { QUOTA_SNIPPET, shapeSnippet } from './code'
import {
  buildMinutes,
  CLARIFY_MINUTES,
  clockFace,
  codeAt,
  PART_TITLE,
  PARTS,
  PURE_ARGUMENT_MINUTES,
  RESHAPE_MINUTES,
  SHAPE_META,
  simulate,
  TEST_ASSERTIONS,
  TEST_MINUTES,
  TOTAL_MINUTES,
  type Adapt,
  type CostKind,
  type Decisions,
  type Diff,
  type PartNumber,
  type PartResult,
  type Quota,
  type Shape,
  type Timeline,
} from './logic'

/* ── small pieces ─────────────────────────────────────────────────────── */

type Draft = {
  clarify: boolean | null
  shape: Shape | null
  test: boolean | null
  adapt: Adapt | null
  quota: Quota | null
}

const EMPTY: Draft = { clarify: null, shape: null, test: null, adapt: null, quota: null }
const SHAPES: Shape[] = ['branches', 'table', 'classes']

const KIND_BAR: Record<CostKind, string> = {
  build: 'bg-ink-2',
  habit: 'bg-line',
  rework: 'bg-bad',
}
const KIND_LABEL: Record<CostKind, string> = {
  build: 'the work',
  habit: 'time you chose to invest',
  rework: 'an earlier choice sending its bill',
}

function ChoiceCard({
  selected,
  onSelect,
  title,
  cost,
  children,
}: {
  selected: boolean
  onSelect: () => void
  title: ReactNode
  /** What it costs right now, e.g. "+2 min". Later costs stay hidden. */
  cost: string
  children?: ReactNode
}) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'flex min-w-0 cursor-pointer flex-col gap-2 rounded-xl border p-3.5 transition-colors duration-150',
        selected
          ? 'border-line bg-line/[0.06] shadow-card'
          : 'border-rule bg-card hover:border-rule-2',
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 text-white transition-colors duration-150',
            selected ? 'border-line bg-line' : 'border-rule-2',
          )}
          aria-hidden
        >
          {selected && <Check size={11} strokeWidth={3.5} />}
        </span>
        <span className="min-w-0 flex-1 text-[14.5px] leading-snug font-semibold text-ink">
          {title}
        </span>
        <span className="num shrink-0 rounded-md bg-paper-2 px-1.5 py-0.5 text-[11.5px] text-ink-2">
          {cost}
        </span>
      </div>
      {children}
    </div>
  )
}

function Question({
  n,
  title,
  label,
  columns,
  children,
}: {
  n: number
  title: string
  /** Accessible name of the radio group. */
  label: string
  columns: 2 | 3
  children: ReactNode
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="num flex size-6 items-center justify-center rounded-full border border-line/40 text-[11.5px] font-semibold text-line">
          {n}
        </span>
        <h4 className="text-[16px] font-[560]">{title}</h4>
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className={cn('mt-3 grid gap-3', columns === 3 ? 'lg:grid-cols-3' : 'sm:grid-cols-2')}
      >
        {children}
      </div>
    </div>
  )
}

function Interviewer({ part, children }: { part: PartNumber; children: ReactNode }) {
  return (
    <div className="relative rounded-xl border border-rule bg-paper-2/60 py-4 pr-5 pl-6">
      <span className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-line" aria-hidden />
      <Kicker className="text-line">
        Part {part} of 4 · the interviewer{part > 1 ? ' changes the requirement' : ''}
      </Kicker>
      <p className="display mt-2 max-w-3xl text-[18px] leading-[1.42] font-[420] text-ink [&_code]:font-mono [&_code]:text-[0.82em] [&_strong]:font-[640]">
        {children}
      </p>
    </div>
  )
}

function TimeBar({ parts }: { parts: PartResult[] }) {
  const segments: { key: string; kind: CostKind; minutes: number; label: string; edge: boolean }[] =
    []
  for (const p of parts) {
    let room = TOTAL_MINUTES - p.start
    p.costs.forEach((c, i) => {
      const shown = Math.max(0, Math.min(c.minutes, room))
      room -= shown
      if (shown > 0) {
        segments.push({
          key: `${p.part}-${i}`,
          kind: c.kind,
          minutes: shown,
          label: `Part ${p.part}: ${c.label}, ${c.minutes} min`,
          edge: i === 0 && p.part > 1,
        })
      }
    })
  }
  return (
    <div>
      <div
        className="flex h-5 overflow-hidden rounded-md bg-paper-3"
        role="img"
        aria-label={`Clock used: ${segments.reduce((s, x) => s + x.minutes, 0)} of ${TOTAL_MINUTES} minutes`}
      >
        {segments.map((s, i) => (
          <motion.div
            key={s.key}
            title={s.label}
            className={cn('h-full', KIND_BAR[s.kind], s.edge && 'border-l-2 border-card')}
            initial={{ width: 0 }}
            animate={{ width: `${(s.minutes / TOTAL_MINUTES) * 100}%` }}
            transition={{ duration: 0.5, delay: 0.12 * (i % 4), ease: [0.2, 0.7, 0.2, 1] }}
          />
        ))}
      </div>
      <div className="num mt-1 flex justify-between text-[10.5px] text-ink-3">
        <span>0</span>
        <span>15</span>
        <span>30</span>
        <span>45 min</span>
      </div>
    </div>
  )
}

/** Lines kept, changed and added, drawn to an absolute scale so a rewrite looks like one. */
function DiffBar({ diff }: { diff: Diff }) {
  const scale = 96
  const parts: { key: string; n: number; bar: string; text: string }[] = [
    { key: 'kept', n: diff.kept, bar: 'bg-ink-3/40', text: 'text-ink-2' },
    { key: 'changed', n: diff.changed, bar: 'bg-warn', text: 'text-warn' },
    { key: 'added', n: diff.added, bar: 'bg-ok', text: 'text-ok' },
  ]
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-paper-3">
        {parts.map((p, i) => (
          <motion.div
            key={p.key}
            className={cn('h-full', p.bar)}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, (p.n / scale) * 100)}%` }}
            transition={{ duration: 0.6, delay: 0.25 + i * 0.18, ease: [0.2, 0.7, 0.2, 1] }}
          />
        ))}
      </div>
      <p className="num mt-1.5 flex flex-wrap gap-x-3 text-[12px]">
        {parts.map((p) => (
          <span key={p.key} className={p.text}>
            {p.n} {p.key}
          </span>
        ))}
        <span className="text-ink-3">lines</span>
      </p>
    </div>
  )
}

/* ── one part's report ────────────────────────────────────────────────── */

export function Report({ decisions, result }: { decisions: Decisions; result: PartResult }) {
  const view = codeAt(decisions, result.part)
  const tones: Record<number, LineTone> = {}
  for (const n of view.addedLines) tones[n] = 'add'
  const rework = result.costs.filter((c) => c.kind === 'rework').reduce((s, c) => s + c.minutes, 0)
  const short = result.minutes - result.spent

  let tests: string
  if (result.testsBroken === null) {
    tests =
      result.part === 1
        ? 'No test. It works on the examples you tried by hand.'
        : 'No test, so nothing failed, and nothing told you what else had moved.'
  } else if (result.part === 1) {
    tests = `${TEST_ASSERTIONS} assertions, all passing. You will want them in about five minutes.`
  } else {
    tests = `${result.testsBroken} of ${TEST_ASSERTIONS} assertions failed when the twist landed. That is the test doing its job: it showed exactly what changed.`
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Kicker className="text-line">
            Part {result.part} · {result.part === 1 ? 'how it went' : 'how the twist landed'}
          </Kicker>
          <Chip tone={result.completed ? 'ok' : 'bad'} dot>
            {result.completed ? `done in ${result.minutes} min` : 'out of time'}
          </Chip>
          {rework > 0 && <Chip tone="bad">{rework} min of rework</Chip>}
        </div>
        <p className="display mt-2 max-w-3xl text-[clamp(1.2rem,2.2vw,1.5rem)] leading-snug font-[520]">
          {result.headline}
        </p>
      </div>

      {!result.completed && (
        <Callout tone="bad" icon={<TimerOff size={18} />} title="Time.">
          The clock ran out {result.spent} {result.spent === 1 ? 'minute' : 'minutes'} into Part{' '}
          {result.part}. On this path it needed {result.minutes}, so you were {short}{' '}
          {short === 1 ? 'minute' : 'minutes'} short.
        </Callout>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col gap-5">
          <div>
            <Kicker>Where the minutes went</Kicker>
            <ul className="mt-2 divide-y divide-rule border-y border-rule">
              {result.costs.map((c, i) => (
                <li key={i} className="flex items-start gap-3 py-2">
                  <span
                    className={cn('mt-1.5 size-2.5 shrink-0 rounded-sm', KIND_BAR[c.kind])}
                    title={KIND_LABEL[c.kind]}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 text-[13.5px] leading-snug',
                      c.kind === 'rework' ? 'font-medium text-bad' : 'text-ink-2',
                    )}
                  >
                    {c.label}
                    <span className="sr-only"> ({KIND_LABEL[c.kind]})</span>
                  </span>
                  <span
                    className={cn(
                      'num shrink-0 text-[13px]',
                      c.kind === 'rework' ? 'text-bad' : 'text-ink',
                    )}
                  >
                    {c.minutes} min
                  </span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-[13.5px] font-semibold text-ink">Part {result.part}</span>
                <span className="num text-[13px] font-semibold text-ink">{result.minutes} min</span>
              </li>
            </ul>
          </div>

          <div>
            <Kicker>Lines of code touched</Kicker>
            <div className="mt-2">
              <DiffBar diff={result.diff} />
            </div>
          </div>

          <div>
            <Kicker>Tests</Kicker>
            <p className="mt-1.5 text-[13.5px] leading-snug text-ink-2">{tests}</p>
          </div>
        </div>

        <CodePanel
          surface="paper"
          lang="python"
          title={view.excerpt ? 'fees.py · what it looks like now (excerpt)' : 'fees.py · your code now'}
          code={view.code}
          tones={tones}
          maxHeight={388}
        />
      </div>
    </div>
  )
}

/* ── the end of the round ─────────────────────────────────────────────── */

export function EndScreen({ timeline, onReset }: { timeline: Timeline; onReset: () => void }) {
  const stuck = timeline.parts.find((p) => p.reached && !p.completed)
  const reached = timeline.parts.filter((p) => p.reached)
  const spentOn = (kind: CostKind) => {
    let total = 0
    for (const p of reached) {
      let room = p.spent
      for (const c of p.costs) {
        const shown = Math.max(0, Math.min(c.minutes, room))
        room -= shown
        if (c.kind === kind) total += shown
      }
    }
    return total
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <Kicker>Parts completed</Kicker>
          <div
            className={cn(
              'num mt-1 text-[44px] leading-none font-medium',
              timeline.finished ? 'text-ok' : 'text-bad',
            )}
          >
            {timeline.completedParts}
            <span className="text-[20px] text-ink-3"> of 4</span>
          </div>
        </div>
        <div>
          <Kicker>{timeline.finished ? 'Time left' : 'Ran out in'}</Kicker>
          <div className="num mt-1 text-[44px] leading-none font-medium text-ink">
            {timeline.finished ? clockFace(timeline.minutesLeft) : `Part ${stuck?.part ?? 4}`}
          </div>
        </div>
        <div className="flex gap-5 pb-1">
          {(['build', 'habit', 'rework'] as CostKind[]).map((kind) => (
            <div key={kind} className="flex items-center gap-2">
              <span className={cn('size-2.5 rounded-sm', KIND_BAR[kind])} aria-hidden />
              <span className="text-[13px] text-ink-2">
                <span className="num text-ink">{spentOn(kind)} min</span>{' '}
                {kind === 'build' ? 'building' : kind === 'habit' ? 'on habits' : 'on rework'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-rule bg-paper-2/60 p-5">
          <Kicker>The interviewer's notes</Kicker>
          <ul className="mt-3 flex flex-col gap-2.5">
            {timeline.notes.map((note, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.15 + i * 0.12 }}
                className="flex items-start gap-2.5"
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full',
                    note.good ? 'bg-ok-wash text-ok' : 'bg-bad-wash text-bad',
                  )}
                  aria-hidden
                >
                  {note.good ? (
                    <Plus size={12} strokeWidth={3} />
                  ) : (
                    <Minus size={12} strokeWidth={3} />
                  )}
                </span>
                <span className="display text-[15.5px] leading-snug font-[430] text-ink italic">
                  <span className="sr-only">{note.good ? 'Plus: ' : 'Minus: '}</span>
                  {note.text}
                </span>
              </motion.li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <Kicker>How a panel is likely to read it</Kicker>
            <p className="display mt-2 text-[19px] leading-snug font-[520] text-ink">
              {timeline.verdict}
            </p>
          </div>
          <p className="text-[13.5px] leading-relaxed text-ink-3">
            The minutes are a teaching model, not a measurement. What it preserves is the direction
            of each trade-off: what a choice costs now against what it costs once the requirement
            moves.
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={onReset} icon={<RotateCcw size={15} />}>
              Run the round again
            </Button>
            <span className="text-[13px] text-ink-3">
              {timeline.finished
                ? 'Try another shape and watch where it bleeds.'
                : 'Change one decision and see what it buys you.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── the simulation ───────────────────────────────────────────────────── */

export function Simulation({
  onEnd,
}: {
  /** Called once per run, when the interviewer's notes are revealed. */
  onEnd: (decisions: Decisions, timeline: Timeline) => void
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY)
  /** Parts whose result has been revealed. */
  const [played, setPlayed] = useState(0)
  const [view, setView] = useState<'decide' | 'report' | 'end'>('decide')

  const decisions: Decisions = useMemo(
    () => ({
      clarify: draft.clarify ?? false,
      shape: draft.shape ?? 'table',
      test: draft.test ?? false,
      adapt: draft.adapt ?? 'patch',
      quota: draft.quota ?? 'argument',
    }),
    [draft],
  )
  const timeline = useMemo(() => simulate(decisions), [decisions])

  const playedParts = timeline.parts.slice(0, played)
  const last = playedParts[playedParts.length - 1]
  const elapsed = last ? Math.min(TOTAL_MINUTES, last.start + last.spent) : 0
  const timeUp = Boolean(last && !last.completed)
  const over = timeUp || played === PARTS.length
  const nextPart = Math.min(played + 1, PARTS.length) as PartNumber
  const left = TOTAL_MINUTES - elapsed
  const cents = draft.clarify === true

  const ready =
    nextPart === 1
      ? draft.clarify !== null && draft.shape !== null && draft.test !== null
      : nextPart === 2
        ? draft.shape !== 'branches' || draft.adapt !== null
        : nextPart === 3
          ? draft.quota !== null
          : true

  const play = () => {
    setPlayed(nextPart)
    setView('report')
  }
  const advance = () => {
    if (over) {
      setView('end')
      onEnd(decisions, timeline)
    } else {
      setView('decide')
    }
  }
  const reset = () => {
    setDraft(EMPTY)
    setPlayed(0)
    setView('decide')
  }
  const set = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }))

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-rule px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <Kicker>Your move</Kicker>
          <h3 className="mt-1 text-[19px] leading-tight font-[560]">
            Get through all four parts before the clock runs out
          </h3>
        </div>
        <div className="text-right">
          <div className="kicker text-ink-3">time left</div>
          <AnimatedNumber
            value={left}
            format={clockFace}
            className={cn(
              'text-[34px] leading-none font-medium transition-colors duration-300',
              timeUp ? 'text-bad' : left <= 8 ? 'text-warn' : 'text-ink',
            )}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-rule bg-paper-2/40 px-5 py-3.5">
        <TimeBar parts={playedParts} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ol className="flex flex-wrap gap-1.5" aria-label="Parts">
            {PARTS.map((part) => {
              const result = timeline.parts[part - 1]!
              const isPlayed = part <= played
              const current = !over && view === 'decide' && part === nextPart
              return (
                <li
                  key={part}
                  className={cn(
                    'num flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px]',
                    isPlayed
                      ? result.completed
                        ? 'border-ok/30 bg-ok-wash text-ok'
                        : 'border-bad/30 bg-bad-wash text-bad'
                      : current
                        ? 'border-line bg-card text-ink'
                        : 'border-rule text-ink-3',
                  )}
                  title={PART_TITLE[part]}
                >
                  P{part}
                  {isPlayed && (
                    <span>{result.completed ? `${result.minutes} min` : 'out of time'}</span>
                  )}
                </li>
              )
            })}
          </ol>
          <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1">
            {(['build', 'habit', 'rework'] as CostKind[]).map((kind) => (
              <span key={kind} className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                <span className={cn('size-2.5 rounded-sm', KIND_BAR[kind])} aria-hidden />
                {KIND_LABEL[kind]}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${view}-${view === 'decide' ? nextPart : played}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {view === 'decide' && nextPart === 1 && (
              <div className="flex flex-col gap-6">
                <Interviewer part={1}>
                  We charge a flat fee per payout, by currency: <strong>S$0.50</strong>,{' '}
                  <strong>US$1.00</strong>, <strong>RM1.50</strong>. Write{' '}
                  <code>payout_fee(currency, amount)</code>. There will be follow-ups.
                </Interviewer>

                <Question n={1} title="Before you type" label="Ask first or start typing" columns={2}>
                  <ChoiceCard
                    selected={draft.clarify === true}
                    onSelect={() => set({ clarify: true })}
                    title="Ask first"
                    cost={`+${CLARIFY_MINUTES} min`}
                  >
                    <p className="text-[13.5px] leading-snug text-ink-2">
                      “Is the amount in dollars or in cents? And how should a fee round?”
                    </p>
                  </ChoiceCard>
                  <ChoiceCard
                    selected={draft.clarify === false}
                    onSelect={() => set({ clarify: false })}
                    title="Start typing"
                    cost="+0 min"
                  >
                    <p className="text-[13.5px] leading-snug text-ink-2">
                      The examples look like dollars. The clock is running. Go.
                    </p>
                  </ChoiceCard>
                </Question>
                <AnimatePresence initial={false}>
                  {draft.clarify === true && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="-mt-3 overflow-hidden"
                    >
                      <Callout tone="ok" title="The interviewer answers">
                        “Integer cents. Fees round half up to the nearest cent. Good question.” The
                        snippets below now say so.
                      </Callout>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Question n={2} title="The shape of the code" label="Shape of the Part 1 code" columns={3}>
                  {SHAPES.map((shape) => (
                    <ChoiceCard
                      key={shape}
                      selected={draft.shape === shape}
                      onSelect={() => set({ shape })}
                      title={SHAPE_META[shape].name}
                      cost={`${buildMinutes(1, shape)} min`}
                    >
                      <p className="text-[13px] leading-snug text-ink-2">
                        {SHAPE_META[shape].pitch}
                      </p>
                      <CodePanel
                        surface="paper"
                        lang="python"
                        code={shapeSnippet(shape, cents)}
                        maxHeight={206}
                        className="mt-auto"
                      />
                    </ChoiceCard>
                  ))}
                </Question>

                <Question n={3} title="Before you say “done”" label="Write a test or move on" columns={2}>
                  <ChoiceCard
                    selected={draft.test === true}
                    onSelect={() => set({ test: true })}
                    title="Write a five-line test"
                    cost={`+${TEST_MINUTES} min`}
                  >
                    <p className="text-[13.5px] leading-snug text-ink-2">
                      Three payouts, three expected fees, one loop of assertions.
                    </p>
                  </ChoiceCard>
                  <ChoiceCard
                    selected={draft.test === false}
                    onSelect={() => set({ test: false })}
                    title="Say “done” and move on"
                    cost="+0 min"
                  >
                    <p className="text-[13.5px] leading-snug text-ink-2">
                      It is a lookup. You ran it once and it printed the right number.
                    </p>
                  </ChoiceCard>
                </Question>
              </div>
            )}

            {view === 'decide' && nextPart === 2 && (
              <div className="flex flex-col gap-6">
                <Interviewer part={2}>
                  Good. Finance now wants tiered pricing. Up to <strong>S$1,000</strong> the fee
                  stays flat. Above that it is <strong>0.8% of the amount</strong>, capped at S$20.
                  Each currency has its own numbers.
                </Interviewer>
                {draft.shape === 'branches' ? (
                  <Question n={1} title="How do you take the twist?" label="Patch or reshape" columns={2}>
                    <ChoiceCard
                      selected={draft.adapt === 'patch'}
                      onSelect={() => set({ adapt: 'patch' })}
                      title="Patch it in place"
                      cost={`${buildMinutes(2, 'branches')} min`}
                    >
                      <p className="text-[13.5px] leading-snug text-ink-2">
                        Add the tier check inside each currency branch. It is only three branches.
                      </p>
                    </ChoiceCard>
                    <ChoiceCard
                      selected={draft.adapt === 'refactor'}
                      onSelect={() => set({ adapt: 'refactor' })}
                      title="Stop and reshape"
                      cost={`${RESHAPE_MINUTES} min`}
                    >
                      <p className="text-[13.5px] leading-snug text-ink-2">
                        Say it out loud: “This is the second kind of rule, so I'll move the numbers
                        into a table first.” Then add the bands.
                      </p>
                    </ChoiceCard>
                  </Question>
                ) : (
                  <p className="text-[14px] text-ink-2">
                    Nothing to choose here. The shape you picked in Part 1 decides what this costs.
                  </p>
                )}
              </div>
            )}

            {view === 'decide' && nextPart === 3 && (
              <div className="flex flex-col gap-6">
                <Interviewer part={3}>
                  Two changes. Enterprise merchants negotiate their own schedule, so{' '}
                  <strong>a merchant can override</strong> the default for a currency. And every
                  merchant's <strong>first 3 payouts each month are free</strong>.
                </Interviewer>
                <Question
                  n={1}
                  title="Where does the free-payout count live?"
                  label="Where the free-payout count lives"
                  columns={2}
                >
                  <ChoiceCard
                    selected={draft.quota === 'counter'}
                    onSelect={() => set({ quota: 'counter' })}
                    title="Count inside the function"
                    cost="+0 min"
                  >
                    <p className="text-[13px] leading-snug text-ink-2">
                      A module-level counter. Callers do not have to change.
                    </p>
                    <CodePanel
                      surface="paper"
                      lang="python"
                      code={QUOTA_SNIPPET.counter}
                      className="mt-auto"
                    />
                  </ChoiceCard>
                  <ChoiceCard
                    selected={draft.quota === 'argument'}
                    onSelect={() => set({ quota: 'argument' })}
                    title="Take the count as an argument"
                    cost={`+${PURE_ARGUMENT_MINUTES} min`}
                  >
                    <p className="text-[13px] leading-snug text-ink-2">
                      One more parameter, and every caller has to pass it.
                    </p>
                    <CodePanel
                      surface="paper"
                      lang="python"
                      code={QUOTA_SNIPPET.argument}
                      className="mt-auto"
                    />
                  </ChoiceCard>
                </Question>
              </div>
            )}

            {view === 'decide' && nextPart === 4 && (
              <div className="flex flex-col gap-6">
                <Interviewer part={4}>
                  Last one. Fee schedules change on a date: a new SGD schedule took effect on{' '}
                  <strong>the 15th</strong>. Finance needs last month's statement for one merchant{' '}
                  <strong>re-computed</strong>, using whichever schedule was in force on each
                  payout's day.
                </Interviewer>
                <p className="text-[14px] text-ink-2">
                  Nothing left to choose. This part is paid for by what you chose earlier.
                </p>
              </div>
            )}

            {view === 'report' && last && <Report decisions={decisions} result={last} />}
            {view === 'end' && <EndScreen timeline={timeline} onReset={reset} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {view !== 'end' && (
        <div className="flex flex-wrap items-center gap-3 border-t border-rule bg-paper-2/50 px-5 py-3.5">
          {view === 'decide' ? (
            <>
              {played > 0 && (
                <Button variant="ghost" size="sm" onClick={reset} icon={<RotateCcw size={14} />}>
                  Start over
                </Button>
              )}
              <span className="text-[13.5px] text-ink-3" aria-live="polite">
                {ready
                  ? nextPart === 1
                    ? 'Each card shows what it costs now. What it costs later, you find out.'
                    : `${clockFace(left)} on the clock.`
                  : nextPart === 1
                    ? 'Answer all three to start the clock.'
                    : 'Make the choice to continue.'}
              </span>
              <Button
                variant="line"
                className="ml-auto"
                onClick={play}
                disabled={!ready}
                iconRight={<ArrowRight size={16} />}
              >
                {nextPart === 1 ? 'Start the clock' : `Take the twist: Part ${nextPart}`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={reset} icon={<RotateCcw size={14} />}>
                Start over
              </Button>
              <Button
                variant="line"
                className="ml-auto"
                onClick={advance}
                iconRight={<ArrowRight size={16} />}
              >
                {over ? "See the interviewer's notes" : `Next: Part ${nextPart}`}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
