import { motion } from 'motion/react'
import { useMemo } from 'react'
import { CodePanel, type LineTone } from '@/components/CodePanel'
import { Film, FilmPanel } from '@/components/Film'
import { Scrubber } from '@/components/Scrubber'
import { Chip, Segmented } from '@/components/ui'
import { cn, FILM_TONE, type Tone } from '@/lib/cn'
import { usePlayback } from '@/lib/usePlayback'
import { captionFor, LESSON } from './copy'
import {
  CANONICAL,
  PART_TITLE,
  PARTS,
  simulate,
  solutionAt,
  TOTAL_MINUTES,
  type CostKind,
  type Decisions,
  type PartNumber,
  type Timeline,
} from './logic'

const KIND_TONE: Record<CostKind, Tone> = { build: 'trace', habit: 'info', rework: 'bad' }
const KIND_NAME: Record<CostKind, string> = {
  build: 'the work',
  habit: 'asked, tested, kept pure',
  rework: 'rework',
}

export function EvolvingXRay({ lastRun }: { lastRun: Decisions | null }) {
  const playback = usePlayback(PARTS.length, { stepMs: 4200 })
  const part = (playback.index + 1) as PartNumber

  const rows = useMemo(() => {
    const list = CANONICAL.map((p) => ({
      id: p.id,
      name: p.name,
      mine: false,
      timeline: simulate(p.decisions),
    }))
    if (lastRun) {
      list.unshift({ id: 'mine', name: 'Your last run', mine: true, timeline: simulate(lastRun) })
    }
    return list
  }, [lastRun])

  const byId = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.id, r.timeline])) as Record<string, Timeline>,
    [rows],
  )

  const needed = (t: Timeline, upTo: number) =>
    t.parts.slice(0, upTo).reduce((sum, p) => sum + p.minutes, 0)
  const scale = Math.max(TOTAL_MINUTES + 8, ...rows.map((r) => needed(r.timeline, 4) + 2))
  const limitPct = (TOTAL_MINUTES / scale) * 100

  const solution = solutionAt(part)
  const tones: Record<number, LineTone> = {}
  if (part > 1) for (const n of solution.addedLines) tones[n] = 'add'
  const lesson = LESSON[part]

  return (
    <Film
      title="The same 45 minutes, by the shape of the Part 1 code"
      footer={<Scrubber playback={playback} caption={captionFor(part, byId)} showSpeed={false} />}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          surface="film"
          label="Part of the round"
          value={String(part)}
          onChange={(v) => {
            playback.pause()
            playback.setIndex(Number(v) - 1)
          }}
          options={PARTS.map((p) => ({ value: String(p), label: `Part ${p}`, title: PART_TITLE[p] }))}
        />
        <p className="text-[13.5px] text-film-muted">
          <span className="font-semibold text-film-text">{PART_TITLE[part]}.</span> Every path below
          asks the question, writes the test and keeps the function pure, so the only difference is
          the shape.
        </p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,32rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          <FilmPanel title="minutes each path needs, part by part">
            <div className="relative">
              <ul className="flex flex-col gap-3">
                {rows.map((row) => {
                  const soFar = needed(row.timeline, part)
                  const over = soFar > TOTAL_MINUTES
                  const final = part === PARTS.length
                  let offset = 0
                  return (
                    <li
                      key={row.id}
                      className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[10.5rem_minmax(0,1fr)_6.5rem]"
                    >
                      <span
                        className={cn(
                          'text-[12.5px] leading-tight font-medium',
                          row.mine ? 'text-trace' : 'text-film-text',
                        )}
                      >
                        {row.name}
                      </span>
                      <div
                        className="relative h-7 overflow-hidden rounded-md bg-film-3"
                        role="img"
                        aria-label={`${row.name}: ${soFar} minutes needed after Part ${part}`}
                      >
                        {row.timeline.parts.slice(0, part).map((p) => {
                          const left = (offset / scale) * 100
                          offset += p.minutes
                          return (
                            <motion.div
                              key={p.part}
                              className="absolute inset-y-0 flex overflow-hidden border-l-2 border-film"
                              style={{ left: `${left}%` }}
                              initial={{ width: 0 }}
                              animate={{ width: `${(p.minutes / scale) * 100}%` }}
                              transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }}
                            >
                              {p.costs.map((c, i) => (
                                <span
                                  key={i}
                                  title={`Part ${p.part}: ${c.label}, ${c.minutes} min`}
                                  className="h-full"
                                  style={{
                                    width: `${(c.minutes / p.minutes) * 100}%`,
                                    backgroundColor: FILM_TONE[KIND_TONE[c.kind]],
                                    opacity: c.kind === 'habit' ? 0.85 : 1,
                                  }}
                                />
                              ))}
                              <span className="num pointer-events-none absolute top-1 left-1.5 text-[10px] leading-none font-semibold text-film">
                                P{p.part}
                              </span>
                            </motion.div>
                          )
                        })}
                        {/* everything right of 45:00 never happens */}
                        <div
                          className="pointer-events-none absolute inset-y-0 right-0 bg-film/65"
                          style={{ left: `${limitPct}%` }}
                          aria-hidden
                        />
                        <div
                          className="pointer-events-none absolute inset-y-0 w-px bg-film-text"
                          style={{ left: `${limitPct}%` }}
                          aria-hidden
                        />
                      </div>
                      <span
                        className={cn(
                          'num text-[12px] leading-tight sm:text-right',
                          over ? 'text-f-bad' : final ? 'text-f-ok' : 'text-film-muted',
                        )}
                      >
                        {over
                          ? `needs ${soFar} min`
                          : final
                            ? `${soFar} min, ${TOTAL_MINUTES - soFar} spare`
                            : `${soFar} min so far`}
                      </span>
                    </li>
                  )
                })}
              </ul>
              <div className="mt-3 grid gap-x-3 sm:grid-cols-[10.5rem_minmax(0,1fr)_6.5rem]">
                <span />
                <div className="relative h-4">
                  <span
                    className="num absolute -translate-x-1/2 text-[10.5px] whitespace-nowrap text-film-text"
                    style={{ left: `${limitPct}%` }}
                  >
                    45:00, the round ends
                  </span>
                </div>
                <span />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-film-rule/70 pt-3">
              {(['build', 'habit', 'rework'] as CostKind[]).map((kind) => (
                <span key={kind} className="flex items-center gap-1.5 text-[11.5px] text-film-muted">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ backgroundColor: FILM_TONE[KIND_TONE[kind]] }}
                    aria-hidden
                  />
                  {KIND_NAME[kind]}
                </span>
              ))}
              <span className="text-[11.5px] text-film-muted">
                Faded bars are minutes the path needed and never got.
              </span>
            </div>
          </FilmPanel>

          <FilmPanel title={`what part ${part} is teaching`}>
            <p className="text-[15px] leading-snug font-semibold text-film-text">{lesson.title}</p>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-film-muted">{lesson.body}</p>
          </FilmPanel>
        </div>

        <CodePanel
          code={solution.code}
          lang="python"
          title={`fees.py · data table · after Part ${part}`}
          right={
            <Chip surface="film" tone={part === 1 ? 'trace' : 'ok'}>
              {part === 1
                ? `${solution.diff.added} lines`
                : `+${solution.diff.added + solution.diff.changed} lines, ${solution.diff.kept} untouched`}
            </Chip>
          }
          tones={tones}
          maxHeight={452}
        />
      </div>
    </Film>
  )
}
