import { Eraser, NotebookPen } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Brief } from '@/components/Brief'
import { Film, FilmPanel } from '@/components/Film'
import { HintLadder } from '@/components/HintLadder'
import { Scrubber } from '@/components/Scrubber'
import { Takeaway } from '@/components/Takeaway'
import { Button, Callout, Card, Chip, Kicker, Segmented } from '@/components/ui'
import { cn, type Tone } from '@/lib/cn'
import { usePlayback } from '@/lib/usePlayback'
import { Anatomy, SignalLegend } from '../Anatomy'
import {
  QUESTION_BY_ID,
  QUESTIONS,
  strongest,
  type Question,
  type Segment,
  type Variant,
} from '../content/mixer'
import { LevelBar, NoteMark } from '../Gauges'
import {
  countWords,
  LEVELS,
  readLevel,
  SEGMENT_META,
  speakingSeconds,
  tally,
  VARIANT_META,
  type Level,
  type LevelReading,
  type SegmentId,
  type VariantKind,
} from '../logic'

/** For one question: which variant id is chosen for each segment. */
export type Answer = Partial<Record<SegmentId, string>>
type Picks = Record<string, Answer>

const LETTERS = ['A', 'B', 'C', 'D']

const LEVEL_CHIP: Record<Level, Tone> = { mid: 'warn', senior: 'trace', staff: 'ok' }

function chosen(segment: Segment, answer: Answer | undefined): Variant | undefined {
  const id = answer?.[segment.id]
  return id ? segment.variants.find((v) => v.id === id) : undefined
}

function readAnswer(question: Question, answer: Answer | undefined): LevelReading {
  return readLevel(question.segments.map((s) => chosen(s, answer)?.kind ?? null))
}

const levelLabel = (level: Level) => LEVELS.find((l) => l.level === level)!.label

/* ── the question list (sits beside the prompt) ───────────────────────── */

function QuestionPicker({
  activeId,
  readings,
  onSelect,
}: {
  activeId: string
  readings: Record<string, LevelReading>
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <Kicker className="px-2 pb-1">Five questions this profile gets asked</Kicker>
      {QUESTIONS.map((q, i) => {
        const active = q.id === activeId
        const r = readings[q.id]!
        return (
          <button
            key={q.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(q.id)}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-2.5 py-2 text-left transition-colors duration-150',
              active ? 'border-line bg-card shadow-card' : 'border-transparent hover:bg-card/70',
            )}
          >
            <span className={cn('num text-[11px]', active ? 'text-line' : 'text-ink-3')}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] leading-tight font-semibold text-ink">
                {q.short}
              </span>
              <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">{q.question}</span>
            </span>
            {r.chosen > 0 &&
              (r.complete ? (
                <Chip tone={LEVEL_CHIP[r.level]}>{levelLabel(r.level)}</Chip>
              ) : (
                <Chip>{r.chosen} of 4</Chip>
              ))}
          </button>
        )
      })}
    </div>
  )
}

/* ── Struggle: assemble the answer ────────────────────────────────────── */

function Notepad({
  question,
  answer,
  reading,
}: {
  question: Question
  answer: Answer | undefined
  reading: LevelReading
}) {
  const spoken = question.segments.map((s) => chosen(s, answer)).filter((v) => v != null)
  const words = spoken.reduce((sum, v) => sum + countWords(v.text), 0)

  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <div className="rounded-xl border border-rule bg-paper-2/60">
        <div className="flex items-center gap-2 border-b border-rule px-4 py-2.5">
          <NotebookPen size={14} className="text-ink-3" aria-hidden />
          <Kicker>Interviewer's notepad</Kicker>
        </div>

        <ul aria-live="polite">
          {question.segments.map((segment) => {
            const pick = chosen(segment, answer)
            return (
              <li
                key={segment.id}
                className="border-b border-dashed border-rule-2/80 px-4 py-2.5 last:border-b-0"
              >
                <div className="kicker text-ink-3">{SEGMENT_META[segment.id].label}</div>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={pick?.id ?? 'empty'}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="mt-1.5 flex min-h-[2.6em] gap-2.5"
                  >
                    {pick ? (
                      <>
                        <NoteMark tone={VARIANT_META[pick.kind].tone} />
                        <span className="display text-[14.5px] leading-snug font-[430] text-ink italic">
                          {pick.note}
                        </span>
                      </>
                    ) : (
                      <span className="text-[13px] text-ink-3/80">Waiting for this part.</span>
                    )}
                  </motion.div>
                </AnimatePresence>
              </li>
            )
          })}
        </ul>

        <div className="border-t border-rule px-4 py-3.5">
          <Kicker>Level reading</Kicker>
          <LevelBar reading={reading} className="mt-2" />
          <p className="mt-3 text-[13.5px] leading-snug font-medium text-ink" aria-live="polite">
            {reading.headline}
          </p>
        </div>

        {spoken.length > 0 && (
          <details className="group border-t border-rule px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13px] font-medium text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
              <span>Read the answer back</span>
              <span className="num text-[11.5px] text-ink-3">
                about {Math.round(speakingSeconds(words))}s spoken
              </span>
            </summary>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
              {spoken.map((v) => v.text).join(' ')}
            </p>
          </details>
        )}
      </div>
    </aside>
  )
}

function Challenge({
  question,
  answer,
  reading,
  onPick,
  onClear,
}: {
  question: Question
  answer: Answer | undefined
  reading: LevelReading
  onPick: (segment: SegmentId, variantId: string) => void
  onClear: () => void
}) {
  return (
    <Card className="overflow-clip">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-5 py-3.5">
        <div className="min-w-0">
          <Kicker>Your move</Kicker>
          <h3 className="mt-1 text-[19px] leading-tight font-[560]">
            Assemble an answer the panel would level at staff-track
          </h3>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Chip>{question.short}</Chip>
          <Chip tone={reading.complete ? LEVEL_CHIP[reading.level] : 'neutral'}>
            {reading.complete ? levelLabel(reading.level) : `${reading.chosen} of 4 parts`}
          </Chip>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20.5rem)]">
        <div className="flex min-w-0 flex-col gap-5">
          <p className="text-[13.5px] leading-relaxed text-ink-3">
            Each part of the answer is written four ways, in no particular order. Choose the one you
            would say out loud. Every choice goes straight onto the interviewer's notepad.
          </p>

          {question.segments.map((segment, si) => {
            const meta = SEGMENT_META[segment.id]
            const labelId = `mixer-${question.id}-${segment.id}`
            const pickId = answer?.[segment.id]
            return (
              <section key={segment.id}>
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <span className="num text-[11px] text-ink-3">
                    {String(si + 1).padStart(2, '0')}
                  </span>
                  <h4
                    id={labelId}
                    className="font-sans text-[15px] font-semibold tracking-normal text-ink"
                  >
                    {meta.label}
                  </h4>
                  <span className="text-[13px] text-ink-3">{meta.ask}</span>
                </div>
                <div
                  role="radiogroup"
                  aria-labelledby={labelId}
                  className="mt-2 grid gap-2 md:grid-cols-2"
                >
                  {segment.variants.map((variant, vi) => {
                    const checked = variant.id === pickId
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        onClick={() => onPick(segment.id, variant.id)}
                        className={cn(
                          'flex h-full gap-2.5 rounded-xl border px-3.5 py-3 text-left transition-colors duration-150',
                          checked
                            ? 'border-line bg-line/[0.07]'
                            : 'border-rule bg-card hover:border-rule-2 hover:bg-paper-2/40',
                        )}
                      >
                        <span
                          className={cn(
                            'num mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-[10.5px] font-semibold transition-colors duration-150',
                            checked
                              ? 'border-line bg-line text-white'
                              : 'border-rule-2 text-ink-3',
                          )}
                          aria-hidden
                        >
                          {LETTERS[vi]}
                        </span>
                        <span
                          className={cn(
                            'text-[14px] leading-[1.48]',
                            checked ? 'text-ink' : 'text-ink-2',
                          )}
                        >
                          {variant.text}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        <Notepad question={question} answer={answer} reading={reading} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-rule bg-paper-2/50 px-5 py-3">
        <p className="min-w-0 flex-1 text-[13px] text-ink-3">
          The stories are illustrative. In the room, keep the shape and use your own systems and
          numbers.
        </p>
        <Button
          variant="ghost"
          size="sm"
          icon={<Eraser size={14} />}
          onClick={onClear}
          disabled={reading.chosen === 0}
        >
          Clear this answer
        </Button>
      </div>
    </Card>
  )
}

/* ── X-Ray: the same answer with its signals showing ──────────────────── */

type LeftMode = 'mine' | Exclude<VariantKind, 'senior'>

const LEFT_LABEL: Record<LeftMode, { tab: string; column: string; heading: string }> = {
  mine: { tab: 'Your picks', column: 'Yours', heading: 'Your answer' },
  pm: { tab: 'PM-flavoured', column: 'PM voice', heading: 'The PM-flavoured answer' },
  mid: { tab: 'Mid-level', column: 'Mid-level', heading: 'The mid-level answer' },
  buzz: { tab: 'Buzzword trap', column: 'Buzzword', heading: 'The buzzword answer' },
}

/** Exported so the render test can mount it directly. */
export function XRay({
  question,
  answer,
  onQuestion,
}: {
  question: Question
  answer: Answer | undefined
  onQuestion: (id: string) => void
}) {
  const hasOwn = question.segments.some((s) => chosen(s, answer))
  const [wanted, setWanted] = useState<LeftMode>('mine')
  const mode: LeftMode = wanted === 'mine' && !hasOwn ? 'pm' : wanted

  const playback = usePlayback(question.segments.length, {
    stepMs: 4600,
    resetKey: `${question.id}|${mode}`,
  })
  const index = playback.index

  const rows = useMemo(
    () =>
      question.segments.map((segment) => ({
        segment,
        left:
          mode === 'mine'
            ? chosen(segment, answer)
            : segment.variants.find((v) => v.kind === mode),
        right: strongest(segment),
      })),
    [question, answer, mode],
  )

  const leftReading = readLevel(rows.map((r) => r.left?.kind ?? null))
  const columns = [
    {
      label: LEFT_LABEL[mode].column,
      tally: tally(rows.map((r) => r.left).filter((v) => v != null)),
    },
    { label: 'Strongest', tally: tally(rows.map((r) => r.right)) },
  ]
  const current = rows[index]!

  return (
    <Film
      title="The same answer, with its signals showing"
      footer={
        <Scrubber
          playback={playback}
          showSpeed={false}
          caption={
            <span className="flex items-start gap-2.5">
              <Chip surface="film" tone="ok" className="mt-px shrink-0">
                {SEGMENT_META[current.segment.id].label}
              </Chip>
              <span>
                <span className="text-film-muted">Why the senior version works. </span>
                {current.segment.why}
              </span>
            </span>
          }
        />
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          surface="film"
          size="sm"
          label="Question"
          value={question.id}
          onChange={onQuestion}
          options={QUESTIONS.map((q) => ({ value: q.id, label: q.short }))}
        />
        <div className="flex items-center gap-2">
          <span className="kicker text-film-muted">compare</span>
          <Segmented<LeftMode>
            surface="film"
            size="sm"
            label="Which answer to compare with the strongest one"
            value={mode}
            onChange={setWanted}
            options={(['mine', 'pm', 'mid', 'buzz'] as LeftMode[]).map((m) => ({
              value: m,
              label: LEFT_LABEL[m].tab,
              disabled: m === 'mine' && !hasOwn,
              title: m === 'mine' && !hasOwn ? 'Choose some parts in the challenge first' : undefined,
            }))}
          />
        </div>
      </div>

      <p className="display mt-4 text-[19px] leading-snug font-[520] text-film-text">
        “{question.question}”
      </p>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,19.5rem)]">
        <div className="min-w-0">
          <div className="hidden gap-3 px-3 pb-2 md:grid md:grid-cols-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="kicker text-film-muted">{LEFT_LABEL[mode].heading}</span>
              {leftReading.chosen > 0 && (
                <Chip
                  surface="film"
                  tone={leftReading.complete ? LEVEL_CHIP[leftReading.level] : 'neutral'}
                >
                  {leftReading.complete ? levelLabel(leftReading.level) : 'incomplete'}
                </Chip>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="kicker text-film-muted">The strongest answer</span>
              <Chip surface="film" tone="ok">
                Staff-track
              </Chip>
            </div>
          </div>

          <ol className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const active = i === index
              return (
                <li key={row.segment.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-current={active ? 'step' : undefined}
                    aria-label={`${SEGMENT_META[row.segment.id].label}: compare the two versions`}
                    onClick={() => {
                      playback.pause()
                      playback.setIndex(i)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        playback.pause()
                        playback.setIndex(i)
                      }
                    }}
                    className={cn(
                      'cursor-pointer rounded-xl border px-3 py-3 transition-[opacity,border-color,background-color] duration-300',
                      active
                        ? 'border-trace/60 bg-trace/[0.05]'
                        : 'border-film-rule bg-film-2/60 opacity-60 hover:opacity-90',
                    )}
                  >
                    <div className="flex items-baseline gap-2.5">
                      <span className="num text-[11px] text-film-muted">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="kicker text-film-text">
                        {SEGMENT_META[row.segment.id].label}
                      </span>
                      <span className="text-[12px] text-film-muted">
                        {SEGMENT_META[row.segment.id].ask}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-x-3 gap-y-3 md:grid-cols-2">
                      <div className="min-w-0">
                        <div className="kicker mb-1 text-film-muted md:hidden">
                          {LEFT_LABEL[mode].heading}
                        </div>
                        {row.left ? (
                          <>
                            <p className="text-[14px] leading-[1.65] text-film-text">
                              <Anatomy pieces={row.left.pieces} />
                            </p>
                            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-film-muted">
                              <Chip
                                surface="film"
                                tone={VARIANT_META[row.left.kind].tone}
                                className="py-0 leading-[18px]"
                              >
                                {VARIANT_META[row.left.kind].label}
                              </Chip>
                              <span>{VARIANT_META[row.left.kind].tell}</span>
                            </p>
                          </>
                        ) : (
                          <p className="text-[13.5px] text-film-muted italic">
                            You have not chosen this part yet.
                          </p>
                        )}
                      </div>
                      <div className="min-w-0 md:border-l md:border-film-rule/70 md:pl-3">
                        <div className="kicker mb-1 text-film-muted md:hidden">
                          The strongest answer
                        </div>
                        <p className="text-[14px] leading-[1.65] text-film-text">
                          <Anatomy pieces={row.right.pieces} />
                        </p>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="flex flex-col gap-4">
          <FilmPanel title="signal tally · all four parts">
            <SignalLegend columns={columns} />
          </FilmPanel>
          {question.angle && (
            <Callout surface="film" tone="info" title={question.angle.title}>
              <span className="text-[13px] leading-relaxed">{question.angle.body}</span>
            </Callout>
          )}
        </div>
      </div>
    </Film>
  )
}

/* ── the lab ──────────────────────────────────────────────────────────── */

const SHAPE: { label: string; body: string }[] = [
  { label: 'Decision', body: 'What you chose, in the first person.' },
  { label: 'Mechanism', body: 'The thing in the repo or the runbook that made it safe.' },
  { label: 'Number', body: 'What moved, from what to what.' },
  { label: 'Trade-off', body: 'What it cost, said without flinching.' },
  { label: 'Next time', body: 'The habit that changed because of it.' },
]

export default function MixerLab() {
  const [activeId, setActiveId] = useState(QUESTIONS[0]!.id)
  const [picks, setPicks] = useState<Picks>({})

  const question = QUESTION_BY_ID[activeId] ?? QUESTIONS[0]!
  const readings = useMemo(
    () => Object.fromEntries(QUESTIONS.map((q) => [q.id, readAnswer(q, picks[q.id])])),
    [picks],
  )
  const reading = readings[question.id]!
  const solved = QUESTIONS.some((q) => {
    const r = readings[q.id]!
    return r.complete && r.level === 'staff'
  })

  const pick = (segment: SegmentId, variantId: string) =>
    setPicks((prev) => ({ ...prev, [question.id]: { ...prev[question.id], [segment]: variantId } }))
  const clear = () => setPicks((prev) => ({ ...prev, [question.id]: {} }))

  return (
    <div className="flex flex-col gap-8">
      <Brief
        kicker="The question"
        tags={['Leadership round', 'One to two minutes an answer']}
        aside={<QuestionPicker activeId={question.id} readings={readings} onSelect={setActiveId} />}
      >
        <p>
          <strong>{question.question}</strong>
        </p>
        <p className="font-sans text-[14.5px] leading-relaxed font-normal tracking-normal text-ink-2">
          <span className="font-semibold text-ink">What they are probing. </span>
          {question.probing}
        </p>
      </Brief>

      <HintLadder
        id="translator/mixer"
        solved={solved}
        struggle={
          <Challenge
            key={question.id}
            question={question}
            answer={picks[question.id]}
            reading={reading}
            onPick={pick}
            onClear={clear}
          />
        }
        nudge={
          <>
            <p>
              <strong>Underline the nouns.</strong> Are they documents, meetings and forums, or
              flags, budgets, rollbacks and numbers? A noun the interviewer could ask to see in a
              repository or on a dashboard is worth more than one that lives in a slide.
            </p>
            <p>
              Then check the verbs: who decided? And be suspicious of the option that sounds the
              most senior. Ask what in it you could actually be questioned about.
            </p>
          </>
        }
        xray={<XRay question={question} answer={picks[question.id]} onQuestion={setActiveId} />}
        takeaway={
          <Takeaway
            headline="A senior answer is a decision, the mechanism that made it safe, a number, and what it cost."
            points={[
              {
                title: 'Lead with the build, then the judgement',
                body: (
                  <p>
                    Frame with the system and your verb: “I owned the adapter”, “I led the move”.
                    Process can come later, as a mechanism. If the first noun the panel hears is a
                    steering group, they stop expecting engineering.
                  </p>
                ),
              },
              {
                title: 'Say the decision in the first person',
                body: (
                  <p>
                    “I said no and offered a smaller launch” is a decision. “I escalated” and “the
                    team agreed” describe someone else deciding. A refusal becomes senior the moment
                    it arrives with an option attached.
                  </p>
                ),
              },
              {
                title: 'Use nouns you could find in a repository',
                body: (
                  <p>
                    Idempotency key, feature flag, nightly comparison, alert, cap enforced outside
                    the model. Your PMP instincts are all here already: a risk register is a list of
                    failure modes with controls, a stage gate is a canary with a stop condition.
                    Name the mechanism, not the document.
                  </p>
                ),
              },
              {
                title: 'Attach the cost to the result',
                body: (
                  <p>
                    “Zero duplicate charges, at the price of nine days of campaign” shows a trade
                    you chose. A result with no cost sounds like luck, or like a slide. Then finish
                    with what you do differently now.
                  </p>
                ),
              },
            ]}
            facts={[
              { label: 'Length', value: '1 to 2 minutes' },
              { label: 'Numbers', value: 'one per part' },
              { label: 'Subject of the verbs', value: '“I”, then “we”' },
              { label: 'Buzzwords', value: 'zero' },
            ]}
            traps={[
              'Process artefacts as the subject of the sentence: the register, the committee, the plan.',
              'Altitude without mechanism. It sounds senior and cannot be probed, so it scores nothing.',
              'A result with no cost attached, or a lesson that is a document rather than a habit.',
            ]}
            sayIt="I decided X. The mechanism was Y. It moved the number from A to B, and it cost us C. Next time I would do D earlier."
          >
            <Kicker>The shape, in the order you say it</Kicker>
            <ol className="mt-3 grid gap-2 sm:grid-cols-5">
              {SHAPE.map((step, i) => (
                <li key={step.label} className="rounded-xl border border-rule bg-paper-2/60 px-3 py-2.5">
                  <div className="num text-[11px] text-ink-3">{String(i + 1).padStart(2, '0')}</div>
                  <div className="mt-0.5 text-[13.5px] font-semibold text-ink">{step.label}</div>
                  <div className="mt-1 text-[12px] leading-snug text-ink-3">{step.body}</div>
                </li>
              ))}
            </ol>
          </Takeaway>
        }
      />
    </div>
  )
}
