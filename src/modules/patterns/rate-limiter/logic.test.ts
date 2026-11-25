import { describe, expect, it } from 'vitest'
import {
  decide,
  DEFAULT_CONFIG,
  PRESETS,
  simulate,
  worstAllowedSpan,
  worstSpan,
  type Algo,
} from './logic'

const cfg = DEFAULT_CONFIG
const burst = PRESETS.find((p) => p.id === 'burst')!.requests
const count = (xs: boolean[]) => xs.filter(Boolean).length

describe('worstSpan', () => {
  it('returns null for no requests', () => {
    expect(worstSpan([], 10)).toBeNull()
  })

  it('treats the span as half-open: a request exactly one window later is outside', () => {
    expect(worstSpan([0, 10], 10)?.count).toBe(1)
    expect(worstSpan([0, 9.5], 10)?.count).toBe(2)
  })

  it('finds the densest span and its bounds', () => {
    expect(worstSpan([0, 1, 20, 20.5, 21, 29], 10)).toEqual({ count: 4, start: 20, last: 29 })
  })
})

describe('the boundary burst (5 before t=10, 5 after)', () => {
  it('fixed window lets all 10 through: twice the limit inside 4.5 seconds', () => {
    expect(count(decide('fixed', burst, cfg))).toBe(10)
    const span = worstAllowedSpan('fixed', burst, cfg)!
    expect(span.count).toBe(10)
    expect(span.last - span.start).toBe(4.5)
  })

  it('sliding log never exceeds the limit in any window', () => {
    expect(worstAllowedSpan('log', burst, cfg)!.count).toBe(5)
  })

  it('sliding counter overshoots by one: it assumes the old requests were spread out', () => {
    expect(decide('counter', burst, cfg)).toEqual([
      true, true, true, true, true, // before the boundary
      false, true, false, false, false,
    ])
    expect(worstAllowedSpan('counter', burst, cfg)!.count).toBe(6)
  })

  it('token bucket allows the burst plus what refills during it', () => {
    expect(decide('bucket', burst, cfg)).toEqual([
      true, true, true, true, true,
      true, false, false, true, false,
    ])
    expect(worstAllowedSpan('bucket', burst, cfg)!.count).toBe(7)
  })
})

describe('invariants', () => {
  const streams = PRESETS.map((p) => p.requests)

  it('sliding log is exact on every preset stream', () => {
    for (const requests of streams) {
      const span = worstAllowedSpan('log', requests, cfg)
      expect(span ? span.count : 0).toBeLessThanOrEqual(cfg.limit)
    }
  })

  it('fixed window can reach, but never exceed, twice the limit', () => {
    for (const requests of streams) {
      const span = worstAllowedSpan('fixed', requests, cfg)
      expect(span ? span.count : 0).toBeLessThanOrEqual(cfg.limit * 2)
    }
  })

  it('a client at exactly the allowed rate is never rejected by the exact limiters', () => {
    const drip = PRESETS.find((p) => p.id === 'drip')!.requests
    for (const algo of ['fixed', 'log', 'bucket'] as Algo[]) {
      expect(decide(algo, drip, cfg).every(Boolean)).toBe(true)
    }
  })

  it('sliding counter errs the other way too: it wrongly rejects one well-paced request', () => {
    // At t=10 it still weights the whole previous window (5 × 1.0 + 0 = 5),
    // although the true sliding window has just dropped the request at t=0.
    const drip = PRESETS.find((p) => p.id === 'drip')!.requests
    const d = decide('counter', drip, cfg)
    expect(d.filter((x) => !x)).toHaveLength(1)
    expect(d[drip.indexOf(10)]).toBe(false)
  })

  it('every request ends in exactly one allow or reject frame', () => {
    for (const algo of ['fixed', 'log', 'counter', 'bucket'] as Algo[]) {
      const { frames, decisions } = simulate(algo, burst, cfg)
      const terminal = frames.filter((f) => f.phase === 'allow' || f.phase === 'reject')
      expect(terminal).toHaveLength(burst.length)
      terminal.forEach((f) => expect(f.phase === 'allow').toBe(decisions[f.req]))
      expect(frames.at(-1)!.decisions.every((d) => d !== null)).toBe(true)
    }
  })
})

describe('the off-by-one at the window edge', () => {
  const edge = PRESETS.find((p) => p.id === 'edge')!.requests

  it('half-open window: the request at t=10 no longer sees t=0', () => {
    const d = decide('log', edge, { ...cfg, closedBoundary: false })
    expect(d[5]).toBe(true)
  })

  it('closed window (`<` instead of `<=`): t=0 is still counted, so t=10 is rejected', () => {
    const d = decide('log', edge, { ...cfg, closedBoundary: true })
    expect(d[5]).toBe(false)
    expect(d[6]).toBe(true)
  })
})
