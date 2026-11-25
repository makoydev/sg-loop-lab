import { useMemo, useState } from 'react'
import { Brief } from '@/components/Brief'
import { HintLadder } from '@/components/HintLadder'
import { Takeaway } from '@/components/Takeaway'
import { Kicker } from '@/components/ui'
import { cn } from '@/lib/cn'
import { EvolvingXRay } from './EvolvingXRay'
import {
  CANONICAL,
  CLARIFY_MINUTES,
  HIDDEN_STATE_REWORK,
  simulate,
  TEST_MINUTES,
  TOTAL_MINUTES,
  totalNeeded,
  type Decisions,
  type Timeline,
} from './logic'
import { Simulation } from './Simulation'

const WATCHED = [
  'Not whether Part 1 works. Whether Part 2 is cheap.',
  'Whether you ask before you assume.',
  'Whether you say your trade-offs out loud.',
  'How far you get before 45:00.',
]

function outcome(t: Timeline): string {
  if (t.finished) return `${t.minutesUsed} of ${TOTAL_MINUTES} min`
  const stuck = t.parts.find((p) => p.reached && !p.completed)
  return `out of time in Part ${stuck?.part ?? 4}`
}

export default function EvolvingLab() {
  const [solved, setSolved] = useState(false)
  const [lastRun, setLastRun] = useState<Decisions | null>(null)

  const onEnd = (decisions: Decisions, timeline: Timeline) => {
    setLastRun(decisions)
    if (timeline.finished) setSolved(true)
  }

  // The canonical paths, simulated once for the takeaway.
  const paths = useMemo(
    () => CANONICAL.map((p) => ({ ...p, timeline: simulate(p.decisions) })),
    [],
  )
  const table = paths.find((p) => p.id === 'table')!
  // What skipping the question costs on the table shape, net of the time it saves.
  const floatCost =
    totalNeeded({ ...table.decisions, clarify: false }) - totalNeeded(table.decisions)

  return (
    <div className="flex flex-col gap-8">
      <Brief
        tags={['Coding round', '45 min · 4 parts', 'Payments · fintech']}
        aside={
          <div className="flex h-full flex-col justify-center px-2 py-1">
            <Kicker>What is being watched</Kicker>
            <ol className="mt-3 flex flex-col gap-2.5">
              {WATCHED.map((line, i) => (
                <li key={line} className="flex gap-3 text-[14.5px] leading-snug text-ink-2">
                  <span className="num mt-px flex size-[22px] shrink-0 items-center justify-center rounded-full border border-line/40 text-[11px] font-semibold text-line">
                    {i + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ol>
          </div>
        }
      >
        <p>
          This round has <strong>four parts and one clock</strong>. I will give you Part 1 now. When
          it works I will change the requirement, and then again, and again.
        </p>
        <p>
          We pay merchants out in several currencies and charge a fee per payout. Start simple. I
          will tell you when it stops being simple.
        </p>
      </Brief>

      <HintLadder
        id="patterns/evolving"
        solved={solved}
        struggle={<Simulation onEnd={onEnd} />}
        nudge={
          <>
            <p>
              You cannot know what the next requirement will be. You do know there will be one. So
              for each choice ask: when the fee rules change, will I be editing <strong>data</strong>
              , or editing <strong>control flow</strong>?
            </p>
            <p>
              And look at the prompt again. Is there anything about money that you are assuming
              rather than asking?
            </p>
          </>
        }
        xray={<EvolvingXRay lastRun={lastRun} />}
        takeaway={
          <Takeaway
            headline="Part 1 is not graded on Part 1. It is graded on what Part 2 costs you."
            points={[
              {
                title: 'Design for the next requirement, not this one',
                body: (
                  <p>
                    You are not asked to predict the twist. You are asked to leave room for one.
                    The test is simple: if the rule changes, is that a new row or a new branch?
                    Rules that vary, like fees, tiers and limits, belong in data, with one small
                    function that reads them.
                  </p>
                ),
              },
              {
                title: 'Starting simple is fine. Refusing to reshape is not',
                body: (
                  <p>
                    Hard-coding Part 1 and then saying “this is the second kind of rule, so I'll
                    move the numbers into a table” still finishes, and shows judgement while doing
                    it. What loses is patching the same shape four times, or building a framework
                    for requirements nobody has stated. Both are the same mistake: not letting the
                    requirements tell you the shape.
                  </p>
                ),
              },
              {
                title: 'Money is integer minor units, and you ask',
                body: (
                  <p>
                    Cents as integers, with a rounding rule you have said out loud. Floats look
                    fine until the first percentage. The question costs {CLARIFY_MINUTES} minutes;
                    finding out later costs {CLARIFY_MINUTES + floatCost} or more, in front of the
                    interviewer.
                  </p>
                ),
              },
              {
                title: 'Keep the core function pure',
                body: (
                  <p>
                    Pass state in. A fee function with no memory can be asked about any merchant on
                    any day, which is exactly what “re-compute last month's statement” needs. A
                    counter hidden in a module answers one question, about now, and costs{' '}
                    {HIDDEN_STATE_REWORK} minutes to unpick.
                  </p>
                ),
              },
              {
                title: 'A test is a change absorber',
                body: (
                  <p>
                    {TEST_MINUTES} minutes for five lines. When the requirement moves, a failing
                    assertion tells you precisely what changed, and a passing one tells you what
                    did not. Without it you re-check old behaviour by hand after every twist, which
                    costs more and proves less.
                  </p>
                ),
              },
            ]}
            facts={paths.map((p) => ({ label: p.name, value: outcome(p.timeline) }))}
            traps={[
              'Going silent to type faster when the requirement changes.',
              'Defending the Part 1 design instead of changing it.',
              'Floats for money.',
              'Building for requirements nobody has stated.',
            ]}
            sayIt="Before I write this: are amounts integer cents, and how should a fee round? I'll keep the fees in a table with one small function over it, so if the pricing rules change I'm editing data, not control flow."
          >
            <Kicker>Same habits, four shapes</Kicker>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {paths.map((p) => (
                <div key={p.id} className="rounded-xl border border-rule bg-paper-2/60 px-3.5 py-3">
                  <div className="text-[13px] leading-snug font-medium text-ink-2">{p.name}</div>
                  <div
                    className={cn(
                      'num mt-1.5 text-[22px] leading-none',
                      p.timeline.finished ? 'text-ok' : 'text-bad',
                    )}
                  >
                    {p.timeline.completedParts}
                    <span className="text-[13px] text-ink-3"> / 4 parts</span>
                  </div>
                  <div className="mt-1.5 text-[12px] leading-snug text-ink-3">
                    {p.timeline.finished
                      ? `${p.timeline.minutesLeft} minutes left to talk`
                      : `needs ${totalNeeded(p.decisions)} minutes, has ${TOTAL_MINUTES}`}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12.5px] text-ink-3">
              Minutes come from a teaching model, not from measured interviews. The direction of
              each trade-off is the point.
            </p>
          </Takeaway>
        }
      />
    </div>
  )
}
