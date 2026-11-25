import { ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CodePanel, type LineTone } from '@/components/CodePanel'
import { Film, FilmPanel, FilmStat } from '@/components/Film'
import { Scrubber } from '@/components/Scrubber'
import { SequenceTrace } from '@/components/SequenceTrace'
import { Button, Chip, Segmented } from '@/components/ui'
import { cn, type Tone } from '@/lib/cn'
import { usePlayback } from '@/lib/usePlayback'
import {
  codeFor,
  explore,
  formatSchedule,
  initialReadout,
  replay,
  showcaseFor,
  STRATEGIES,
  STRATEGY_META,
  type Action,
  type Schedule,
  type Strategy,
} from './logic'
import { lanesFor, toTraceSteps } from './trace'

export type LastRun = { strategy: Strategy; actions: Action[] }

function verdictFor(
  strategy: Strategy,
  fenceReads: boolean,
  schedules: Schedule[],
): { headline: string; body: string } {
  const total = schedules.length
  const bad = schedules.filter((s) => s.outcome.oversold).length
  const calm = schedules.filter((s) => s.stalls === 0).length
  if (strategy === 'naive') {
    return {
      headline: `${bad} of ${total} schedules oversell.`,
      body: 'The only safe ones are the two where a worker finishes completely before the other one reads. Any overlap between one worker’s read and the other’s write sells the unit twice.',
    }
  }
  if (strategy === 'atomic') {
    return {
      headline: `${bad} of ${total} schedules oversell.`,
      body: 'The check and the decrement are one statement inside the database, so no schedule can put a step between them. Shuffle the steps however you like.',
    }
  }
  if (strategy === 'lock') {
    return {
      headline: `${bad} of ${total} schedules oversell.`,
      body: `Every one of them needs a pause. With no pause the lock holds in ${calm === 2 ? 'both' : `all ${calm}`} of its schedules. The TTL exists so a crashed holder cannot block the sale forever, and it is also what lets a paused holder carry on without the lock.`,
    }
  }
  if (fenceReads) {
    return {
      headline: `${bad} of ${total} schedules oversell, pauses included.`,
      body: 'A paused worker still wakes up believing the lock is its own. The difference is that storage has seen a newer token by then and refuses the old one, on the read as well as on the write.',
    }
  }
  return {
    headline: `${bad} of ${total} schedules oversell.`,
    body: 'Fencing only the write is not enough for read-then-write code. The stale worker’s write can land first, while storage has seen nothing newer, and the newer worker then writes a value it read before that. Send the token with the read as well.',
  }
}

export function RaceXRay({
  initialStrategy,
  lastRun,
}: {
  initialStrategy: Strategy
  /** The last schedule the user completed in the challenge, if any. */
  lastRun: LastRun | null
}) {
  const [strategy, setStrategy] = useState<Strategy>(initialStrategy)
  const [fenceReads, setFenceReads] = useState(true)
  const [picked, setPicked] = useState<{ key: string; index: number } | null>(null)

  const key = `${strategy}|${fenceReads}`
  const schedules = useMemo(() => explore(strategy, { fenceReads }), [strategy, fenceReads])

  const defaultIndex = useMemo(() => {
    const target = formatSchedule(showcaseFor(strategy, { fenceReads }))
    const showcase = schedules.findIndex((s) => formatSchedule(s.actions) === target)
    if (showcase >= 0) return showcase
    const firstBad = schedules.findIndex((s) => s.outcome.oversold)
    return Math.max(firstBad, 0)
  }, [schedules, strategy, fenceReads])

  const mineIndex = useMemo(() => {
    if (!lastRun || lastRun.strategy !== strategy || !fenceReads) return -1
    const target = formatSchedule(lastRun.actions)
    return schedules.findIndex((s) => formatSchedule(s.actions) === target)
  }, [lastRun, schedules, strategy, fenceReads])

  const selected = picked && picked.key === key ? picked.index : defaultIndex
  const schedule = schedules[selected]!
  const run = useMemo(
    () => replay(strategy, schedule.actions, { fenceReads }),
    [strategy, schedule, fenceReads],
  )
  const steps = useMemo(() => toTraceSteps(run.events), [run])
  const playback = usePlayback(run.events.length, {
    stepMs: 1250,
    resetKey: `${key}|${selected}`,
  })
  const event = run.events[playback.index]!

  const select = (index: number) => setPicked({ key, index })
  const total = schedules.length
  const badCount = schedules.filter((s) => s.outcome.oversold).length
  const verdict = verdictFor(strategy, fenceReads, schedules)
  const usesLock = strategy === 'lock' || strategy === 'fencing'

  const groups = useMemo(() => {
    const indexed = schedules.map((s, index) => ({ s, index }))
    if (!usesLock) return [{ title: null as string | null, items: indexed }]
    return [
      { title: 'Nobody pauses', items: indexed.filter((x) => x.s.stalls === 0) },
      {
        title: 'A lock holder pauses past the TTL',
        items: indexed.filter((x) => x.s.stalls > 0),
      },
    ]
  }, [schedules, usesLock])

  const jumpToNextBad = () => {
    if (badCount === 0) return
    for (let step = 1; step <= total; step++) {
      const i = (selected + step) % total
      if (schedules[i]!.outcome.oversold) {
        select(i)
        return
      }
    }
  }

  const marks = useMemo(() => {
    const out: { index: number; tone: Tone }[] = []
    run.events.forEach((e, index) => {
      if (e.tone === 'bad') out.push({ index, tone: 'bad' })
      else if (e.kind === 'stall') out.push({ index, tone: 'warn' })
      else if (e.label.includes('✗') && e.tone === 'ok') out.push({ index, tone: 'ok' })
    })
    return out
  }, [run])

  const lineTones: Record<number, LineTone> = {}
  if (event.kind === 'stall' && event.lines[0] != null) lineTones[event.lines[0]] = 'warn'
  else if (event.tone === 'bad') for (const n of event.lines) lineTones[n] = 'bad'

  const workerTone: Tone = event.worker === 'A' ? 'trace' : 'info'

  return (
    <Film
      title="Every order two workers can run in"
      footer={
        <Scrubber
          playback={playback}
          marks={marks}
          caption={
            <span className="flex items-start gap-2.5">
              <Chip surface="film" tone={workerTone} className="mt-px shrink-0">
                Worker {event.worker} · {event.kind === 'stall' ? 'pause' : event.op}
              </Chip>
              <span>{event.detail}</span>
            </span>
          }
        />
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          surface="film"
          label="Checkout strategy"
          value={strategy}
          onChange={setStrategy}
          options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_META[s].short }))}
        />
        {strategy === 'fencing' && (
          <div className="flex items-center gap-2">
            <span className="kicker text-film-muted">token checked on</span>
            <Segmented
              surface="film"
              size="sm"
              label="Which requests carry the fencing token"
              value={fenceReads ? 'both' : 'write'}
              onChange={(v) => setFenceReads(v === 'both')}
              options={[
                { value: 'both', label: 'read and write', title: 'Every request is fenced' },
                { value: 'write', label: 'write only', title: 'The subtle hole' },
              ]}
            />
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-x-8 gap-y-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p
            className={cn(
              'display text-[clamp(1.35rem,2.4vw,1.75rem)] leading-tight font-[540]',
              badCount > 0 ? 'text-f-bad' : 'text-f-ok',
            )}
            aria-live="polite"
          >
            {verdict.headline}
          </p>
          <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-film-muted">
            <span className="font-semibold text-film-text">{STRATEGY_META[strategy].name}.</span>{' '}
            {verdict.body}
          </p>
        </div>
        <div className="flex gap-6">
          <FilmStat label="schedules" value={total} tone="neutral" />
          <FilmStat label="oversell" value={badCount} tone={badCount > 0 ? 'bad' : 'ok'} />
          <FilmStat label="safe" value={total - badCount} tone="ok" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Chip surface="film" tone={schedule.outcome.oversold ? 'bad' : 'ok'} dot>
              schedule {selected + 1} of {total}
            </Chip>
            <span className="text-[13px] text-film-muted">
              ends with{' '}
              <span
                className={cn('num', schedule.outcome.oversold ? 'text-f-bad' : 'text-film-text')}
              >
                {schedule.outcome.orders} order{schedule.outcome.orders === 1 ? '' : 's'}
              </span>{' '}
              for 1 unit, stock reading{' '}
              <span className="num text-film-text">{schedule.outcome.stock}</span>
            </span>
            {mineIndex === selected && (
              <Chip surface="film" tone="trace">
                the one you ran
              </Chip>
            )}
          </div>
          <div className="mx-auto w-full max-w-[760px]">
            <SequenceTrace
              lanes={lanesFor(strategy)}
              steps={steps}
              index={playback.index}
              initialState={initialReadout(strategy)}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <FilmPanel
            title="every schedule · one cell each"
            right={
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => select((selected - 1 + total) % total)}
                  aria-label="Previous schedule"
                  className="inline-flex size-6 items-center justify-center rounded-md text-film-muted transition-colors hover:bg-film-3 hover:text-film-text"
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => select((selected + 1) % total)}
                  aria-label="Next schedule"
                  className="inline-flex size-6 items-center justify-center rounded-md text-film-muted transition-colors hover:bg-film-3 hover:text-film-text"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            }
          >
            <div className="flex flex-col gap-3">
              {groups.map((group) =>
                group.items.length === 0 ? null : (
                  <div key={group.title ?? 'all'}>
                    {group.title && (
                      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11.5px] text-film-muted">
                        <span>{group.title}</span>
                        <span className="num">
                          {group.items.filter((x) => x.s.outcome.oversold).length} of{' '}
                          {group.items.length} oversell
                        </span>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-[3px]">
                      {group.items.map(({ s, index }) => {
                        const isSelected = index === selected
                        const isMine = index === mineIndex
                        return (
                          <button
                            key={index}
                            type="button"
                            tabIndex={-1}
                            onClick={() => select(index)}
                            aria-label={`Schedule ${index + 1}: ${s.outcome.oversold ? 'oversells' : 'correct'}${isMine ? ', the one you ran' : ''}`}
                            aria-pressed={isSelected}
                            title={`${formatSchedule(s.actions)} → ${s.outcome.oversold ? 'oversold' : 'correct'}`}
                            className={cn(
                              'size-[11px] rounded-[3px] transition-transform duration-100 hover:scale-150',
                              s.outcome.oversold ? 'bg-f-bad' : 'bg-f-ok/55',
                              isSelected && 'z-10 scale-150 ring-2 ring-white',
                              isMine && !isSelected && 'ring-2 ring-trace',
                            )}
                          />
                        )
                      })}
                    </div>
                  </div>
                ),
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11.5px] text-film-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px] bg-f-bad" /> oversells
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-[3px] bg-f-ok/55" /> correct
                </span>
                {mineIndex >= 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-[3px] ring-2 ring-trace" /> yours
                  </span>
                )}
                <Button
                  surface="film"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={jumpToNextBad}
                  disabled={badCount === 0}
                  icon={<TriangleAlert size={13} />}
                >
                  Next that oversells
                </Button>
              </div>
              <p className="text-[11.5px] leading-snug text-film-muted">
                Click a cell to play that schedule.
                {usesLock &&
                  ' Explored: every interleaving, with at most one pause past the TTL, taken while the other worker is waiting for the lock.'}{' '}
                This counts what is possible, not how likely it is. A flash sale pushes thousands
                of requests through a gap a few milliseconds wide.
              </p>
            </div>
          </FilmPanel>

          <CodePanel
            code={codeFor(strategy, { fenceReads })}
            lang="python"
            title="checkout.py"
            right={
              <Chip surface="film" tone={workerTone}>
                Worker {event.worker} is here
              </Chip>
            }
            activeLines={event.kind === 'stall' ? undefined : event.lines}
            tones={lineTones}
          />
        </div>
      </div>
    </Film>
  )
}
