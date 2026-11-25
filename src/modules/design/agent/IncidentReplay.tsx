import { useMemo, useState } from 'react'
import { Film, FilmPanel } from '@/components/Film'
import { Scrubber } from '@/components/Scrubber'
import { SequenceTrace } from '@/components/SequenceTrace'
import { Chip, Segmented } from '@/components/ui'
import { cn, type Tone } from '@/lib/cn'
import { usePlayback } from '@/lib/usePlayback'
import { ControlField } from './Controls'
import {
  BASELINE,
  CONTROLS,
  evaluate,
  INCIDENT_IDS,
  INCIDENTS,
  type ControlId,
  type Design,
  type Evaluation,
  type IncidentId,
} from './logic'
import { dimensionOf, INCIDENT_ICON, STATUS_COLOR, STATUS_TONE, VERDICT } from './meta'
import { ControlChips, OutcomeFacts } from './Outcome'

/*
 * The X-Ray: one incident, walked through the pipeline a step at a time.
 * Each step that meets a control says what the control did. The levers under
 * the trace change the real design, so you can watch the same attack stop.
 */

/** The controls that decide each incident, offered beside its replay. */
const LEVERS: Record<IncidentId, ControlId[]> = {
  injection: ['policyCheck', 'cap', 'approval', 'identity', 'guardrails'],
  stale: ['freshness', 'cache'],
  outage: ['fallback', 'escalation'],
  retry: ['idempotency', 'breaker'],
  probe: ['identity', 'permissions', 'cache'],
}

export function IncidentReplay({
  design,
  evaluation,
  onChange,
}: {
  design: Design
  evaluation: Evaluation
  onChange: (next: Design) => void
}) {
  const [incident, setIncident] = useState<IncidentId>(
    () =>
      INCIDENT_IDS.find((id) => evaluation.incidents[id].outcome.status === 'breached') ??
      'injection',
  )
  const [mode, setMode] = useState<'mine' | 'baseline'>('mine')
  const baseline = useMemo(() => evaluate(BASELINE), [])
  const shown = mode === 'mine' ? evaluation : baseline
  const run = shown.incidents[incident]

  const playback = usePlayback(run.steps.length, {
    stepMs: 1700,
    resetKey: `${incident}|${mode}|${JSON.stringify(design)}`,
  })
  const step = run.steps[playback.index]!
  const verdict = step.verdict ? VERDICT[step.verdict] : null
  const dimension = step.control ? dimensionOf(step.control) : null

  const marks = useMemo(() => {
    const out: { index: number; tone: Tone }[] = []
    run.steps.forEach((s, index) => {
      if (s.verdict === 'blocked') out.push({ index, tone: 'ok' })
      else if (s.verdict === 'missing' || s.verdict === 'failed') out.push({ index, tone: 'bad' })
      else if (s.verdict === 'escalated') out.push({ index, tone: 'info' })
    })
    return out
  }, [run])

  return (
    <Film
      title="Replay an incident, one step at a time"
      right={
        <Segmented
          surface="film"
          size="sm"
          label="Which design to replay against"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'mine', label: 'Your design' },
            { value: 'baseline', label: 'No controls', title: 'Every control switched off' },
          ]}
        />
      }
      footer={
        <Scrubber
          playback={playback}
          marks={marks}
          caption={
            <span className="flex items-start gap-2.5">
              {verdict && (
                <Chip surface="film" tone={verdict.tone} className="mt-px shrink-0">
                  {verdict.label}
                </Chip>
              )}
              <span>{step.detail}</span>
            </span>
          }
        />
      }
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {INCIDENT_IDS.map((id) => {
          const active = incident === id
          const status = shown.incidents[id].outcome.status
          return (
            <button
              key={id}
              type="button"
              onClick={() => setIncident(id)}
              aria-pressed={active}
              className={cn(
                'flex flex-col gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors duration-150',
                active
                  ? 'border-trace/70 bg-film-3'
                  : 'border-film-rule hover:border-film-muted hover:bg-film-3/60',
              )}
            >
              <span className="flex items-center gap-2 text-film-text">
                <span className={active ? 'text-trace' : 'text-film-muted'}>{INCIDENT_ICON[id]}</span>
                <span className="text-[13px] leading-tight font-medium">{INCIDENTS[id].name}</span>
              </span>
              <Chip surface="film" tone={STATUS_TONE[status]} dot className="self-start">
                {status}
              </Chip>
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-[13.5px] leading-snug text-film-muted">
        <span className="font-semibold text-film-text">{INCIDENTS[incident].name}.</span>{' '}
        {INCIDENTS[incident].blurb}
        {mode === 'baseline' && (
          <span className="text-f-warn"> Shown against a design with every control switched off.</span>
        )}
      </p>

      <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <SequenceTrace
          lanes={run.lanes}
          steps={run.steps}
          index={playback.index}
          initialState={run.initialState}
        />

        <div className="flex flex-col gap-4">
          <FilmPanel title="control point at this step">
            {step.control && verdict && dimension ? (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip surface="film" tone={verdict.tone}>
                    {verdict.label}
                  </Chip>
                  <span className="text-[13.5px] font-medium text-film-text">
                    {CONTROLS[step.control].label}
                  </span>
                </div>
                <p className="mt-2 text-[12px] leading-snug text-film-muted">
                  {dimension.n === '+' ? (
                    <>
                      <span className="text-film-text">{dimension.name}.</span> Engineering the
                      governance frameworks take for granted, rather than one of their dimensions.
                    </>
                  ) : (
                    <>
                      Serves{' '}
                      <span className="text-film-text">
                        dimension {dimension.n}, {dimension.name.toLowerCase()}
                      </span>
                      , in this app’s reading of the IMDA framework.
                    </>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-[12.5px] leading-snug text-film-muted">
                No control acts at this step. The marks on the scrub bar are the steps where one
                does, or should have.
              </p>
            )}
          </FilmPanel>

          <FilmPanel
            title="outcome"
            right={
              playback.atEnd ? (
                <Chip surface="film" tone={STATUS_TONE[run.outcome.status]} dot>
                  {run.outcome.status}
                </Chip>
              ) : undefined
            }
          >
            {playback.atEnd ? (
              <div className="flex flex-col gap-3" aria-live="polite">
                <p
                  className="display text-[17px] leading-snug font-[520]"
                  style={{ color: STATUS_COLOR[run.outcome.status] }}
                >
                  {run.outcome.headline}
                </p>
                <OutcomeFacts outcome={run.outcome} />
                <ControlChips outcome={run.outcome} />
              </div>
            ) : (
              <p className="text-[12.5px] leading-snug text-film-muted">
                Step {playback.index + 1} of {run.steps.length}. Play to the end to see what was
                lost, how long until anyone noticed, and whether you could show what happened.
              </p>
            )}
          </FilmPanel>
        </div>
      </div>

      {mode === 'mine' ? (
        <FilmPanel title="change the design, and the replay restarts" className="mt-4">
          <div className="grid gap-x-3 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
            {LEVERS[incident].map((id) => (
              <ControlField
                key={id}
                id={id}
                design={design}
                evaluation={evaluation}
                onChange={onChange}
              />
            ))}
          </div>
        </FilmPanel>
      ) : (
        <p className="mt-4 text-[12.5px] leading-snug text-film-muted">
          This is the baseline: no identity of its own, no cap in code, no checkpoint, no audit
          trail. Switch back to your design to change it.
        </p>
      )}
    </Film>
  )
}
