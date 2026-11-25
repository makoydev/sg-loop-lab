import { RotateCcw, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CodePanel } from '@/components/CodePanel'
import { Film, FilmPanel } from '@/components/Film'
import { Scrubber } from '@/components/Scrubber'
import { SequenceTrace } from '@/components/SequenceTrace'
import { Button, Callout, Chip, Segmented } from '@/components/ui'
import { cn, type Tone } from '@/lib/cn'
import { usePlayback } from '@/lib/usePlayback'
import { describeLocation, type ReviewResult } from './logic'
import { PromptLab } from './PromptLab'
import { Rich } from './Rich'
import type { PullRequest, Severity } from './types'

/*
 * The X-Ray: pick a bug and watch an execution trace prove it. The same
 * scenario runs twice: as merged, where it breaks, and with the fix applied,
 * where it holds. The fix itself sits beside the trace as a diff.
 */

type Mode = 'broken' | 'fixed'

const SEVERITY_TONE: Record<Severity, Tone> = { critical: 'bad', high: 'warn', medium: 'neutral' }

const STEP_WORD: Record<Tone, string> = {
  neutral: 'step',
  trace: 'step',
  info: 'step',
  ok: 'holds',
  warn: 'watch',
  bad: 'damage',
}

export function BugXRay({ pr, review }: { pr: PullRequest; review: ReviewResult | null }) {
  // Open on the first bug the reviewer missed: that is the one worth watching.
  const [bugId, setBugId] = useState(
    () => review?.findings.find((f) => f.status === 'missed')?.bug.id ?? pr.bugs[0]!.id,
  )
  const [mode, setMode] = useState<Mode>('broken')
  /** Once the reader has chosen something, new runs start playing by themselves. */
  const [engaged, setEngaged] = useState(false)

  const bug = pr.bugs.find((b) => b.id === bugId) ?? pr.bugs[0]!
  const steps = mode === 'broken' ? bug.trace.broken : bug.trace.fixed
  const playback = usePlayback(steps.length, {
    stepMs: 1600,
    autoPlay: engaged,
    resetKey: `${bug.id}|${mode}`,
  })
  const step = steps[playback.index]!
  const stepTone: Tone = step.tone ?? 'trace'

  const marks = useMemo(() => {
    const out: { index: number; tone: Tone }[] = []
    steps.forEach((s, index) => {
      if (s.tone === 'bad' || s.tone === 'warn' || s.tone === 'ok') out.push({ index, tone: s.tone })
    })
    return out
  }, [steps])

  const statusOf = (id: string) => review?.findings.find((f) => f.bug.id === id)?.status

  const choose = (id: string) => {
    setEngaged(true)
    setBugId(id)
    setMode('broken')
  }
  const run = (next: Mode) => {
    setEngaged(true)
    setMode(next)
  }

  return (
    <div className="flex flex-col gap-6">
      <Film
        title="Watch it break, then watch the fix hold"
        right={
          <Segmented
            surface="film"
            size="sm"
            label="Which version of the code runs"
            value={mode}
            onChange={run}
            options={[
              { value: 'broken', label: 'As merged' },
              { value: 'fixed', label: 'With the fix' },
            ]}
          />
        }
        footer={
          <Scrubber
            playback={playback}
            marks={marks}
            caption={
              <span className="flex items-start gap-2.5">
                <Chip surface="film" tone={stepTone} className="mt-px shrink-0">
                  {STEP_WORD[stepTone]}
                </Chip>
                <span>{step.detail}</span>
              </span>
            }
          />
        }
      >
        {/* bug picker */}
        <div
          role="tablist"
          aria-label="Bugs in this pull request"
          className="grid gap-2 md:grid-cols-3"
        >
          {pr.bugs.map((b) => {
            const active = b.id === bug.id
            const status = statusOf(b.id)
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => choose(b.id)}
                className={cn(
                  'flex flex-col gap-1.5 rounded-xl border px-3.5 py-3 text-left transition-colors duration-150',
                  active
                    ? 'border-trace bg-trace/10'
                    : 'border-film-rule bg-film-2/70 hover:border-film-muted',
                )}
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <Chip surface="film" tone={SEVERITY_TONE[b.severity]}>
                    {b.severity}
                  </Chip>
                  {status && (
                    <Chip surface="film" tone={status === 'missed' ? 'bad' : 'ok'}>
                      {status === 'missed' ? 'you missed this' : 'you found this'}
                    </Chip>
                  )}
                </span>
                <span
                  className={cn(
                    'text-[13.5px] leading-snug font-semibold',
                    active ? 'text-film-text' : 'text-film-muted',
                  )}
                >
                  {b.category}
                </span>
                <span className="num text-[11px] text-film-muted">{b.fn}</span>
              </button>
            )
          })}
        </div>

        <p className="mt-4 text-[14px] leading-snug text-film-text">
          <span className="font-semibold">{bug.title.replace(/`/g, '')}.</span>{' '}
          <span className="text-film-muted">
            {mode === 'broken'
              ? 'This is the code exactly as the assistant wrote it.'
              : 'The same scenario, with the fix below applied.'}
          </span>
        </p>

        <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <SequenceTrace
            lanes={bug.trace.lanes}
            steps={steps}
            index={playback.index}
            initialState={bug.trace.initialState}
            className="min-w-0"
          />
          <div className="flex min-w-0 flex-col gap-3">
            <FilmPanel title="What you are watching">
              <p className="text-[13.5px] leading-relaxed text-film-text">
                <Rich text={bug.summary} />
              </p>
              <p className="num mt-2.5 text-[11.5px] text-film-muted">
                {describeLocation(pr, bug)}
              </p>
            </FilmPanel>
            {playback.atEnd ? (
              <Callout
                surface="film"
                tone={mode === 'broken' ? 'bad' : 'ok'}
                title={mode === 'broken' ? 'What it cost' : 'What the fix guarantees'}
                className="animate-rise"
              >
                {mode === 'broken' ? bug.trace.brokenOutcome : bug.trace.fixedOutcome}
              </Callout>
            ) : (
              <p className="px-1 text-[12.5px] leading-snug text-film-muted">
                Step or play through to the end to see{' '}
                {mode === 'broken' ? 'what it costs' : 'where it stops'}.
              </p>
            )}
          </div>
        </div>

        <CodePanel
          className="mt-4"
          surface="film"
          lang={bug.fix.lang}
          code={bug.fix.code}
          tones={bug.fix.tones}
          title={`${bug.fix.path.split('/').pop()} · ${mode === 'fixed' ? 'the fix, applied' : 'the fix, not applied yet'}`}
          right={
            mode === 'broken' ? (
              <Button
                surface="film"
                size="sm"
                variant={playback.atEnd ? 'solid' : 'outline'}
                onClick={() => run('fixed')}
                icon={<Wrench size={14} />}
              >
                Apply the fix and replay
              </Button>
            ) : (
              <Button
                surface="film"
                size="sm"
                variant="outline"
                onClick={() => run('broken')}
                icon={<RotateCcw size={14} />}
              >
                Replay it as merged
              </Button>
            )
          }
          maxHeight={340}
        />
        <p className="mt-2 px-1 text-[12.5px] leading-snug text-film-muted">{bug.fix.note}</p>
      </Film>

      <PromptLab key={bug.id} bug={bug} />
    </div>
  )
}
