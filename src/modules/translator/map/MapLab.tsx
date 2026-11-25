import { ArrowRight, Check, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Callout, Card, Chip, Kicker } from '@/components/ui'
import { cn } from '@/lib/cn'
import { CPMAI_PHASES } from '@/lib/facts'
import { Anatomy, SignalSwatch } from '../Anatomy'
import {
  CPMAI_MOVES,
  PHRASE_BY_ID,
  PHRASES,
  type CpmaiPhaseId,
  type Phrase,
} from '../content/map'
import type { SignalKind } from '../logic'

/* ── phrase translator ────────────────────────────────────────────────── */

type Face = 'pm' | 'eng'

/**
 * A two-sided card: the delivery term on one face, its engineering form on the
 * other. It mounts showing the delivery term and turns itself over, which is
 * the translation happening.
 */
function FlipCard({ phrase, face, onFlip }: { phrase: Phrase; face: Face; onFlip: () => void }) {
  return (
    <button
      type="button"
      onClick={onFlip}
      aria-label={
        face === 'eng'
          ? `Engineering form: ${phrase.eng}. Activate to turn the card back.`
          : `Delivery term: ${phrase.pm}. Activate to translate.`
      }
      className="relative block h-44 w-full rounded-2xl text-left sm:h-40"
      style={{ perspective: 1400 }}
    >
      <motion.span
        className="relative block size-full"
        initial={{ rotateX: 0 }}
        animate={{ rotateX: face === 'eng' ? 180 : 0 }}
        transition={{ duration: 0.62, ease: [0.3, 0.7, 0.2, 1], delay: 0.18 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <span
          className="absolute inset-0 flex flex-col justify-center rounded-2xl border border-rule-2 bg-paper-2 px-6"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
          aria-hidden={face !== 'pm'}
        >
          <Kicker>What a project manager calls it</Kicker>
          <span className="display mt-2 block text-[clamp(1.45rem,3vw,2rem)] leading-[1.1] font-[540] text-ink-2">
            {phrase.pm}
          </span>
        </span>
        <span
          className="absolute inset-0 flex flex-col justify-center rounded-2xl bg-line px-6 text-white shadow-card"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateX(180deg)',
          }}
          aria-hidden={face !== 'eng'}
        >
          <span className="kicker text-white/75">What an engineering panel hears</span>
          <span className="display mt-2 block text-[clamp(1.3rem,2.7vw,1.8rem)] leading-[1.12] font-[540]">
            {phrase.eng}
          </span>
        </span>
      </motion.span>
    </button>
  )
}

const KEY: SignalKind[] = ['system', 'mechanism', 'number', 'decision', 'ownership', 'process']

function PhraseTranslator() {
  const [activeId, setActiveId] = useState(PHRASES[0]!.id)
  const [seen, setSeen] = useState<string[]>([PHRASES[0]!.id])
  const [face, setFace] = useState<Face>('eng')
  const phrase = PHRASE_BY_ID[activeId] ?? PHRASES[0]!

  const select = (id: string) => {
    setActiveId(id)
    setFace('eng')
    setSeen((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <Kicker className="text-line">Phrase translator</Kicker>
          <h2 className="mt-1 text-[22px] leading-tight font-[560]">
            Twelve delivery concepts, in the form an engineering panel rewards
          </h2>
        </div>
        <Chip className="ml-auto" tone={seen.length === PHRASES.length ? 'ok' : 'neutral'}>
          {seen.length} of {PHRASES.length} translated
        </Chip>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)]">
        <ul
          className="grid grid-cols-2 gap-1 border-b border-rule bg-paper-2/50 p-3 sm:grid-cols-3 lg:grid-cols-1 lg:border-r lg:border-b-0"
          aria-label="Delivery concepts"
        >
          {PHRASES.map((p) => {
            const active = p.id === phrase.id
            const visited = seen.includes(p.id)
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => select(p.id)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-150',
                    active
                      ? 'border-line bg-card shadow-card'
                      : 'border-transparent hover:bg-card/80',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-[18px] shrink-0 items-center justify-center rounded-full border text-white transition-colors duration-200',
                      visited ? 'border-line bg-line' : 'border-rule-2 bg-transparent',
                    )}
                    aria-hidden
                  >
                    {visited && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span
                    className={cn(
                      'min-w-0 text-[13.5px] leading-tight font-medium',
                      active ? 'text-ink' : 'text-ink-2',
                    )}
                  >
                    {p.pm}
                    <span className="sr-only">{visited ? ' (translated)' : ''}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="min-w-0 p-5 sm:p-6">
          <FlipCard
            key={phrase.id}
            phrase={phrase}
            face={face}
            onFlip={() => setFace(face === 'eng' ? 'pm' : 'eng')}
          />
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-3">
            <span className="font-medium text-ink-2">{phrase.pm}</span>
            <ArrowRight size={12} aria-hidden />
            <span className="font-medium text-line">{phrase.eng}</span>
            <span className="ml-auto hidden sm:inline">Click the card to turn it over.</span>
          </p>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={phrase.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <div className="mt-5">
                <Kicker>The mechanism doing the same job</Kicker>
                <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-2">
                  {phrase.mechanism}
                </p>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-ok/30 bg-ok-wash/60 px-4 py-3.5">
                  <Kicker className="flex items-center gap-1.5 text-ok">
                    <Check size={12} strokeWidth={3} aria-hidden /> Say it like this
                  </Kicker>
                  <p className="display mt-2 text-[16px] leading-[1.5] font-[430] text-ink">
                    “<Anatomy surface="paper" pieces={phrase.say.pieces} />”
                  </p>
                </div>
                <div className="rounded-xl border border-bad/30 bg-bad-wash/50 px-4 py-3.5">
                  <Kicker className="flex items-center gap-1.5 text-bad">
                    <X size={12} strokeWidth={3} aria-hidden /> Not like this
                  </Kicker>
                  <p className="display mt-2 text-[16px] leading-[1.5] font-[430] text-ink-2">
                    “<Anatomy surface="paper" pieces={phrase.not.pieces} />”
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule pt-3">
            <span className="kicker text-ink-3">Marks</span>
            {KEY.map((kind) => (
              <SignalSwatch key={kind} kind={kind} surface="paper" />
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

/* ── CPMAI across an AI system design round ───────────────────────────── */

function CpmaiMap() {
  const [activeId, setActiveId] = useState<CpmaiPhaseId>('data-understanding')
  const phase = CPMAI_PHASES.find((p) => p.id === activeId) ?? CPMAI_PHASES[0]
  const move = CPMAI_MOVES[phase.id]

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-rule px-5 py-4 sm:px-6">
        <Kicker className="text-line">CPMAI across an AI system design round</Kicker>
        <h2 className="mt-1 text-[22px] leading-tight font-[560]">
          Six phases, six moves you can make in the room
        </h2>
        <p className="mt-2 max-w-3xl text-[14.5px] leading-relaxed text-ink-2">
          You already know the phases. In an AI design interview each one is a question most
          candidates forget to ask. Pick a phase to see the move it buys you.
        </p>
      </div>

      <div className="overflow-x-auto px-5 pt-6 sm:px-6">
        <ol className="grid min-w-[46rem] grid-cols-6">
          {CPMAI_PHASES.map((p, i) => {
            const active = p.id === phase.id
            const data = CPMAI_MOVES[p.id].data
            return (
              <li key={p.id} className="relative flex justify-center">
                {i > 0 && (
                  <span
                    className="absolute top-[17px] left-[-50%] h-0.5 w-full bg-rule-2"
                    aria-hidden
                  />
                )}
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveId(p.id)}
                  className="group relative z-10 flex flex-col items-center gap-2 px-1.5 text-center"
                >
                  <span
                    className={cn(
                      'num flex size-9 items-center justify-center rounded-full border-2 text-[13px] font-semibold transition-all duration-200',
                      active
                        ? 'scale-110 border-line bg-line text-white shadow-[0_0_0_4px_color-mix(in_oklab,var(--line)_18%,transparent)]'
                        : data
                          ? 'border-line bg-card text-line group-hover:bg-line/10'
                          : 'border-rule-2 bg-card text-ink-2 group-hover:border-line group-hover:text-line',
                    )}
                  >
                    {p.n}
                  </span>
                  <span
                    className={cn(
                      'text-[13px] leading-tight font-semibold',
                      active ? 'text-ink' : 'text-ink-2',
                    )}
                  >
                    {p.title}
                  </span>
                </button>
              </li>
            )
          })}
          <li aria-hidden className="mt-3" />
          <li
            className="col-span-2 mx-3 mt-3 border-t-2 border-line/60 pt-1.5 text-center text-[12px] leading-snug font-medium text-line"
            aria-hidden
          >
            data, before any model
          </li>
          <li
            className="col-span-3 mx-3 mt-3 border-t-2 border-rule-2 pt-1.5 text-center text-[12px] leading-snug text-ink-3"
            aria-hidden
          >
            model work only starts here
          </li>
        </ol>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phase.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          className="mt-6 grid gap-5 border-t border-rule p-5 sm:p-6 lg:grid-cols-2"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Kicker className="text-line">
                Phase {phase.n} · {phase.title}
              </Kicker>
              {move.data && <Chip tone="info">a data phase</Chip>}
            </div>
            <p className="display mt-2.5 text-[clamp(1.3rem,2.5vw,1.65rem)] leading-[1.18] font-[540] text-ink">
              {move.move}
            </p>
            {move.data && (
              <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-ink-2">
                Raising this before anyone names a model is the tell of someone who has shipped an
                AI system, not only designed one.
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <div className="rounded-xl border border-rule bg-paper-2/60 px-4 py-3.5">
              <Kicker>Ask the interviewer</Kicker>
              <p className="display mt-1.5 text-[16.5px] leading-snug font-[430] text-ink italic">
                “{move.ask}”
              </p>
            </div>
            <div className="rounded-xl border border-rule bg-card px-4 py-3.5">
              <Kicker>How it sounds in the room</Kicker>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">“{move.sounds}”</p>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="border-t border-rule bg-paper-2/50 px-5 py-4 sm:px-6">
        <Callout tone="info" title="Two of the six phases are about data, and both come before any model">
          A common way to open an AI design round is to pick a model. Opening with what data
          exists, how fresh it is and who may see it is the instinct that separates a senior
          answer. CPMAI has been drilling exactly that into you, so use it, in engineering words.
        </Callout>
        <p className="mt-3 text-[12px] leading-snug text-ink-3">
          The phase names are PMI's. The interview moves are this lab's reading of them, not PMI
          material.
        </p>
      </div>
    </Card>
  )
}

/* ── the tab ──────────────────────────────────────────────────────────── */

export default function MapLab() {
  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-3xl text-[15.5px] leading-relaxed text-ink-2">
        A reference to keep open while you rewrite your own stories. Nothing here asks you to drop
        what the PMP and CPMAI taught you. Every concept survives; it is just said as the mechanism
        that does the job, with a number attached.
      </p>
      <PhraseTranslator />
      <CpmaiMap />
    </div>
  )
}
