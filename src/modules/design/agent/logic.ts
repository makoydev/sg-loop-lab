import { INCIDENT_IDS, runIncident, type IncidentId, type IncidentRun } from './incidents'
import {
  BOUNDS,
  coverage,
  fmtDuration,
  materiality,
  metrics,
  money,
  oversight,
  type Coverage,
  type Design,
  type Materiality,
  type Metrics,
  type Oversight,
} from './model'

/*
 * The agent sandbox's logic, in three files:
 *   model.ts      the design, and what it costs, bounds and covers;
 *   incidents.ts  five incidents as step-by-step traces;
 *   logic.ts      this file: both of the above, plus the scorecard.
 * Import from here.
 */

export * from './incidents'
export * from './model'

/* ── the scorecard ────────────────────────────────────────────────────── */

export type Target = { id: string; label: string; value: string; goal: string; met: boolean }

export type Evaluation = {
  oversight: Oversight
  metrics: Metrics
  coverage: Coverage
  materiality: Materiality
  incidents: Record<IncidentId, IncidentRun>
  targets: Target[]
  solved: boolean
}

export function evaluate(d: Design): Evaluation {
  const o = oversight(d)
  const m = metrics(d, o)
  const c = coverage(d, o)
  const incidents = Object.fromEntries(
    INCIDENT_IDS.map((id) => [id, runIncident(d, id)]),
  ) as Record<IncidentId, IncidentRun>
  const survived = INCIDENT_IDS.filter((id) => incidents[id].outcome.status !== 'breached').length
  const lowest = Math.min(c.bound.score, c.accountable.score, c.technical.score, c.enduser.score)

  const targets: Target[] = [
    {
      id: 'blast',
      label: 'Worst single action',
      value: money(m.blast),
      goal: `≤ ${money(BOUNDS.blast)}`,
      met: m.blast <= BOUNDS.blast,
    },
    {
      id: 'stale',
      label: 'Stale-policy window',
      value: fmtDuration(m.staleMinutes),
      goal: `≤ ${BOUNDS.staleMinutes} min`,
      met: m.staleMinutes <= BOUNDS.staleMinutes,
    },
    {
      id: 'ttft',
      label: 'Time to first token',
      value: `${Math.round(m.ttftMs).toLocaleString('en-SG')} ms`,
      goal: `≤ ${BOUNDS.ttftMs.toLocaleString('en-SG')} ms`,
      met: m.ttftMs <= BOUNDS.ttftMs,
    },
    {
      id: 'cost',
      label: 'Monthly cost',
      value: money(m.cost.total),
      goal: `≤ ${money(BOUNDS.budget)}`,
      met: m.cost.total <= BOUNDS.budget,
    },
    {
      id: 'grounded',
      label: 'Grounded answers',
      value: `${m.grounded}%`,
      goal: `≥ ${BOUNDS.grounded}%`,
      met: m.grounded >= BOUNDS.grounded,
    },
    {
      id: 'coverage',
      label: 'All four dimensions covered',
      value: `lowest ${lowest}`,
      goal: `each ≥ ${BOUNDS.coverage}`,
      met: lowest >= BOUNDS.coverage,
    },
    {
      id: 'incidents',
      label: 'Survives the five incidents',
      value: `${survived} of 5`,
      goal: 'none breached',
      met: survived === INCIDENT_IDS.length,
    },
  ]

  return {
    oversight: o,
    metrics: m,
    coverage: c,
    materiality: materiality(d, m),
    incidents,
    targets,
    solved: targets.every((t) => t.met),
  }
}
