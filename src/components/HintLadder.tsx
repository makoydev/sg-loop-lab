import {
  ArrowRight,
  BadgeCheck,
  Lightbulb,
  Lock,
  PenLine,
  Quote,
  RotateCcw,
  ScanLine,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useProgress } from '@/lib/storage'
import { Button, Callout } from './ui'

/*
 * The hint ladder is the spine of every lab:
 *
 *   Struggle → Nudge → X-Ray → Takeaway
 *
 * You attempt the challenge first. Only when stuck do you climb: a conceptual
 * nudge, then an interactive x-ray of the mechanism, then the senior-level
 * takeaway. Rungs unlock one at a time so the answer is never one click away
 * from the question; solving the challenge unlocks everything.
 */

export type Rung = 'struggle' | 'nudge' | 'xray' | 'takeaway'

const ORDER: Rung[] = ['struggle', 'nudge', 'xray', 'takeaway']

const RUNG_META: Record<Rung, { label: string; sub: string; icon: typeof PenLine }> = {
  struggle: { label: 'Struggle', sub: 'Try it cold', icon: PenLine },
  nudge: { label: 'Nudge', sub: 'A push, not the answer', icon: Lightbulb },
  xray: { label: 'X-Ray', sub: 'Watch it work', icon: ScanLine },
  takeaway: { label: 'Takeaway', sub: 'Say it like a senior', icon: Quote },
}

export function HintLadder({
  id,
  struggle,
  nudge,
  xray,
  takeaway,
  solved = false,
  className,
}: {
  /** Progress key, e.g. `patterns/rate-limiter`. */
  id: string
  /** The challenge workspace. Stays mounted so the attempt is never lost. */
  struggle: ReactNode
  nudge: ReactNode
  xray: ReactNode
  takeaway: ReactNode
  /** Set when the challenge has been solved: unlocks every rung. */
  solved?: boolean
  className?: string
}) {
  const { progress, mark } = useProgress()
  const saved = progress[id]
  const [view, setView] = useState<Rung>('struggle')

  const everSolved = solved || Boolean(saved?.solved)
  const reached = everSolved ? 3 : (saved?.rung ?? 0)
  const viewIdx = ORDER.indexOf(view)

  useEffect(() => {
    if (solved) mark(id, { solved: true })
  }, [solved, id, mark])

  const go = (rung: Rung) => {
    const idx = ORDER.indexOf(rung)
    if (idx > reached + 1) return
    setView(rung)
    mark(id, { rung: idx })
  }

  const showWorkspace = view === 'struggle' || view === 'nudge'

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      {/* the rail */}
      <nav aria-label="Hint ladder" className="relative">
        <ol className="relative grid grid-cols-4">
          <div
            className="absolute top-[17px] right-[12.5%] left-[12.5%] h-0.5 rounded-full bg-rule"
            aria-hidden
          />
          <div
            className="absolute top-[17px] left-[12.5%] h-0.5 rounded-full bg-line transition-[width] duration-500 ease-out"
            style={{ width: `${(Math.min(reached, 3) / 3) * 75}%` }}
            aria-hidden
          />
          {ORDER.map((rung, idx) => {
            const meta = RUNG_META[rung]
            const Icon = meta.icon
            const active = rung === view
            const unlocked = idx <= reached
            const next = idx === reached + 1
            const locked = idx > reached + 1
            return (
              <li key={rung} className="relative flex justify-center">
                <button
                  type="button"
                  onClick={() => go(rung)}
                  disabled={locked}
                  aria-current={active ? 'step' : undefined}
                  title={locked ? 'Climb one rung at a time' : meta.sub}
                  className="group flex flex-col items-center gap-1.5 rounded-lg px-1 pb-1 disabled:cursor-not-allowed"
                >
                  <span
                    className={cn(
                      'relative z-10 flex size-9 items-center justify-center rounded-full border-2 transition-all duration-200',
                      active
                        ? 'scale-110 border-line bg-line text-white shadow-[0_0_0_4px_color-mix(in_oklab,var(--line)_18%,transparent)]'
                        : unlocked
                          ? 'border-line bg-card text-line group-hover:bg-line/10'
                          : next
                            ? 'border-rule-2 bg-card text-ink-3 group-hover:border-line group-hover:text-line'
                            : 'border-rule bg-paper-2 text-ink-3/60',
                    )}
                  >
                    {locked ? <Lock size={13} /> : <Icon size={15} />}
                  </span>
                  <span
                    className={cn(
                      'text-[12.5px] leading-none font-semibold transition-colors',
                      active ? 'text-ink' : locked ? 'text-ink-3/70' : 'text-ink-2',
                    )}
                  >
                    {meta.label}
                  </span>
                  <span className="hidden text-[11px] leading-none text-ink-3 sm:block">
                    {meta.sub}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      {/* struggle workspace (kept mounted) with the nudge above it */}
      <div hidden={!showWorkspace} className="flex flex-col gap-4">
        <AnimatePresence initial={false}>
          {view === 'nudge' && (
            <motion.div
              key="nudge"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
              className="overflow-hidden"
            >
              <Callout tone="warn" icon={<Lightbulb size={18} />} title="Nudge">
                <div className="prose-lab">{nudge}</div>
              </Callout>
            </motion.div>
          )}
        </AnimatePresence>
        {struggle}
      </div>

      {view === 'xray' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {xray}
        </motion.div>
      )}

      {view === 'takeaway' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {takeaway}
        </motion.div>
      )}

      {/* what to do next */}
      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-4">
        {view === 'struggle' && (
          <>
            {everSolved ? (
              <>
                <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-ok">
                  <BadgeCheck size={17} /> Cracked it.
                </span>
                <Button
                  variant="line"
                  onClick={() => go('xray')}
                  iconRight={<ArrowRight size={16} />}
                >
                  See why on the X-Ray
                </Button>
              </>
            ) : (
              <>
                <span className="text-[13.5px] text-ink-3">
                  Give it a real attempt first. The struggle is what makes the picture stick.
                </span>
                <Button
                  variant="outline"
                  className="ml-auto"
                  onClick={() => go('nudge')}
                  icon={<Lightbulb size={15} />}
                >
                  I'm stuck: nudge me
                </Button>
              </>
            )}
          </>
        )}
        {view === 'nudge' && (
          <>
            <span className="text-[13.5px] text-ink-3">
              Try again with the nudge in mind before you look inside.
            </span>
            <Button
              variant="line"
              className="ml-auto"
              onClick={() => go('xray')}
              icon={<ScanLine size={15} />}
            >
              Open the X-Ray
            </Button>
          </>
        )}
        {view === 'xray' && (
          <>
            <Button
              variant="ghost"
              onClick={() => go('struggle')}
              icon={<RotateCcw size={15} />}
            >
              Back to the challenge
            </Button>
            <Button
              variant="line"
              className="ml-auto"
              onClick={() => go('takeaway')}
              iconRight={<ArrowRight size={16} />}
            >
              Lock it in: the takeaway
            </Button>
          </>
        )}
        {view === 'takeaway' && (
          <>
            <Button variant="ghost" onClick={() => go('xray')} icon={<ScanLine size={15} />}>
              Back to the X-Ray
            </Button>
            <Button
              variant="outline"
              className="ml-auto"
              onClick={() => go('struggle')}
              icon={<RotateCcw size={15} />}
            >
              Retry the challenge
            </Button>
          </>
        )}
        <span className="sr-only" aria-live="polite">
          {`Showing ${RUNG_META[view].label}, rung ${viewIdx + 1} of 4`}
        </span>
      </div>
    </div>
  )
}
