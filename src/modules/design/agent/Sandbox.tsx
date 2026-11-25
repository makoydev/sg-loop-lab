import { RotateCcw, ScanLine } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Film, FilmPanel } from '@/components/Film'
import { FlowDiagram } from '@/components/FlowDiagram'
import { Meter } from '@/components/Meter'
import { Scorecard } from '@/components/Scorecard'
import { Button, Chip } from '@/components/ui'
import { cn } from '@/lib/cn'
import { MAS } from '@/lib/facts'
import { ControlPanel, type PanelGroup } from './Controls'
import { buildDiagram, DIAGRAM } from './diagram'
import {
  BOUNDS,
  fmtDuration,
  INCIDENT_IDS,
  INCIDENTS,
  money,
  type Design,
  type Evaluation,
  type IncidentId,
} from './logic'
import { INCIDENT_ICON, LEVEL_TONE, STATUS_COLOR, STATUS_TONE } from './meta'
import { ControlChips, OutcomeFacts } from './Outcome'

/*
 * The struggle: the live sandbox. Change the design, watch the pipeline, the
 * meters and the scorecard respond, and drill it against five incidents.
 */

const fmtMs = (n: number) => Math.round(n).toLocaleString('en-SG')
const fmtPercent = (n: number) => `${Math.round(n)}%`
const fmtThousands = (n: number) => (n === 0 ? 'S$0' : `S$${(n / 1000).toFixed(1)}k`)

const TONE_COLOR = {
  ok: 'var(--color-f-ok)',
  warn: 'var(--color-f-warn)',
  bad: 'var(--color-f-bad)',
} as const

function MaterialityPanel({ evaluation }: { evaluation: Evaluation }) {
  const { materiality } = evaluation
  const heavier = MAS.forEngineers.filter((line) => line.includes('high-materiality'))
  return (
    <FilmPanel
      title="materiality · a read-out in the MAS vocabulary"
      right={
        <Chip surface="film" tone={LEVEL_TONE[materiality.overall]}>
          {materiality.overall}
        </Chip>
      }
    >
      <div className="flex flex-col gap-3">
        {MAS.materiality.map((dim) => {
          const rating = materiality[dim.id as 'impact' | 'complexity' | 'reliance']
          const color = TONE_COLOR[LEVEL_TONE[rating.level] as keyof typeof TONE_COLOR]
          return (
            <div key={dim.id}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium text-film-text" title={dim.gist}>
                  {dim.title}
                </span>
                <span className="num text-[12px]" style={{ color }}>
                  {rating.level}
                </span>
              </div>
              <div className="relative mt-1 h-1.5 rounded-full bg-film-3">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out"
                  style={{ width: `${rating.score}%`, backgroundColor: color }}
                />
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-film-muted">{rating.why}</p>
            </div>
          )
        })}
        <div className="border-t border-film-rule/60 pt-2.5 text-[11.5px] leading-snug text-film-muted">
          <p>An illustration, not a rating: that is the institution’s to make.</p>
          {materiality.overall === 'High' && heavier.length > 0 && (
            <>
              <p className="mt-1.5 text-f-warn">At high materiality, expect to be asked for:</p>
              <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
                {heavier.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </FilmPanel>
  )
}

export function Sandbox({
  design,
  evaluation,
  onChange,
  onReset,
}: {
  design: Design
  evaluation: Evaluation
  onChange: (next: Design) => void
  onReset: () => void
}) {
  const [group, setGroup] = useState<PanelGroup>('bound')
  const [focus, setFocus] = useState<IncidentId | null>(null)
  const focused = focus ? evaluation.incidents[focus] : null
  const m = evaluation.metrics
  const met = evaluation.targets.filter((t) => t.met).length

  const { nodes, edges } = useMemo(
    () => buildDiagram(design, evaluation, focused?.outcome),
    [design, evaluation, focused],
  )

  return (
    <Film
      kicker="Sandbox"
      title="The refund agent, as you have designed it"
      right={
        <>
          <Chip surface="film" tone={evaluation.solved ? 'ok' : 'neutral'}>
            {met} / {evaluation.targets.length} targets
          </Chip>
          <Button
            surface="film"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFocus(null)
              onReset()
            }}
            icon={<RotateCcw size={14} />}
          >
            Reset
          </Button>
        </>
      }
    >
      <FlowDiagram
        nodes={nodes}
        edges={edges}
        width={DIAGRAM.width}
        height={DIAGRAM.height}
        minWidth={780}
        label="The support agent pipeline: customer, guardrails, cache, retriever and index, model router, agent, policy check, reviewers, payments tool and audit trail"
      />

      <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        <Meter
          label="Time to first token"
          value={m.ttftMs}
          format={fmtMs}
          unit="ms"
          tone={m.ttftMs <= BOUNDS.ttftMs ? 'ok' : 'bad'}
          bar={{ max: 2000, target: BOUNDS.ttftMs }}
          hint={`target ${BOUNDS.ttftMs.toLocaleString('en-SG')} ms`}
        />
        <Meter
          label="Monthly cost"
          value={m.cost.total}
          format={money}
          tone={m.cost.total <= BOUNDS.budget ? 'ok' : 'bad'}
          bar={{ max: 100_000, target: BOUNDS.budget }}
          hint={`tokens ${fmtThousands(m.cost.tokens)} · infra ${fmtThousands(m.cost.infra)} · people ${fmtThousands(m.cost.reviewers)}`}
        />
        <Meter
          label="Grounded answers"
          value={m.grounded}
          format={fmtPercent}
          tone={m.grounded >= BOUNDS.grounded ? 'ok' : 'bad'}
          bar={{ max: 100, target: BOUNDS.grounded }}
          hint={`target ${BOUNDS.grounded}%`}
        />
        <Meter
          label="Stale-policy window"
          value={m.staleMinutes}
          format={fmtDuration}
          tone={m.staleMinutes <= BOUNDS.staleMinutes ? 'ok' : 'bad'}
          hint={`after a document changes · target ${BOUNDS.staleMinutes} min`}
        />
        <Meter
          label="Worst single action"
          value={m.blast}
          format={money}
          tone={m.blast <= BOUNDS.blast ? 'ok' : 'bad'}
          bar={{ max: 5000, target: BOUNDS.blast }}
          hint={
            m.capEnforced
              ? evaluation.oversight.rubberStamping
                ? 'reviewers cannot read what they approve'
                : 'bounded by code outside the model'
              : 'nothing enforces a limit'
          }
          className="col-span-2 md:col-span-1"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <ControlPanel
          design={design}
          evaluation={evaluation}
          onChange={onChange}
          group={group}
          onGroup={setGroup}
        />
        <div className="flex flex-col gap-4">
          <Scorecard title="The risk committee's scorecard" targets={evaluation.targets} />
          <MaterialityPanel evaluation={evaluation} />
        </div>
      </div>

      <FilmPanel
        title="incident drills · run against the design above"
        className="mt-4"
        right={
          <span className="hidden text-[11.5px] text-film-muted sm:block">
            Pick one to see what would happen
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {INCIDENT_IDS.map((id) => {
            const run = evaluation.incidents[id]
            const active = focus === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFocus(active ? null : id)}
                aria-pressed={active}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150',
                  active
                    ? 'border-trace/70 bg-film-3'
                    : 'border-film-rule hover:border-film-muted hover:bg-film-3/60',
                )}
              >
                <span className="flex items-center gap-2 text-film-text">
                  <span className={active ? 'text-trace' : 'text-film-muted'}>
                    {INCIDENT_ICON[id]}
                  </span>
                  <span className="text-[13px] leading-tight font-medium">{INCIDENTS[id].name}</span>
                </span>
                <Chip
                  surface="film"
                  tone={STATUS_TONE[run.outcome.status]}
                  dot
                  className="self-start"
                >
                  {run.outcome.status}
                </Chip>
              </button>
            )
          })}
        </div>

        <AnimatePresence initial={false} mode="wait">
          {focused && focus && (
            <motion.div
              key={focus}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3 grid gap-x-8 gap-y-4 border-t border-film-rule/60 pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <div>
                  <p className="text-[12.5px] leading-snug text-film-muted">
                    {INCIDENTS[focus].blurb}
                  </p>
                  <p
                    className="display mt-2 text-[19px] leading-snug font-[520]"
                    style={{ color: STATUS_COLOR[focused.outcome.status] }}
                    aria-live="polite"
                  >
                    {focused.outcome.headline}
                  </p>
                  <div className="mt-3">
                    <ControlChips outcome={focused.outcome} />
                  </div>
                  <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-snug text-film-muted">
                    <ScanLine size={13} className="mt-0.5 shrink-0" />
                    The boxes involved are marked on the diagram. The X-Ray rung replays this one
                    step at a time.
                  </p>
                </div>
                <OutcomeFacts outcome={focused.outcome} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </FilmPanel>

      <p className="mt-3 text-[12px] leading-snug text-film-muted">
        Every number here comes from a small teaching model, built so the trade-offs point the right
        way. None of it is a benchmark of a real system, a real bank or a real model.
      </p>
    </Film>
  )
}
