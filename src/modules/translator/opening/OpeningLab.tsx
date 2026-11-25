import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, Scissors } from 'lucide-react'
import { Reorder } from 'motion/react'
import { useMemo, useState } from 'react'
import { Brief } from '@/components/Brief'
import { Film, FilmPanel } from '@/components/Film'
import { HintLadder } from '@/components/HintLadder'
import { AnimatedNumber, Sparkline } from '@/components/Meter'
import { Scrubber } from '@/components/Scrubber'
import { Takeaway } from '@/components/Takeaway'
import { Button, Card, Chip, Kicker, Segmented } from '@/components/ui'
import { clamp, cn, type Tone } from '@/lib/cn'
import { usePlayback } from '@/lib/usePlayback'
import { Anatomy, SignalLegend } from '../Anatomy'
import {
  CV_ORDER,
  LINE_BY_ID,
  LINE_INFO,
  OPENING_LINES,
  REFERENCE_ORDER,
  ROLE_LABEL,
} from '../content/opening'
import { ImpressionGauge, NoteList, NoteMark } from '../Gauges'
import {
  lineEffect,
  OPENING_BUDGET_SECONDS,
  readOpening,
  speakingSeconds,
  tally,
  type LineRole,
  type OpeningReading,
} from '../logic'

const TIME_SCALE = 120

const clock = (seconds: number) => {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const lineSeconds = (id: string) => speakingSeconds(LINE_BY_ID[id]?.words ?? 0)

/** When each line starts, in seconds, if the lines are spoken in this order. */
function startTimes(order: string[]): number[] {
  const starts: number[] = []
  let elapsed = 0
  for (const id of order) {
    starts.push(elapsed)
    elapsed += lineSeconds(id)
  }
  return starts
}

/* ── Struggle: rebuild the opening ────────────────────────────────────── */

function TimeBar({ reading }: { reading: OpeningReading }) {
  const over = !reading.withinBudget
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Kicker>Speaking time</Kicker>
        <span className={cn('num text-[13px]', over ? 'text-bad' : 'text-ink')}>
          <AnimatedNumber value={reading.seconds} format={(n) => `${Math.round(n)}s`} />
          <span className="text-ink-3"> / {OPENING_BUDGET_SECONDS}s</span>
        </span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-paper-3">
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out',
            over ? 'bg-bad' : 'bg-ink-2',
          )}
          style={{ width: `${clamp((reading.seconds / TIME_SCALE) * 100, 0, 100)}%` }}
        />
        <div
          className="absolute -top-1 h-4 w-px bg-ink"
          style={{ left: `${(OPENING_BUDGET_SECONDS / TIME_SCALE) * 100}%` }}
          aria-hidden
        />
      </div>
      <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
        {reading.words} words at a comfortable 150 a minute.{' '}
        {over ? 'Past the mark, the panel stops listening and starts waiting.' : 'Inside the mark.'}
      </p>
    </div>
  )
}

function Challenge({
  order,
  onOrder,
  reading,
}: {
  order: string[]
  onOrder: (next: string[]) => void
  reading: OpeningReading
}) {
  const cut = OPENING_LINES.filter((l) => !order.includes(l.id))
  const isCvOrder = order.join() === CV_ORDER.join()

  const move = (id: string, delta: number) => {
    const from = order.indexOf(id)
    const to = clamp(from + delta, 0, order.length - 1)
    if (from === -1 || from === to) return
    const next = [...order]
    next.splice(from, 1)
    next.splice(to, 0, id)
    onOrder(next)
  }

  const iconButton =
    'inline-flex size-7 items-center justify-center rounded-md text-ink-3 transition-colors duration-150 hover:bg-paper-2 hover:text-ink disabled:pointer-events-none disabled:opacity-25'

  const starts = startTimes(order)

  return (
    <Card className="overflow-clip">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-5 py-3.5">
        <div className="min-w-0">
          <Kicker>Your move</Kicker>
          <h3 className="mt-1 text-[19px] leading-tight font-[560]">
            Rebuild this opening so the panel hears an engineer who can lead
          </h3>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Chip>{order.length} of 8 lines in</Chip>
          <Chip tone={reading.withinBudget ? 'neutral' : 'bad'}>
            {Math.round(reading.seconds)}s of {OPENING_BUDGET_SECONDS}s
          </Chip>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]">
        <div className="min-w-0">
          <p className="text-[13.5px] leading-relaxed text-ink-3">
            This is the opening a CV suggests: credentials first, in the order they are listed.
            Drag a line to move it, or use the arrows. Cut whatever does not earn its seconds. The
            words stay the same; only the order and the cut change.
          </p>

          <Reorder.Group
            as="ol"
            axis="y"
            values={order}
            onReorder={onOrder}
            className="mt-3 flex flex-col gap-2"
          >
            {order.map((id, i) => {
              const line = LINE_BY_ID[id]!
              const seconds = lineSeconds(id)
              const startsAt = starts[i]!
              const pastCut = startsAt + seconds > OPENING_BUDGET_SECONDS + 0.01
              return (
                <Reorder.Item
                  key={id}
                  value={id}
                  as="li"
                  whileDrag={{ scale: 1.015, boxShadow: '0 14px 30px -16px rgba(26,26,31,0.4)' }}
                  className={cn(
                    'relative flex cursor-grab items-start gap-2 rounded-xl border bg-card py-3 pr-2 pl-1.5 select-none active:cursor-grabbing',
                    pastCut ? 'border-bad/40' : 'border-rule',
                  )}
                >
                  <GripVertical size={16} className="mt-1 shrink-0 text-ink-3/70" aria-hidden />
                  <span className="num mt-0.5 w-5 shrink-0 text-[12px] text-ink-3">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <Kicker className="text-ink-2">{line.label}</Kicker>
                      <span className="num text-[11px] text-ink-3">
                        {clock(startsAt)} · {Math.round(seconds)}s
                      </span>
                      {pastCut && (
                        <Chip tone="bad" className="py-0 leading-[18px]">
                          past {OPENING_BUDGET_SECONDS}s
                        </Chip>
                      )}
                    </div>
                    <p className="mt-1 text-[14.5px] leading-[1.45] text-ink">{line.text}</p>
                  </div>
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      className={iconButton}
                      onClick={() => move(id, -1)}
                      disabled={i === 0}
                      aria-label={`Move “${line.label}” earlier`}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      onClick={() => move(id, 1)}
                      disabled={i === order.length - 1}
                      aria-label={`Move “${line.label}” later`}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      className={iconButton}
                      onClick={() => onOrder(order.filter((x) => x !== id))}
                      aria-label={`Cut “${line.label}” from the opening`}
                      title="Cut this line"
                    >
                      <Scissors size={14} />
                    </button>
                  </div>
                </Reorder.Item>
              )
            })}
          </Reorder.Group>

          {order.length === 0 && (
            <p className="mt-3 rounded-xl border border-dashed border-rule-2 px-4 py-6 text-center text-[13.5px] text-ink-3">
              Nothing left to say. Put a line back from below.
            </p>
          )}

          {cut.length > 0 && (
            <div className="mt-4">
              <Kicker>Cut from the opening</Kicker>
              <ul className="mt-2 flex flex-col gap-1.5">
                {cut.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-center gap-3 rounded-lg border border-dashed border-rule-2 py-1.5 pr-1.5 pl-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-3">
                      <span className="font-medium text-ink-2">{line.label}.</span> {line.text}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Plus size={14} />}
                      onClick={() => onOrder([...order, line.id])}
                      aria-label={`Put “${line.label}” back at the end`}
                    >
                      Put back
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-rule bg-paper-2/60 p-4">
            <Kicker>What the panel hears</Kicker>
            <p
              className="display mt-1.5 text-[23px] leading-[1.12] font-[560] text-ink"
              aria-live="polite"
            >
              {reading.label}
            </p>
            <ImpressionGauge score={reading.score} band={reading.band} className="mt-3" />
            <div className="mt-4 border-t border-rule pt-3">
              <Kicker>Interviewer's notes</Kicker>
              <NoteList notes={reading.notes.slice(0, 3)} className="mt-2.5" />
            </div>
            <div className="mt-4 border-t border-rule pt-3">
              <TimeBar reading={reading} />
            </div>
          </div>
        </aside>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-rule bg-paper-2/50 px-5 py-3">
        <p className="min-w-0 flex-1 text-[13px] text-ink-3">
          These eight lines stand in for your own career. Once the shape is right, rewrite each one
          with your systems and your numbers.
        </p>
        <Button
          variant="ghost"
          size="sm"
          icon={<RotateCcw size={14} />}
          onClick={() => onOrder(CV_ORDER)}
          disabled={isCvOrder}
        >
          Back to the CV order
        </Button>
      </div>
    </Card>
  )
}

/* ── X-Ray: the impression forming, line by line ──────────────────────── */

const ROLE_TONE: Record<LineRole, Tone> = {
  proof: 'trace',
  lead: 'info',
  credential: 'neutral',
  process: 'bad',
  close: 'neutral',
}

/** Exported so the render test can mount it directly. */
export function XRay({ order }: { order: string[] }) {
  const hasOwn = order.length > 0
  const [which, setWhich] = useState<'mine' | 'reference'>(hasOwn ? 'mine' : 'reference')
  const replay = which === 'mine' && hasOwn ? order : REFERENCE_ORDER

  const playback = usePlayback(replay.length, {
    stepMs: 2400,
    resetKey: `${which}|${replay.join(',')}`,
  })
  const index = playback.index

  const readings = useMemo(
    () => replay.map((_, i) => readOpening(replay.slice(0, i + 1), LINE_INFO)),
    [replay],
  )
  const effects = useMemo(() => replay.map((_, i) => lineEffect(replay, i, LINE_INFO)), [replay])
  const current = readings[index]!
  const effect = effects[index]!

  const columns = useMemo(() => {
    const reference = {
      label: 'Reference',
      tally: tally(REFERENCE_ORDER.map((id) => LINE_BY_ID[id]!)),
    }
    return hasOwn
      ? [{ label: 'Yours', tally: tally(order.map((id) => LINE_BY_ID[id]!)) }, reference]
      : [reference]
  }, [order, hasOwn])

  const marks = useMemo(
    () =>
      effects.flatMap((e, i) =>
        e.tone === 'ok' ? [] : [{ index: i, tone: e.tone === 'bad' ? ('bad' as Tone) : ('warn' as Tone) }],
      ),
    [effects],
  )

  const starts = startTimes(replay)

  return (
    <Film
      title="How the impression forms, one line at a time"
      footer={
        <Scrubber
          playback={playback}
          marks={marks}
          caption={
            <span className="flex items-start gap-2.5">
              <NoteMark tone={effect.tone} surface="film" />
              <span>{effect.text}</span>
            </span>
          }
        />
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          surface="film"
          label="Which opening to replay"
          value={which}
          onChange={setWhich}
          options={[
            {
              value: 'mine',
              label: 'Your opening',
              disabled: !hasOwn,
              title: hasOwn ? undefined : 'You cut every line',
            },
            { value: 'reference', label: 'A strong reference' },
          ]}
        />
        <p className="text-[12.5px] text-film-muted">
          Every span is marked by what it gives the panel. Hover one to see what it is.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,21.5rem)]">
        <ol className="flex flex-col gap-2">
          {replay.map((id, i) => {
            const line = LINE_BY_ID[id]!
            const startsAt = starts[i]!
            const spoken = i <= index
            const active = i === index
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => {
                    playback.pause()
                    playback.setIndex(i)
                  }}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'w-full rounded-xl border px-3.5 py-3 text-left transition-[opacity,border-color,background-color] duration-300',
                    active
                      ? 'border-trace/60 bg-trace/[0.06]'
                      : 'border-film-rule bg-film-2/60 hover:border-film-muted/60',
                    !spoken && 'opacity-40',
                  )}
                >
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="num text-[11px] text-film-muted">{clock(startsAt)}</span>
                    <span className="kicker text-film-text">{line.label}</span>
                    <Chip surface="film" tone={ROLE_TONE[line.role]} className="py-0 leading-[18px]">
                      {ROLE_LABEL[line.role]}
                    </Chip>
                    {spoken && (
                      <span className="num ml-auto text-[12px] text-film-muted">
                        → {readings[i]!.score}
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 block text-[14.5px] leading-[1.6] text-film-text">
                    <Anatomy pieces={line.pieces} />
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="flex flex-col gap-4">
          <FilmPanel title="what the panel believes so far">
            <p className="display text-[21px] leading-tight font-[540] text-film-text">
              {current.label}
            </p>
            <ImpressionGauge
              surface="film"
              score={current.score}
              band={current.band}
              className="mt-3"
            />
            <div className="mt-4">
              <Sparkline
                data={readings.map((r) => r.score)}
                max={100}
                threshold={80}
                cursor={index}
                height={46}
                tone={current.band === 'lead' ? 'ok' : current.band === 'pm' ? 'bad' : 'trace'}
                label="Impression after each line, from 0 to 100"
              />
              <p className="mt-1 text-[11.5px] leading-snug text-film-muted">
                The dashed line is where “engineer who can lead” begins. Notice which line crosses
                it, and that nothing rescues a bad first one.
              </p>
            </div>
          </FilmPanel>

          <FilmPanel title="signal tally · whole opening">
            <SignalLegend columns={columns} />
          </FilmPanel>
        </div>
      </div>
    </Film>
  )
}

/* ── the lab ──────────────────────────────────────────────────────────── */

const PANEL_QUESTIONS: [string, string][] = [
  ['Is this an engineer?', 'Settled by your first line, and hard to change afterwards.'],
  ['At what level?', 'Settled by scale, numbers, and what you owned when it broke.'],
  [
    'What is unusual about them?',
    'Where a PMP and CPMAI can help, if they arrive in the right place.',
  ],
]

export default function OpeningLab() {
  const [order, setOrder] = useState<string[]>(CV_ORDER)
  const reading = useMemo(() => readOpening(order, LINE_INFO), [order])
  const solved = reading.band === 'lead'

  return (
    <div className="flex flex-col gap-8">
      <Brief
        tags={['Every loop', 'The first question', '90 seconds']}
        aside={
          <div className="flex h-full flex-col justify-center gap-3 px-2 py-1">
            <Kicker>What the panel decides while you talk</Kicker>
            <ol className="flex flex-col gap-2.5">
              {PANEL_QUESTIONS.map(([question, answer], i) => (
                <li key={question} className="flex gap-3">
                  <span className="num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-line/40 text-[11px] font-semibold text-line">
                    {i + 1}
                  </span>
                  <span className="min-w-0 text-[14px] leading-snug">
                    <span className="font-semibold text-ink">{question}</span>{' '}
                    <span className="text-ink-2">{answer}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        }
      >
        <p>
          Before we get technical: <strong>tell me about yourself.</strong>
        </p>
        <p>
          You have about ninety seconds. By the end of your first sentence I will have decided what
          kind of candidate I am talking to.
        </p>
      </Brief>

      <HintLadder
        id="translator/opening"
        solved={solved}
        struggle={<Challenge order={order} onOrder={setOrder} reading={reading} />}
        nudge={
          <>
            <p>
              <strong>Order is the message.</strong> The panel decides what you are during your
              first sentence, and hears everything after it through that decision.
            </p>
            <p>
              What would you have to say first for the certifications to sound like a bonus rather
              than the headline? And which line here contains nothing an interviewer could write
              down?
            </p>
          </>
        }
        xray={<XRay order={order} />}
        takeaway={
          <Takeaway
            headline="Order is the message. Say what you built before you say what you hold."
            points={[
              {
                title: 'The first line sets the frame for every line after it',
                body: (
                  <p>
                    Open with a system, its scale, and a verb with you as the subject. Lead with a
                    certificate and the same systems, said thirty seconds later, are heard as
                    background on a project manager. The replay shows it: good material cannot
                    undo a first line.
                  </p>
                ),
              },
              {
                title: 'Two proofs before one credential',
                body: (
                  <p>
                    One example is an anecdote; two is a pattern. A system with numbers, then an
                    incident or a hard call you owned. Only then does the panel have somewhere to
                    put a PMP, and it lands as range instead of as identity.
                  </p>
                ),
              },
              {
                title: 'Translate the credential in the same breath',
                body: (
                  <p>
                    Never leave “PMP” standing as a bare noun. Attach what it changes about how you
                    engineer: a staged rollout, a rollback you have rehearsed, a number that says
                    stop. For CPMAI: data readiness and an evaluation set before any argument about
                    models.
                  </p>
                ),
              },
              {
                title: 'Do not hide it either',
                body: (
                  <p>
                    Cutting the certifications to avoid the label wastes the one thing most
                    engineers in the queue cannot say. For AI systems and forward-deployed roles,
                    an engineer who can de-risk delivery is exactly the hire. It only has to come
                    second.
                  </p>
                ),
              },
            ]}
            facts={[
              { label: 'Budget', value: '90s ≈ 225 words' },
              { label: 'Proofs before a credential', value: '2 or more' },
              { label: 'Numbers in the first line', value: 'at least 1' },
              { label: 'Last line', value: 'the ask' },
            ]}
            traps={[
              'Reciting the CV top to bottom: it lists credentials first, so you do too.',
              '“Stakeholder management” as a claim. Show it through a migration you led instead.',
              'Running long. Past ninety seconds the panel stops listening and starts waiting.',
            ]}
            sayIt="I hold a PMP and I am finishing CPMAI. In practice that means I plan a risky change the way I would plan a drill: staged, reversible, with a number that tells us to stop."
          >
            <Kicker>The shape, whatever your own lines turn out to be</Kicker>
            <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {REFERENCE_ORDER.map((id, i) => {
                const line = LINE_BY_ID[id]!
                return (
                  <li key={id} className="rounded-xl border border-rule bg-paper-2/60 px-3 py-2.5">
                    <div className="num text-[11px] text-ink-3">
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div className="mt-0.5 text-[13px] leading-tight font-semibold text-ink">
                      {ROLE_LABEL[line.role]}
                    </div>
                    <div className="mt-1 text-[12px] leading-snug text-ink-3">{line.label}</div>
                  </li>
                )
              })}
            </ol>
          </Takeaway>
        }
      />
    </div>
  )
}
