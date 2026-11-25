import {
  ArrowRight,
  ArrowUpRight,
  Lightbulb,
  PenLine,
  Quote,
  ScanLine,
  TriangleAlert,
  Trophy,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { AnimatedNumber } from '@/components/Meter'
import { Card, Chip, Kicker, Slider } from '@/components/ui'
import { cn } from '@/lib/cn'
import { LABS, lineStyle } from '@/lib/lines'
import { to } from '@/lib/router'
import { useLocalStorage, useProgress } from '@/lib/storage'
import {
  allocateHours,
  ARCHETYPES,
  ROUNDS,
  SHIFTS,
  type Archetype,
  type ArchetypeId,
  type RoundId,
} from './data'
import { LoopRing } from './LoopRing'

/* ── hero ─────────────────────────────────────────────────────────────── */

const RUNGS = [
  {
    icon: PenLine,
    name: 'Struggle',
    text: 'You attempt the problem cold: break the limiter, schedule the race, review the pull request.',
  },
  {
    icon: Lightbulb,
    name: 'Nudge',
    text: 'Stuck? One conceptual push. Never the answer.',
  },
  {
    icon: ScanLine,
    name: 'X-Ray',
    text: 'Still stuck? Open the machine. Step, scrub and inject faults until you can see why.',
  },
  {
    icon: Quote,
    name: 'Takeaway',
    text: 'The insight, as a senior engineer would say it in the room.',
  },
]

function Hero() {
  return (
    <header className="grid gap-10 pb-12 lg:grid-cols-[minmax(0,1fr)_21.5rem] lg:items-end lg:gap-14">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="num rounded-md bg-line px-1.5 py-0.5 text-[11px] font-semibold tracking-wider text-white">
            CL1
          </span>
          <span className="kicker text-line">Know your loop</span>
          <span className="kicker text-ink-3">· Singapore · late 2026</span>
        </div>
        <h1 className="mt-4 text-[clamp(2.4rem,5.6vw,4.3rem)] leading-[0.98] font-[560]">
          Calibrate your prep to the loop you are{' '}
          <em className="font-[460] text-line italic">actually</em> walking into.
        </h1>
        <p className="mt-6 max-w-2xl text-[17.5px] leading-relaxed text-ink-2">
          Loop Lab is a set of explorable labs for senior software engineering interviews in
          Singapore. Nothing here is a flashcard. You try first, and when you get stuck, you get to
          look inside the machine. Start by choosing who you are interviewing with.
        </p>
      </div>

      <Card className="p-5">
        <Kicker>How every lab works</Kicker>
        <ol className="mt-3.5 flex flex-col">
          {RUNGS.map((rung, i) => (
            <li key={rung.name} className="relative flex gap-3.5 pb-4 last:pb-0">
              {i < RUNGS.length - 1 && (
                <span
                  className="absolute top-7 bottom-0 left-[13px] w-0.5 rounded-full bg-rule"
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2',
                  i === 2 ? 'border-ink bg-ink text-trace' : 'border-line bg-card text-line',
                )}
              >
                <rung.icon size={13} />
              </span>
              <span className="min-w-0 pt-0.5">
                <span className="block text-[14px] leading-tight font-semibold">{rung.name}</span>
                <span className="mt-1 block text-[13px] leading-snug text-ink-3">{rung.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </header>
  )
}

/* ── archetype picker ─────────────────────────────────────────────────── */

function ArchetypePicker({
  value,
  onChange,
}: {
  value: ArchetypeId
  onChange: (id: ArchetypeId) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Kind of employer"
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
    >
      {ARCHETYPES.map((a) => {
        const active = a.id === value
        return (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(a.id)}
            className={cn(
              'group relative flex flex-col items-start rounded-xl border px-4 py-3.5 text-left transition-colors duration-150',
              active
                ? 'border-ink bg-ink text-paper shadow-card'
                : 'border-rule bg-card/60 hover:border-rule-2 hover:bg-card',
            )}
          >
            <span className="text-[15.5px] leading-tight font-semibold">{a.name}</span>
            <span
              className={cn(
                'mt-1.5 text-[12.5px] leading-snug',
                active ? 'text-paper/70' : 'text-ink-3',
              )}
            >
              {a.examples}
            </span>
            {active && (
              <motion.span
                layoutId="archetype-dot"
                className="absolute top-3.5 right-3.5 size-2 rounded-full bg-line-red"
                transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ── the loop: ring + rounds ──────────────────────────────────────────── */

function RoundRows({
  archetype,
  previous,
  hot,
  onHot,
}: {
  archetype: Archetype
  previous: Archetype | null
  hot: RoundId | null
  onHot: (id: RoundId | null) => void
}) {
  const max = Math.max(...Object.values(archetype.weights))
  return (
    <ul className="flex flex-col">
      {ROUNDS.map((round) => {
        const weight = archetype.weights[round.id]
        const delta = previous ? weight - previous.weights[round.id] : 0
        const dim = hot != null && hot !== round.id
        return (
          <li key={round.id}>
            <a
              href={to(round.path)}
              onPointerEnter={() => onHot(round.id)}
              onPointerLeave={() => onHot(null)}
              onFocus={() => onHot(round.id)}
              onBlur={() => onHot(null)}
              className={cn(
                'group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-rule px-1 py-3 transition-opacity duration-200',
                dim && 'opacity-45',
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: round.color }}
                  aria-hidden
                />
                <span className="truncate text-[15px] font-semibold text-ink">{round.name}</span>
                <ArrowUpRight
                  size={14}
                  className="shrink-0 text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                  aria-hidden
                />
              </span>
              <span className="flex items-baseline justify-end gap-2">
                {previous && delta !== 0 && (
                  <span
                    key={`${previous.id}-${archetype.id}`}
                    className={cn(
                      'num animate-delta text-[11.5px] font-medium',
                      delta > 0 ? 'text-ok' : 'text-bad',
                    )}
                    aria-hidden
                  >
                    {delta > 0 ? '+' : '−'}
                    {Math.abs(delta)}
                  </span>
                )}
                <span className="num w-12 text-right text-[19px] leading-none font-medium text-ink">
                  <AnimatedNumber value={weight} />
                  <span className="text-[12px] text-ink-3">%</span>
                </span>
              </span>
              <span className="col-span-2 flex items-center gap-3">
                <span className="relative h-1.5 flex-1 rounded-full bg-paper-3">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${(weight / max) * 100}%`, backgroundColor: round.color }}
                  />
                </span>
              </span>
              <span className="col-span-2 text-[12.5px] leading-snug text-ink-3">
                {round.what}{' '}
                <span className="font-medium text-ink-2 group-hover:underline">
                  Practise in {round.lab}.
                </span>
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

function Sequence({ steps }: { steps: string[] }) {
  return (
    <ol className="relative mt-4 grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      <span
        className="absolute top-[7px] h-0.5 rounded-full bg-line"
        style={{ left: `${50 / steps.length}%`, right: `${50 / steps.length}%` }}
        aria-hidden
      />
      {steps.map((step, i) => (
        <motion.li
          key={step}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.3 }}
          className="relative flex flex-col items-center gap-2 px-1 text-center"
        >
          <span className="relative z-10 size-4 rounded-full border-[3px] border-line bg-card" />
          <span className="text-[12px] leading-tight font-medium text-ink-2">{step}</span>
        </motion.li>
      ))}
    </ol>
  )
}

function ArchetypeDetail({ archetype }: { archetype: Archetype }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={archetype.id}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22 }}
        className="grid gap-4 lg:grid-cols-12"
      >
        <Card className="p-5 lg:col-span-7">
          <Kicker>The usual sequence</Kicker>
          <Sequence steps={archetype.sequence} />
          <div className="mt-6 border-t border-rule pt-4">
            <Kicker>What is really being graded</Kicker>
            <ul className="mt-3 flex flex-col gap-2.5">
              {archetype.graded.map((g) => (
                <li key={g} className="flex gap-3 text-[14.5px] leading-relaxed text-ink-2">
                  <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-line" aria-hidden />
                  {g}
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card className="border-bad/25 bg-bad-wash/50 p-5">
            <Kicker className="flex items-center gap-1.5 text-bad">
              <TriangleAlert size={12} /> Where six years gets levelled down
            </Kicker>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink">{archetype.downlevel}</p>
          </Card>
          <Card className="p-5">
            <Kicker className="flex items-center gap-1.5 text-line-blue">
              <Trophy size={12} /> Where PMP + CPMAI lands
            </Kicker>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-2">{archetype.edge}</p>
          </Card>
          <Card className="p-5">
            <Kicker>Start with</Kicker>
            <ol className="mt-2.5 flex flex-col gap-1">
              {archetype.startWith.map((s, i) => (
                <li key={s.path}>
                  <a
                    href={to(s.path)}
                    className="group flex items-center gap-3 rounded-lg px-2 py-1.5 text-[14.5px] font-medium text-ink transition-colors hover:bg-paper-2"
                  >
                    <span className="num text-[11.5px] text-ink-3">{`0${i + 1}`}</span>
                    {s.label}
                    <ArrowRight
                      size={14}
                      className="ml-auto text-ink-3 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-ink"
                      aria-hidden
                    />
                  </a>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ── week planner ─────────────────────────────────────────────────────── */

function WeekPlanner({ archetype }: { archetype: Archetype }) {
  const [hours, setHours] = useLocalStorage('week-hours', 8)
  const split = allocateHours(archetype.weights, hours)
  return (
    <Card className="p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] lg:items-center">
        <div>
          <Kicker>This week</Kicker>
          <h3 className="mt-1.5 text-[22px] leading-tight font-[560]">
            Spend the hours where the loop spends its weight.
          </h3>
          <Slider
            className="mt-3 px-0"
            label="Prep time this week"
            value={hours}
            min={3}
            max={20}
            step={0.5}
            onChange={setHours}
            valueLabel={`${hours} h`}
          />
        </div>
        <div>
          <div className="flex h-9 overflow-hidden rounded-lg" aria-hidden>
            {ROUNDS.map((round) => (
              <div
                key={round.id}
                className="flex items-center justify-center overflow-hidden border-r-2 border-card transition-[width] duration-700 ease-out last:border-r-0"
                style={{
                  width: `${(split[round.id] / hours) * 100}%`,
                  backgroundColor: round.color,
                }}
              >
                <span
                  className={cn(
                    'num text-[12px] font-semibold whitespace-nowrap',
                    round.id === 'agentic' ? 'text-ink' : 'text-white',
                  )}
                >
                  {split[round.id] >= 1 ? `${split[round.id]}h` : ''}
                </span>
              </div>
            ))}
          </div>
          <ul className="mt-3 grid gap-x-5 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {ROUNDS.map((round) => (
              <li key={round.id}>
                <a
                  href={to(round.path)}
                  className="group flex items-center gap-2 rounded-md py-0.5 text-[13.5px] text-ink-2 hover:text-ink"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: round.color }}
                    aria-hidden
                  />
                  <span className="num w-12 shrink-0 font-medium whitespace-nowrap text-ink">
                    {split[round.id]} h
                  </span>
                  <span className="truncate group-hover:underline">{round.short}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  )
}

/* ── three shifts ─────────────────────────────────────────────────────── */

function Shifts() {
  return (
    <section aria-labelledby="shifts-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker>What changed</Kicker>
          <h2 id="shifts-title" className="mt-1.5 text-[clamp(1.6rem,3vw,2.1rem)] leading-tight font-[560]">
            Three shifts behind the labs
          </h2>
        </div>
        <a
          href={to('/sources')}
          className="text-[13.5px] font-medium text-ink-2 underline decoration-rule-2 underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          What each claim rests on
        </a>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {SHIFTS.map((shift) => (
          <Card key={shift.n} className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="num text-[12px] text-ink-3">{shift.n}</span>
              <Chip tone={shift.grade === 'checked' ? 'ok' : 'neutral'} dot>
                {shift.grade === 'checked' ? 'dates checked' : 'candidate-reported'}
              </Chip>
            </div>
            <h3 className="mt-3 text-[20px] leading-tight font-[560]">{shift.title}</h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{shift.body}</p>
            <ul className="mt-4 flex flex-col gap-2 border-t border-rule pt-3.5">
              {shift.facts.map((fact) => (
                <li key={fact} className="flex gap-2.5 text-[13px] leading-snug text-ink-2">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                  {fact}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  )
}

/* ── lab directory ────────────────────────────────────────────────────── */

function Directory() {
  const { progress } = useProgress()
  const labs = LABS.filter((lab) => lab.id !== 'calibrator')
  return (
    <section aria-labelledby="labs-title">
      <Kicker>The line</Kicker>
      <h2 id="labs-title" className="mt-1.5 text-[clamp(1.6rem,3vw,2.1rem)] leading-tight font-[560]">
        Four labs, one for each kind of round
      </h2>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {labs.map((lab) => {
          const done = lab.ladders.filter((id) => {
            const p = progress[id]
            return p && (p.solved || p.rung >= 3)
          }).length
          return (
            <a
              key={lab.id}
              href={to(lab.path)}
              style={lineStyle(lab.color)}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-rule bg-card p-5 shadow-card transition-colors duration-150 hover:border-line sm:p-6"
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-line" aria-hidden />
              <span className="flex items-center gap-2.5">
                <span className="num rounded-md bg-line px-1.5 py-0.5 text-[11px] font-semibold tracking-wider text-white">
                  {lab.code}
                </span>
                <span className="kicker text-line">{lab.round}</span>
                <span className="num ml-auto text-[11.5px] text-ink-3">
                  {done} / {lab.ladders.length} worked through
                </span>
              </span>
              <span className="display mt-3 text-[24px] leading-tight font-[560] text-ink">
                {lab.name}
              </span>
              <span className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{lab.blurb}</span>
              <span className="mt-4 flex items-center gap-1.5 text-[13.5px] font-semibold text-line">
                Open the lab
                <ArrowRight
                  size={15}
                  className="transition-transform duration-150 group-hover:translate-x-1"
                  aria-hidden
                />
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

/* ── page ─────────────────────────────────────────────────────────────── */

export default function Calibrator() {
  const [archetypeId, setArchetypeId] = useLocalStorage<ArchetypeId>('archetype', 'regional')
  const [previousId, setPreviousId] = useState<ArchetypeId | null>(null)
  const [hot, setHot] = useState<RoundId | null>(null)

  const archetype = ARCHETYPES.find((a) => a.id === archetypeId) ?? ARCHETYPES[0]!
  const previous = ARCHETYPES.find((a) => a.id === previousId) ?? null

  const choose = (id: ArchetypeId) => {
    if (id === archetype.id) return
    setPreviousId(archetype.id)
    setArchetypeId(id)
  }

  return (
    <div className="flex flex-col gap-16">
      <div>
        <Hero />

        <section aria-labelledby="loop-title" className="flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Kicker>Step one</Kicker>
              <h2 id="loop-title" className="mt-1.5 text-[clamp(1.6rem,3vw,2.1rem)] leading-tight font-[560]">
                Who are you interviewing with?
              </h2>
            </div>
            <p className="max-w-md text-[13px] leading-snug text-ink-3">
              The mix below is this app's estimate from public candidate reports, not published
              data. Loops vary by team and level, so confirm the format with your recruiter.
            </p>
          </div>

          <ArchetypePicker value={archetype.id} onChange={choose} />

          <Card className="overflow-hidden">
            <div className="grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
              <div className="flex flex-col justify-center border-b border-rule bg-paper-2/40 px-4 py-6 lg:border-r lg:border-b-0">
                <LoopRing
                  rounds={ROUNDS}
                  weights={archetype.weights}
                  hot={hot}
                  onHot={setHot}
                  title={archetype.name}
                  subtitle="indicative mix"
                  className="mx-auto w-full max-w-[26rem]"
                />
                <p className="display mx-auto mt-1 max-w-[19rem] text-center text-[16.5px] leading-snug font-[440] text-ink-2 italic">
                  {archetype.tagline}
                </p>
              </div>
              <div className="px-5 py-3 sm:px-6">
                <RoundRows archetype={archetype} previous={previous} hot={hot} onHot={setHot} />
              </div>
            </div>
          </Card>

          <ArchetypeDetail archetype={archetype} />
          <WeekPlanner archetype={archetype} />
        </section>
      </div>

      <Shifts />

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
        <div>
          <Kicker>Why the level matters</Kicker>
          <h2 className="mt-1.5 text-[clamp(1.6rem,3vw,2.1rem)] leading-tight font-[560]">
            Senior versus mid-level is decided in one or two rounds.
          </h2>
        </div>
        <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2">
          <p>
            Most loops do not interview you for a level. They interview you, then decide the level
            from the system design and leadership rounds. A strong coder who designs small or talks
            in process is offered the level below, at the pay below.
          </p>
          <p>
            If you would work in Singapore on an Employment Pass, the offer's salary also feeds the
            pass assessment: there is a qualifying salary that rises with age, and salary relative
            to sector peers earns points under COMPASS. Check the current figures with the Ministry
            of Manpower, not with this app.{' '}
            <a
              href={to('/sources')}
              className="font-medium text-ink underline decoration-rule-2 underline-offset-4 hover:decoration-ink"
            >
              Sources
            </a>
          </p>
        </div>
      </section>

      <Directory />
    </div>
  )
}
