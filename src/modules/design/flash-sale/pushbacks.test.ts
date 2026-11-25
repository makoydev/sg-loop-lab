import { describe, expect, it } from 'vitest'
import { buildDiagram, density } from './diagram'
import {
  FUNNEL_DESIGN,
  MISSION_BUYERS,
  NAIVE_DESIGN,
  NO_FAULTS,
  simulate,
  type Design,
  type Scenario,
} from './logic'
import { billRemarks, firstToGive, PUSHBACKS, signalsFor, type PushbackId } from './pushbacks'

const base: Scenario = { buyers: MISSION_BUYERS, faults: NO_FAULTS }
const BRUTE: Design = { ...FUNNEL_DESIGN, admission: 'none' }

const pushed = (id: PushbackId, design: Design) => {
  const pushback = PUSHBACKS.find((p) => p.id === id)!
  const run = simulate(design, pushback.apply(base))
  const signals = signalsFor(id, run)
  const firing = signals.filter((s) => s.firesAt !== null)
  return { run, signals, firing, verdict: firstToGive(id, run) }
}

describe('pushbacks change exactly one thing', () => {
  it('each sets its own fault or surge and nothing else', () => {
    const apply = (id: PushbackId) => PUSHBACKS.find((p) => p.id === id)!.apply(base)
    expect(apply('double')).toEqual({ buyers: MISSION_BUYERS, surge: 2, faults: NO_FAULTS })
    expect(apply('redis').faults).toEqual({ ...NO_FAULTS, redis: true })
    expect(apply('pay').faults).toEqual({ ...NO_FAULTS, pay: true })
    expect(apply('bill')).toEqual({ buyers: MISSION_BUYERS, surge: 1, faults: NO_FAULTS })
  })
})

describe('double the traffic', () => {
  it('the funnel: nothing saturates, nothing pages', () => {
    const { verdict, firing, signals } = pushed('double', FUNNEL_DESIGN)
    expect(verdict.tone).toBe('ok')
    expect(firing).toEqual([])
    expect(signals.map((s) => s.id)).toEqual(['line', 'redis-load', 'p99'])
  })

  it('brute force: the order service gives first and the queue-wait alert leads the p99 alert', () => {
    const { verdict, signals } = pushed('double', BRUTE)
    expect(verdict.tone).toBe('bad')
    expect(verdict.headline).toContain('order service')
    const wait = signals.find((s) => s.id === 'queue-wait')!
    const p99 = signals.find((s) => s.id === 'p99')!
    expect(wait.firesAt).not.toBeNull()
    expect(p99.firesAt).not.toBeNull()
    expect(wait.firesAt!).toBeLessThanOrEqual(p99.firesAt!)
  })
})

describe('Redis fails over', () => {
  it('the funnel: the gate alert is the only one that trips, and it is informational', () => {
    const { verdict, firing } = pushed('redis', FUNNEL_DESIGN)
    expect(verdict.tone).toBe('warn')
    expect(firing.map((s) => s.id)).toEqual(['gate'])
    expect(firing[0]!.severity).toBe('inform')
    expect(firing[0]!.firesAt).toBe(2)
  })

  it('no gate: inventory errors page within a quarter second of the failure', () => {
    const { verdict, signals } = pushed('redis', BRUTE)
    expect(verdict.tone).toBe('bad')
    const errors = signals.find((s) => s.id === 'inv-errors')!
    expect(errors.firesAt).toBe(1.25)
    expect(signals.find((s) => s.id === 'invariant')!.firesAt).toBeNull()
  })

  it('a design without Redis is told the question moves to the primary', () => {
    const { verdict, signals } = pushed('redis', { ...FUNNEL_DESIGN, inventory: 'atomic' })
    expect(verdict.headline).toContain('no Redis')
    expect(signals.map((s) => s.id)).toEqual(['db', 'invariant', 'p99'])
  })

  it('read-then-write trips the correctness alarm', () => {
    const { signals } = pushed('redis', { ...FUNNEL_DESIGN, inventory: 'rw' })
    expect(signals.find((s) => s.id === 'invariant')!.firesAt).not.toBeNull()
  })
})

describe('payments go slow', () => {
  it('queued writes: buyers notice nothing, the lag alert informs', () => {
    const { verdict, signals } = pushed('pay', FUNNEL_DESIGN)
    expect(verdict.headline).toContain('Only the worker')
    expect(signals.find((s) => s.id === 'p99')!.firesAt).toBeNull()
    const lag = signals.find((s) => s.id === 'lag')!
    expect(lag.firesAt).not.toBeNull()
    expect(lag.severity).toBe('inform')
    expect(signals.find((s) => s.id === 'pay')!.severity).toBe('inform')
  })

  it('synchronous writes: threads fill, then the service saturates, and it pages', () => {
    const { verdict, signals } = pushed('pay', { ...FUNNEL_DESIGN, orderWrite: 'sync', admitRate: 1000 })
    expect(verdict.tone).toBe('bad')
    const pay = signals.find((s) => s.id === 'pay')!
    expect(pay.severity).toBe('page')
    expect(pay.firesAt).not.toBeNull()
    expect(signals.find((s) => s.id === 'p99')!.firesAt).not.toBeNull()
  })
})

describe('the bill', () => {
  it('has no dashboard signals: it is answered with the cost lines', () => {
    expect(pushed('bill', FUNNEL_DESIGN).signals).toEqual([])
  })

  it('names cost per good order for a working design', () => {
    const remarks = billRemarks(simulate(FUNNEL_DESIGN, base))
    expect(remarks[0]).toContain('S$0.051')
    expect(remarks.at(-1)).toContain('against a budget')
  })

  it('points at pre-warmed pods when the crowd is setting the spend', () => {
    const remarks = billRemarks(simulate(BRUTE, base)).join(' ')
    expect(remarks).toContain('Pre-warmed pods are')
    expect(remarks).toContain('over a budget')
  })

  it('says so when the cheap design bought nothing', () => {
    // every winner waits past the deadline, so nobody is told they have a phone
    const run = simulate(NAIVE_DESIGN, { ...base, faults: { ...NO_FAULTS, pay: true } })
    expect(run.summary.ghosts).toBeGreaterThan(1000)
    expect(run.summary.costPerOrder).toBeNull()
    expect(billRemarks(run)[0]).toContain('undefined')
  })
})

describe('the diagram', () => {
  it('ghosts the parts a design does not use', () => {
    const naive = simulate(NAIVE_DESIGN, base)
    const off = (run: typeof naive) =>
      buildDiagram(run, run.ticks[0]!)
        .nodes.filter((n) => n.off)
        .map((n) => n.id)
    expect(off(naive)).toEqual(['cdn', 'redis', 'mq', 'worker'])
    expect(off(simulate(FUNNEL_DESIGN, base))).toEqual([])
  })

  it('only draws edges between nodes that exist, with densities in range', () => {
    for (const design of [NAIVE_DESIGN, FUNNEL_DESIGN, BRUTE, { ...FUNNEL_DESIGN, orderWrite: 'sync' as const }]) {
      const run = simulate(design, base)
      for (const tick of run.ticks) {
        const { nodes, edges } = buildDiagram(run, tick)
        const ids = new Set(nodes.map((n) => n.id))
        expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length)
        for (const edge of edges) {
          expect(ids.has(edge.from) && ids.has(edge.to)).toBe(true)
          expect(edge.rate ?? 0).toBeGreaterThanOrEqual(0)
          expect(edge.rate ?? 0).toBeLessThanOrEqual(1)
          expect(edge.errRate ?? 0).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('maps traffic to particle density monotonically, and to nothing when idle', () => {
    expect(density(0)).toBe(0)
    expect(density(0.5)).toBe(0)
    const samples = [10, 100, 2_000, 60_000, 120_000, 600_000].map(density)
    for (let i = 1; i < samples.length; i++) expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!)
    expect(samples.at(-1)).toBe(1)
  })
})
