import { describe, expect, it } from 'vitest'
import {
  BASELINE,
  BOUNDS,
  CAP_STOPS,
  coverage,
  evaluate,
  INCIDENT_IDS,
  materiality,
  metrics,
  oversight,
  REFERENCE,
  runIncident,
  shareAtOrBelow,
  STARTING,
  type Design,
} from './logic'

const design = (patch: Partial<Design>, base: Design = BASELINE): Design => ({ ...base, ...patch })
const outcome = (d: Design, id: Parameters<typeof runIncident>[1]) => runIncident(d, id).outcome

describe('prompt injection', () => {
  it('with no controls the full S$4,800 leaves, to a stranger', () => {
    const o = outcome(BASELINE, 'injection')
    expect(o.loss).toBe(4800)
    expect(o.status).toBe('breached')
    expect(o.missing).toContain('policyCheck')
  })

  it('guardrails alone do not stop it', () => {
    const o = outcome(design({ guardrails: true }), 'injection')
    expect(o.loss).toBe(4800)
    expect(o.status).toBe('breached')
  })

  it('a cap that only lives in the prompt does not stop it either', () => {
    const o = outcome(design({ cap: 50, approval: 'above-cap', reviewers: 4 }), 'injection')
    expect(o.loss).toBe(4800)
  })

  it('a scoped identity changes where the money goes, not whether it moves', () => {
    const run = runIncident(design({ identity: 'scoped' }), 'injection')
    expect(run.outcome.loss).toBe(4800)
    expect(run.outcome.headline).toContain('own card')
    expect(run.steps.some((s) => s.control === 'identity' && s.verdict === 'blocked')).toBe(true)
  })

  it('the deterministic check plus a cap bounds the loss at the cap, for every cap', () => {
    for (const cap of CAP_STOPS) {
      // With no checkpoint, or with one staffed well enough to read everything.
      for (const approval of ['none', 'above-cap'] as const) {
        const d = design({ policyCheck: true, cap, approval, reviewers: 12 })
        const o = outcome(d, 'injection')
        expect(o.loss).toBeLessThanOrEqual(cap)
        expect(o.status).not.toBe('breached')
        expect(metrics(d).blast).toBe(cap)
      }
    }
  })

  it('reviewers who have time to read reject the fallback request and notice at once', () => {
    const o = outcome(design({ policyCheck: true, approval: 'all', reviewers: 8 }), 'injection')
    expect(o.loss).toBe(0)
    expect(o.status).toBe('stopped')
    expect(o.noticed.minutes).toBe(0)
  })

  it('reviewers who are swamped approve it: a checkpoint that cannot look is not one', () => {
    const d = design({ policyCheck: true, approval: 'all', reviewers: 2 })
    expect(oversight(d).rubberStamping).toBe(true)
    const o = outcome(d, 'injection')
    expect(o.loss).toBeGreaterThan(0)
    expect(o.missing).toContain('reviewers')
  })

  it('is noticed faster the better the record', () => {
    const base = { policyCheck: false } as const
    const none = outcome(design({ ...base, audit: 'none' }), 'injection').noticed.minutes
    const logs = outcome(design({ ...base, audit: 'logs' }), 'injection').noticed.minutes
    const trace = outcome(design({ ...base, audit: 'trace' }), 'injection').noticed.minutes
    const breaker = outcome(design({ ...base, audit: 'trace', breaker: true }), 'injection').noticed.minutes
    expect(none).toBeGreaterThan(logs)
    expect(logs).toBeGreaterThan(trace)
    expect(trace).toBeGreaterThan(breaker)
  })
})

describe('cross-customer probe', () => {
  const sealed = { permissions: 'pre', cache: 'off' } as const

  it('a scoped identity blocks the lookup that a shared account allows', () => {
    expect(outcome(design({ ...sealed, identity: 'shared' }), 'probe').status).toBe('breached')
    const scoped = runIncident(design({ ...sealed, identity: 'scoped' }), 'probe')
    expect(scoped.outcome.status).toBe('stopped')
    expect(scoped.outcome.stoppedBy).toContain('identity')
  })

  it('a shared semantic cache leaks even when identity and retrieval are locked down', () => {
    const o = outcome(design({ identity: 'scoped', permissions: 'pre', cache: 'on' }), 'probe')
    expect(o.status).toBe('breached')
    expect(o.personalData).toBe(true)
    expect(o.missing).toEqual(['cache'])
  })

  it('a cache scoped per user does not', () => {
    const o = outcome(design({ identity: 'scoped', permissions: 'pre', cache: 'scoped' }), 'probe')
    expect(o.status).toBe('stopped')
  })

  it('retrieval without permissions leaks through the index', () => {
    const o = outcome(design({ identity: 'scoped', permissions: 'none', cache: 'off' }), 'probe')
    expect(o.status).toBe('breached')
    expect(o.missing).toEqual(['permissions'])
  })

  it('guardrails do not turn a permissions problem into a safe answer', () => {
    const o = outcome(design({ guardrails: true }), 'probe')
    expect(o.status).toBe('breached')
  })
})

describe('policy change', () => {
  it('a nightly index is stale for hours, an event-driven one for minutes', () => {
    const nightly = metrics(design({ freshness: 'nightly', cache: 'off' })).staleMinutes
    const event = metrics(design({ freshness: 'event', cache: 'off' })).staleMinutes
    expect(nightly).toBeGreaterThan(60 * 12)
    expect(event).toBeLessThanOrEqual(BOUNDS.staleMinutes)
    expect(outcome(design({ freshness: 'nightly', cache: 'off' }), 'stale').status).toBe('breached')
    expect(outcome(design({ freshness: 'event', cache: 'off' }), 'stale').status).toBe('stopped')
  })

  it('a cache with no invalidation extends the window, even over a fresh index', () => {
    const fresh = metrics(design({ freshness: 'event', cache: 'off' })).staleMinutes
    const cached = metrics(design({ freshness: 'event', cache: 'on' })).staleMinutes
    const scoped = metrics(design({ freshness: 'event', cache: 'scoped' })).staleMinutes
    expect(cached).toBeGreaterThan(fresh + 60 * 12)
    expect(scoped).toBe(fresh)
    expect(outcome(design({ freshness: 'event', cache: 'on' }), 'stale').status).toBe('breached')
  })

  it('money only leaks under the old rule where the agent may pay alone', () => {
    const stale = { freshness: 'nightly', cache: 'off' } as const
    expect(outcome(design({ ...stale }), 'stale').loss).toBeGreaterThan(0)
    const gated = design({ ...stale, policyCheck: true, approval: 'all', reviewers: 8 })
    expect(outcome(gated, 'stale').loss).toBe(0)
    // ... but the wrong answer was still given.
    expect(outcome(gated, 'stale').status).toBe('breached')
  })
})

describe('timeout, then retry', () => {
  it('idempotency keys remove the duplicate refund', () => {
    const o = outcome(design({ idempotency: true }), 'retry')
    expect(o.loss).toBe(0)
    expect(o.status).toBe('stopped')
    expect(o.stoppedBy).toEqual(['idempotency'])
  })

  it('without them every in-flight refund is paid again', () => {
    const o = outcome(design({ idempotency: false, breaker: false }), 'retry')
    expect(o.loss).toBeGreaterThan(BOUNDS.blast)
    expect(o.status).toBe('breached')
  })

  it('a circuit breaker limits the damage but does not prevent it', () => {
    const o = outcome(design({ idempotency: false, breaker: true }), 'retry')
    expect(o.loss).toBeGreaterThan(0)
    expect(o.status).toBe('contained')
  })

  it('the policy check does not help: the retry happens below it', () => {
    const o = outcome(design({ policyCheck: true, cap: 200, idempotency: false }), 'retry')
    expect(o.status).toBe('breached')
  })
})

describe('provider outage', () => {
  it('no fallback and no escalation path is a dead end', () => {
    expect(outcome(design({ fallback: 'none', escalation: false }), 'outage').status).toBe('breached')
  })

  it('an escalation path contains it, a fallback absorbs it', () => {
    expect(outcome(design({ fallback: 'none', escalation: true }), 'outage').status).toBe('contained')
    expect(outcome(design({ fallback: 'secondary' }), 'outage').status).toBe('stopped')
    expect(outcome(design({ fallback: 'degrade', escalation: true }), 'outage').status).toBe('contained')
  })

  it('warns that prompt-only limits were never tested on the backup model', () => {
    const loose = runIncident(design({ fallback: 'secondary', policyCheck: false }), 'outage')
    const tight = runIncident(design({ fallback: 'secondary', policyCheck: true }), 'outage')
    expect(loose.steps.some((s) => s.control === 'policyCheck')).toBe(true)
    expect(tight.steps.some((s) => s.control === 'policyCheck')).toBe(false)
  })
})

describe('human oversight', () => {
  const some = design({ policyCheck: true, approval: 'above-cap', cap: 200, reviewers: 2 })
  const all = design({ policyCheck: true, approval: 'all', cap: 200, reviewers: 2 })

  it('approving everything raises reviewer cost and wait, and lowers the override rate', () => {
    const a = oversight(some)
    const b = oversight(all)
    expect(b.cost).toBeGreaterThan(a.cost)
    expect(b.waitMinutes).toBeGreaterThan(a.waitMinutes)
    expect(b.reviewSeconds).toBeLessThan(a.reviewSeconds)
    expect(b.overrideRate).toBeLessThan(a.overrideRate)
    expect(a.rubberStamping).toBe(false)
    expect(b.rubberStamping).toBe(true)
  })

  it('approving everything by hand cannot meet the targets at any team size', () => {
    for (let reviewers = 0; reviewers <= 12; reviewers++) {
      const e = evaluate(design({ approval: 'all', reviewers }, REFERENCE))
      expect(e.solved).toBe(false)
      const overBudget = e.metrics.cost.total > BOUNDS.budget
      expect(overBudget || !e.oversight.effective).toBe(true)
    }
  })

  it('a checkpoint is only enforced when the deterministic check does the routing', () => {
    expect(oversight(design({ approval: 'above-cap', reviewers: 4, policyCheck: false })).enforced).toBe(false)
    expect(oversight(design({ approval: 'above-cap', reviewers: 4, policyCheck: true })).enforced).toBe(true)
  })

  it('with nobody on shift the queue stalls and oversight does not count', () => {
    const o = oversight(design({ policyCheck: true, approval: 'above-cap', cap: 200, reviewers: 0 }))
    expect(o.stalled).toBe(true)
    expect(o.effective).toBe(false)
    expect(evaluate(design({ reviewers: 0 }, REFERENCE)).solved).toBe(false)
  })

  it('more reviewers never make the wait longer', () => {
    let previous = Infinity
    for (let reviewers = 1; reviewers <= 12; reviewers++) {
      const wait = oversight(design({ policyCheck: true, approval: 'all', reviewers })).waitMinutes
      expect(wait).toBeLessThanOrEqual(previous)
      previous = wait
    }
  })
})

describe('autonomy as a budget', () => {
  it('raising the cap raises both the blast radius and the reliance rating', () => {
    for (const approval of ['none', 'above-cap'] as const) {
      let blast = -1
      let reliance = -1
      for (const cap of CAP_STOPS) {
        // A team large enough that the human path is never the weak point.
        const d = design({ cap, approval, reviewers: 12 }, REFERENCE)
        const m = metrics(d)
        const r = materiality(d, m).reliance.score
        expect(m.blast).toBeGreaterThan(blast)
        expect(r).toBeGreaterThan(reliance)
        blast = m.blast
        reliance = r
      }
    }
  })

  it('a cap set too low for the team makes things worse, not better', () => {
    // Two reviewers can read the 10% of refunds above S$200. Send them
    // everything and they stop reading, so the human path becomes the hole.
    const sensible = design({ cap: 200, reviewers: 2 }, REFERENCE)
    const tooLow = design({ cap: 0, reviewers: 2 }, REFERENCE)
    expect(oversight(sensible).rubberStamping).toBe(false)
    expect(oversight(tooLow).rubberStamping).toBe(true)
    expect(metrics(tooLow).blast).toBeGreaterThan(metrics(sensible).blast)
    expect(evaluate(tooLow).solved).toBe(false)
  })

  it('without the deterministic check the blast radius is the tool limit, whatever the cap says', () => {
    expect(metrics(design({ cap: 50, policyCheck: false, tools: 'narrow' })).blast).toBe(5000)
    expect(metrics(design({ cap: 50, policyCheck: false, tools: 'broad' })).blast).toBe(20_000)
  })

  it('real human involvement lowers reliance', () => {
    const alone = design({ approval: 'none' }, REFERENCE)
    const withPeople = design({ approval: 'above-cap', reviewers: 2 }, REFERENCE)
    expect(materiality(withPeople, metrics(withPeople)).reliance.score).toBeLessThan(
      materiality(alone, metrics(alone)).reliance.score,
    )
  })

  it('the refund size distribution is a proper cumulative share', () => {
    let previous = -1
    for (const cap of CAP_STOPS) {
      const share = shareAtOrBelow(cap)
      expect(share).toBeGreaterThanOrEqual(previous)
      expect(share).toBeGreaterThanOrEqual(0)
      expect(share).toBeLessThanOrEqual(1)
      previous = share
    }
    expect(shareAtOrBelow(0)).toBe(0)
    expect(shareAtOrBelow(5000)).toBe(1)
  })
})

describe('metrics move the way they should', () => {
  it('every safety control adds latency or cost, never removes it', () => {
    const base = metrics(BASELINE)
    expect(metrics(design({ guardrails: true })).ttftMs).toBeGreaterThan(base.ttftMs)
    expect(metrics(design({ retrieval: 'hybrid' })).ttftMs).toBeGreaterThan(base.ttftMs)
    expect(metrics(design({ guardrails: true })).cost.total).toBeGreaterThan(base.cost.total)
    expect(metrics(design({ audit: 'trace' })).cost.total).toBeGreaterThan(base.cost.total)
  })

  it('a cache and small-first routing each buy back latency and tokens', () => {
    const slow = design({ cache: 'off', routing: 'large' }, REFERENCE)
    const cached = design({ cache: 'scoped', routing: 'large' }, REFERENCE)
    const routed = design({ cache: 'off', routing: 'cascade' }, REFERENCE)
    expect(metrics(cached).ttftMs).toBeLessThan(metrics(slow).ttftMs)
    expect(metrics(routed).ttftMs).toBeLessThan(metrics(slow).ttftMs)
    expect(metrics(cached).cost.tokens).toBeLessThan(metrics(slow).cost.tokens)
    expect(metrics(routed).cost.tokens).toBeLessThan(metrics(slow).cost.tokens)
  })

  it('every control on, a large model and no cache misses the latency target', () => {
    const d = design({ cache: 'off', routing: 'large' }, REFERENCE)
    expect(metrics(d).ttftMs).toBeGreaterThan(BOUNDS.ttftMs)
    expect(evaluate(d).solved).toBe(false)
  })

  it('retrieval quality choices are what reach the grounding target', () => {
    expect(metrics(design({ retrieval: 'vector', chunking: 'fixed' }, REFERENCE)).grounded).toBeLessThan(
      BOUNDS.grounded,
    )
    expect(metrics(REFERENCE).grounded).toBeGreaterThanOrEqual(BOUNDS.grounded)
  })

  it('switching a control on never lowers coverage', () => {
    const before = coverage(BASELINE)
    const after = coverage(design({ policyCheck: true, guardrails: true, idempotency: true, breaker: true }))
    expect(after.technical.score).toBeGreaterThan(before.technical.score)
    expect(after.bound.score).toBeGreaterThanOrEqual(before.bound.score)
    for (const id of ['bound', 'accountable', 'technical', 'enduser'] as const) {
      expect(coverage(REFERENCE)[id].score).toBeLessThanOrEqual(100)
      expect(coverage(BASELINE)[id].score).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('the sandbox as a puzzle', () => {
  it('the reference design meets every target', () => {
    const e = evaluate(REFERENCE)
    expect(e.targets.filter((t) => !t.met).map((t) => t.id)).toEqual([])
    expect(e.solved).toBe(true)
  })

  it('the starting design is far from solved', () => {
    const e = evaluate(STARTING)
    expect(e.solved).toBe(false)
    expect(e.targets.filter((t) => t.met).length).toBeLessThanOrEqual(3)
  })

  it('the no-controls baseline is breached by all five incidents', () => {
    const e = evaluate(BASELINE)
    for (const id of INCIDENT_IDS) expect(e.incidents[id].outcome.status).toBe('breached')
  })

  it('no single control solves it from the reference design with one thing removed', () => {
    // Each of these is load-bearing: removing it alone must break a target.
    const loadBearing: Partial<Design>[] = [
      { policyCheck: false },
      { identity: 'shared' },
      { idempotency: false, breaker: false },
      { freshness: 'nightly' },
      { cache: 'on' },
      { permissions: 'none' },
      { approval: 'none' },
      { disclosure: false },
      { escalation: false },
      { cap: 5000 },
    ]
    for (const patch of loadBearing) {
      expect(evaluate(design(patch, REFERENCE)).solved, JSON.stringify(patch)).toBe(false)
    }
  })

  it('there is more than one passing design', () => {
    expect(evaluate(design({ routing: 'large' }, REFERENCE)).solved).toBe(true)
    expect(evaluate(design({ fallback: 'degrade' }, REFERENCE)).solved).toBe(true)
    expect(evaluate(design({ cap: 100, reviewers: 4 }, REFERENCE)).solved).toBe(true)
  })
})

describe('incident traces are well-formed for any design', () => {
  const designs: Design[] = [
    BASELINE,
    STARTING,
    REFERENCE,
    design({ policyCheck: true, approval: 'all', reviewers: 0 }),
    design({ policyCheck: true, approval: 'all', reviewers: 1 }),
    design({ policyCheck: true, approval: 'above-cap', cap: 0, reviewers: 12 }),
    design({ policyCheck: true, approval: 'none', cap: 20 }),
    design({ identity: 'scoped', guardrails: true, cache: 'scoped', permissions: 'post' }),
    design({ fallback: 'degrade', escalation: false, audit: 'logs' }),
    design({ cap: 0, approval: 'above-cap', reviewers: 3 }, REFERENCE),
  ]

  it('every step uses a declared lane and a label short enough to draw', () => {
    for (const d of designs) {
      for (const id of INCIDENT_IDS) {
        const run = runIncident(d, id)
        const lanes = new Set(run.lanes.map((lane) => lane.id))
        expect(run.steps.length).toBeGreaterThanOrEqual(4)
        for (const step of run.steps) {
          expect(lanes.has(step.from), `${id}: ${step.label}`).toBe(true)
          if (step.to) expect(lanes.has(step.to), `${id}: ${step.label}`).toBe(true)
          expect(step.label.length, step.label).toBeLessThanOrEqual(32)
          expect(step.detail, step.label).toBeTruthy()
          // A verdict always names the control it is about.
          if (step.verdict) expect(step.control, step.label).toBeTruthy()
        }
      }
    }
  })

  it('the outcome is consistent with what the trace shows', () => {
    for (const d of designs) {
      for (const id of INCIDENT_IDS) {
        const { outcome: o, steps } = runIncident(d, id)
        expect(o.loss).toBeGreaterThanOrEqual(0)
        if (o.status === 'stopped') expect(o.loss).toBe(0)
        if (o.loss > BOUNDS.blast) expect(o.status).toBe('breached')
        // Anything named as stopping it appears in the trace doing something.
        for (const control of o.stoppedBy) {
          expect(
            steps.some((s) => s.control === control && s.verdict !== 'missing'),
            `${id}: ${control}`,
          ).toBe(true)
        }
        expect(o.headline.length).toBeGreaterThan(10)
        expect(o.noticed.text.length).toBeGreaterThan(10)
      }
    }
  })

  it('without an audit trail nothing can be reconstructed', () => {
    for (const id of INCIDENT_IDS) {
      expect(outcome(design({ audit: 'none' }), id).reconstruct.level).toBe('none')
      expect(outcome(design({ audit: 'logs' }), id).reconstruct.level).toBe('partial')
      expect(outcome(design({ audit: 'trace' }), id).reconstruct.level).toBe('full')
    }
  })
})
