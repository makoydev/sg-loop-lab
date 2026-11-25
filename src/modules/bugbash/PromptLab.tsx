import { Clock, Files, Send } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Card, Chip, Kicker } from '@/components/ui'
import { cn, type Tone } from '@/lib/cn'
import { Rich } from './Rich'
import type { Bug, PromptKind, PromptVerdict } from './types'

/*
 * You found the bug. Now you have an assistant and a clock. Three follow-up
 * prompts, one of which a senior engineer would send. Every outcome here is
 * scripted to show a typical failure mode: no model is called.
 */

const ROUND_MINUTES = 45

const KIND_NAME: Record<PromptKind, string> = {
  vague: 'A vague ask',
  delegate: 'Handing over the wheel',
  scoped: 'A scoped ask',
}

const VERDICT: Record<PromptVerdict, { label: string; tone: Tone }> = {
  weak: { label: 'Weak signal', tone: 'warn' },
  risky: { label: 'Risky', tone: 'bad' },
  strong: { label: 'Strong signal', tone: 'ok' },
}

const LETTERS = ['A', 'B', 'C']

export function PromptLab({ bug }: { bug: Bug }) {
  const [picked, setPicked] = useState<PromptKind | null>(null)
  const [seen, setSeen] = useState<PromptKind[]>([])

  const largest = Math.max(...bug.prompts.map((p) => p.outcome.added + p.outcome.removed))
  const current = bug.prompts.find((p) => p.kind === picked)

  const pick = (kind: PromptKind) => {
    setPicked(kind)
    if (!seen.includes(kind)) setSeen([...seen, kind])
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-rule px-5 py-4">
        <div className="min-w-0 flex-1">
          <Kicker>Prompt lab</Kicker>
          <h3 className="mt-1 text-[19px] leading-tight font-[560]">
            The bug is on the table. What do you ask the assistant for?
          </h3>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-snug text-ink-3">
            Three follow-ups for this bug. Pick the one you would send with the interviewer
            watching, then open the others to see where they lead.
          </p>
        </div>
        <Chip tone="info">Scripted simulation · no model is called</Chip>
      </div>

      <div
        role="radiogroup"
        aria-label="Follow-up prompts"
        className="grid gap-3 px-5 py-5 lg:grid-cols-3"
      >
        {bug.prompts.map((option, i) => {
          const active = option.kind === picked
          const opened = seen.includes(option.kind)
          const verdict = VERDICT[option.outcome.verdict]
          return (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(option.kind)}
              className={cn(
                'group flex flex-col gap-3 rounded-xl border p-3.5 text-left transition-colors duration-150',
                active
                  ? 'border-line bg-line/[0.06] shadow-card'
                  : 'border-rule bg-card hover:border-rule-2',
              )}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'num flex size-6 items-center justify-center rounded-md text-[11.5px] font-semibold transition-colors',
                    active ? 'bg-line text-white' : 'bg-paper-2 text-ink-2',
                  )}
                >
                  {LETTERS[i]}
                </span>
                <span className="kicker text-ink-3">
                  {opened ? KIND_NAME[option.kind] : 'Prompt'}
                </span>
                {opened ? (
                  <Chip tone={verdict.tone} className="ml-auto">
                    {verdict.label}
                  </Chip>
                ) : (
                  <Send
                    size={14}
                    className="ml-auto text-ink-3 transition-colors group-hover:text-line"
                    aria-hidden
                  />
                )}
              </span>
              <span className="font-mono text-[12.5px] leading-relaxed text-ink">
                <span className="text-ink-3 select-none" aria-hidden>
                  &gt;{' '}
                </span>
                {option.prompt}
              </span>
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {current && (
          <motion.div
            key={current.kind}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            className="grid gap-x-8 gap-y-5 border-t border-rule bg-paper-2/50 px-5 py-5 lg:grid-cols-[15rem_minmax(0,1fr)]"
            aria-live="polite"
          >
            <div className="flex flex-col gap-4">
              <div>
                <Kicker>What came back</Kicker>
                <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
                  <Files size={14} className="text-ink-3" />
                  <span className="num">
                    {current.outcome.files} {current.outcome.files === 1 ? 'file' : 'files'}
                  </span>
                  <span className="num font-medium text-ok">+{current.outcome.added}</span>
                  <span className="num font-medium text-bad">−{current.outcome.removed}</span>
                </div>
                <div
                  className="mt-2 flex h-2 overflow-hidden rounded-full bg-paper-3"
                  title="Size of the diff, relative to the largest of the three"
                >
                  <span
                    className="h-full bg-ok transition-[width] duration-500 ease-out"
                    style={{ width: `${(current.outcome.added / largest) * 100}%` }}
                  />
                  <span
                    className="h-full bg-bad transition-[width] duration-500 ease-out"
                    style={{ width: `${(current.outcome.removed / largest) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 text-[13px] text-ink-2">
                  <Clock size={14} className="text-ink-3" />
                  <span>
                    About <span className="num font-medium text-ink">{current.outcome.reviewMinutes} min</span>{' '}
                    to review properly
                  </span>
                </div>
                <div
                  className="relative mt-2 h-2 overflow-hidden rounded-full bg-paper-3"
                  title={`${current.outcome.reviewMinutes} of a ${ROUND_MINUTES}-minute round`}
                >
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out',
                      current.outcome.reviewMinutes >= 20 ? 'bg-bad' : 'bg-ink-2',
                    )}
                    style={{
                      width: `${Math.min(100, (current.outcome.reviewMinutes / ROUND_MINUTES) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-[11.5px] text-ink-3">of a {ROUND_MINUTES}-minute round</p>
              </div>
            </div>

            <dl className="flex flex-col gap-4 text-[14px] leading-relaxed">
              <div>
                <dt className="kicker text-ink-3">The assistant's change</dt>
                <dd className="mt-1 text-ink-2">
                  <Rich text={current.outcome.happened} />
                </dd>
              </div>
              <div>
                <dt className="kicker text-ink-3">What it broke, invented or left behind</dt>
                <dd className="mt-1 text-ink-2">
                  <Rich text={current.outcome.damage} />
                </dd>
              </div>
              <div className="rounded-xl border border-rule bg-card px-4 py-3">
                <dt className="flex flex-wrap items-center gap-2">
                  <span className="kicker text-ink-3">How the interviewer reads it</span>
                  <Chip tone={VERDICT[current.outcome.verdict].tone}>
                    {VERDICT[current.outcome.verdict].label}
                  </Chip>
                </dt>
                <dd className="display mt-1.5 text-[16.5px] leading-snug font-[440] text-ink">
                  {current.outcome.interviewer}
                </dd>
              </div>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>

      {!current && (
        <p className="border-t border-rule bg-paper-2/50 px-5 py-4 text-[13px] text-ink-3">
          Choose a prompt to see what it gets you.
        </p>
      )}
    </Card>
  )
}
