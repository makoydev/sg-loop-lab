import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IMDA, MAS } from '@/lib/facts'
import AgentLab from './AgentLab'
import { buildDiagram } from './diagram'
import { IncidentReplay } from './IncidentReplay'
import {
  BASELINE,
  evaluate,
  INCIDENT_IDS,
  INCIDENTS,
  REFERENCE,
  STARTING,
  type Design,
} from './logic'
import { Sandbox } from './Sandbox'

/*
 * Render smoke tests: every view of the lab must render, without throwing,
 * for designs at the extremes. Rendering to a string exercises the same
 * component code the browser runs.
 */

const noop = () => {}
const design = (patch: Partial<Design>, base: Design = REFERENCE): Design => ({ ...base, ...patch })

const EXTREMES: Design[] = [
  BASELINE,
  STARTING,
  REFERENCE,
  design({ approval: 'all', reviewers: 0 }),
  design({ approval: 'all', reviewers: 1 }),
  design({ approval: 'above-cap', cap: 5000 }),
  design({ approval: 'none', cap: 0 }),
  design({ policyCheck: false, approval: 'above-cap', reviewers: 3 }),
  design({ tools: 'broad', audit: 'none', cache: 'on', fallback: 'degrade', escalation: false }),
]

describe('the agent lab renders', () => {
  it('the whole lab, with the framework vocabulary read from facts', () => {
    const html = renderToString(createElement(AgentLab))
    for (const dim of IMDA.dimensions) expect(html).toContain(dim.title)
    expect(html).toContain(MAS.name)
    expect(html).toContain('teaching model')
    expect(html).toContain('scorecard')
  })

  it('the sandbox, for designs at the extremes', () => {
    for (const d of EXTREMES) {
      const html = renderToString(
        createElement(Sandbox, { design: d, evaluation: evaluate(d), onChange: noop, onReset: noop }),
      )
      for (const id of INCIDENT_IDS) expect(html).toContain(INCIDENTS[id].name)
      expect(html.length).toBeGreaterThan(5000)
    }
  })

  it('the incident replay, opening on each incident in turn', () => {
    // The replay opens on the first incident the design does not survive.
    const opensOn: [Design, string][] = [
      [BASELINE, INCIDENTS.injection.blurb],
      [design({ freshness: 'nightly' }), INCIDENTS.stale.blurb],
      [design({ fallback: 'none', escalation: false }), INCIDENTS.outage.blurb],
      [design({ idempotency: false, breaker: false }), INCIDENTS.retry.blurb],
      [design({ permissions: 'none' }), INCIDENTS.probe.blurb],
      [REFERENCE, INCIDENTS.injection.blurb],
    ]
    for (const [d, blurb] of opensOn) {
      const html = renderToString(
        createElement(IncidentReplay, { design: d, evaluation: evaluate(d), onChange: noop }),
      )
      // React escapes apostrophes, so compare on a stretch of text without one.
      expect(html).toContain(blurb.split('’')[0]!.slice(0, 40))
    }
  })
})

describe('the pipeline diagram', () => {
  it('every edge joins two boxes that exist, for any design', () => {
    for (const d of EXTREMES) {
      const e = evaluate(d)
      for (const focus of [undefined, ...INCIDENT_IDS.map((id) => e.incidents[id].outcome)]) {
        const { nodes, edges } = buildDiagram(d, e, focus)
        const ids = new Set(nodes.map((n) => n.id))
        expect(ids.size).toBe(nodes.length)
        for (const edge of edges) {
          expect(ids.has(edge.from), edge.id).toBe(true)
          expect(ids.has(edge.to), edge.id).toBe(true)
          expect(edge.rate ?? 0).toBeGreaterThanOrEqual(0)
          expect(Number.isFinite(edge.rate ?? 0)).toBe(true)
        }
        for (const n of nodes) {
          if (n.load != null) expect(Number.isFinite(n.load)).toBe(true)
          // Labels have to fit inside a 116-unit box.
          expect(n.label.length, n.label).toBeLessThanOrEqual(14)
          if (n.sub) expect(n.sub.length, n.sub).toBeLessThanOrEqual(17)
        }
      }
    }
  })

  it('marks the gap when an incident gets through', () => {
    const e = evaluate(BASELINE)
    const { nodes } = buildDiagram(BASELINE, e, e.incidents.injection.outcome)
    const policy = nodes.find((n) => n.id === 'policy')!
    expect(policy.tone).toBe('bad')
    expect(policy.off).toBe(false)
  })

  it('ghosts the parts that are switched off', () => {
    const { nodes } = buildDiagram(BASELINE, evaluate(BASELINE))
    for (const id of ['guard', 'policy', 'reviewers', 'audit', 'desk']) {
      expect(nodes.find((n) => n.id === id)!.off, id).toBe(true)
    }
    const on = buildDiagram(REFERENCE, evaluate(REFERENCE)).nodes
    expect(on.every((n) => !n.off)).toBe(true)
  })
})
