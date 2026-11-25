import { describe, expect, it } from 'vitest'
import {
  apply,
  availableActions,
  canStall,
  codeFor,
  explore,
  formatSchedule,
  initialState,
  isTerminal,
  outcome,
  parseSchedule,
  programFor,
  replay,
  SHOWCASE,
  showcaseFor,
  STRATEGIES,
  type Schedule,
  type Strategy,
} from './logic'

const oversells = (schedules: Schedule[]) => schedules.filter((s) => s.outcome.oversold)

describe('check-then-act', () => {
  const schedules = explore('naive')

  it('has 20 possible schedules and 18 of them oversell', () => {
    expect(schedules).toHaveLength(20)
    expect(oversells(schedules)).toHaveLength(18)
  })

  it('is only safe when one worker finishes before the other reads', () => {
    const safe = schedules.filter((s) => !s.outcome.oversold).map((s) => formatSchedule(s.actions))
    expect(safe.sort()).toEqual(['A A A B B', 'B B B A A'])
  })

  it('an oversell leaves stock at 0, not -1: the lost update is silent', () => {
    for (const s of oversells(schedules)) {
      expect(s.outcome).toEqual({ orders: 2, stock: 0, oversold: true })
    }
  })
})

describe('atomic conditional update', () => {
  it('never oversells in any of its 6 schedules', () => {
    const schedules = explore('atomic')
    expect(schedules).toHaveLength(6)
    expect(oversells(schedules)).toHaveLength(0)
    for (const s of schedules) expect(s.outcome).toEqual({ orders: 1, stock: 0, oversold: false })
  })
})

describe('lock with a TTL', () => {
  it('is correct in both schedules when nobody stalls', () => {
    const schedules = explore('lock', { stalls: 'none' })
    expect(schedules).toHaveLength(2)
    expect(oversells(schedules)).toHaveLength(0)
  })

  it('oversells once a holder can pause past the TTL', () => {
    const schedules = explore('lock')
    const bad = oversells(schedules)
    expect(bad.length).toBeGreaterThan(0)
    // Every overselling schedule needs the stall.
    expect(bad.every((s) => s.stalls >= 1)).toBe(true)
  })

  it('a stall is only exploitable before the stalled worker writes', () => {
    // Stall after the write (just before release): the other worker reads 0.
    const late = replay('lock', parseSchedule('A A A A A! B B B B A'))
    expect(outcome(late.states.at(-1)!).oversold).toBe(false)
  })
})

describe('lock with a fencing token', () => {
  it('never oversells, even exploring every stall for both workers', () => {
    const schedules = explore('fencing', { stalls: 'all' })
    expect(schedules.length).toBeGreaterThan(100)
    expect(oversells(schedules)).toHaveLength(0)
    // Safety is not bought with lost sales: exactly one order every time.
    expect(schedules.every((s) => s.outcome.orders === 1)).toBe(true)
  })

  it('still loses an update if only the write carries the token', () => {
    const schedules = explore('fencing', { fenceReads: false })
    expect(oversells(schedules).length).toBeGreaterThan(0)
    const subtle = replay('fencing', SHOWCASE['fencing-write-only'], { fenceReads: false })
    expect(outcome(subtle.states.at(-1)!)).toEqual({ orders: 2, stock: 0, oversold: true })
  })

  it('refuses the stale worker in the textbook schedule', () => {
    const run = replay('fencing', SHOWCASE.fencing)
    const final = run.states.at(-1)!
    expect(final.workers.A.result).toBe('aborted')
    expect(final.workers.B.result).toBe('confirmed')
    expect(outcome(final).oversold).toBe(false)
  })
})

describe('showcase schedules', () => {
  const expected: Record<Strategy, boolean> = {
    naive: true,
    atomic: false,
    lock: true,
    fencing: false,
  }

  it.each(STRATEGIES)('%s: is a complete, legal schedule with the expected ending', (strategy) => {
    const run = replay(strategy, showcaseFor(strategy))
    const final = run.states.at(-1)!
    expect(isTerminal(final)).toBe(true)
    expect(outcome(final).oversold).toBe(expected[strategy])
  })

  it.each(STRATEGIES)('%s: appears in the explored set', (strategy) => {
    const all = explore(strategy).map((s) => formatSchedule(s.actions))
    expect(all).toContain(formatSchedule(showcaseFor(strategy)))
  })

  it('the write-only fencing showcase appears in its explored set', () => {
    const all = explore('fencing', { fenceReads: false }).map((s) => formatSchedule(s.actions))
    expect(all).toContain(formatSchedule(SHOWCASE['fencing-write-only']))
  })
})

describe('the state machine', () => {
  it('every schedule terminates with both workers done and a result each', () => {
    for (const strategy of STRATEGIES) {
      for (const schedule of explore(strategy, { stalls: 'all' })) {
        expect(schedule.actions.length).toBeLessThanOrEqual(12)
        const final = replay(strategy, schedule.actions).states.at(-1)!
        expect(isTerminal(final)).toBe(true)
        expect(final.workers.A.result).not.toBeNull()
        expect(final.workers.B.result).not.toBeNull()
        expect(availableActions(final)).toEqual([])
      }
    }
  })

  it('never deadlocks: some worker can always move until both are done', () => {
    // `explore` throws on a state with no available action; it must not.
    for (const strategy of STRATEGIES) {
      expect(() => explore(strategy, { stalls: 'all' })).not.toThrow()
      expect(() => explore(strategy, { stalls: 'all', fenceReads: false })).not.toThrow()
    }
  })

  it('apply never mutates its input', () => {
    for (const strategy of STRATEGIES) {
      let state = initialState(strategy)
      for (const action of showcaseFor(strategy)) {
        const frozen = structuredClone(state)
        const next = apply(state, action).state
        expect(state).toEqual(frozen)
        expect(next).not.toBe(state)
        state = next
      }
    }
  })

  it('rejects illegal actions', () => {
    const start = initialState('lock')
    expect(canStall(start, 'A')).toBe(false)
    expect(() => apply(start, { worker: 'A', kind: 'stall' })).toThrow()
    const held = apply(start, { worker: 'A', kind: 'step' }).state
    // B is blocked on acquire while A holds the lock.
    expect(() => apply(held, { worker: 'B', kind: 'step' })).toThrow()
    expect(canStall(held, 'A')).toBe(true)
    expect(canStall(held, 'B')).toBe(false)
  })

  it('a worker can stall at most once', () => {
    let state = initialState('lock')
    state = apply(state, { worker: 'A', kind: 'step' }).state
    state = apply(state, { worker: 'A', kind: 'stall' }).state
    expect(state.store.lock).toBeNull()
    expect(canStall(state, 'A')).toBe(false)
  })

  it('parses and formats schedules symmetrically', () => {
    const text = 'A A A! B B A A B B B A'
    expect(formatSchedule(parseSchedule(text))).toBe(text)
    expect(() => parseSchedule('A C')).toThrow()
  })
})

describe('code and program stay in sync', () => {
  it.each(STRATEGIES)('%s: every step points at real lines of its code', (strategy) => {
    for (const fenceReads of [true, false]) {
      const lines = codeFor(strategy, { fenceReads }).split('\n')
      for (const op of programFor(strategy, { fenceReads })) {
        for (const n of op.lines) {
          expect(n).toBeGreaterThanOrEqual(1)
          expect(n).toBeLessThanOrEqual(lines.length)
        }
        // The first line of each step is not a comment or a blank.
        const first = lines[op.lines[0]! - 1]!.trim()
        expect(first.startsWith('#')).toBe(false)
        expect(first.length).toBeGreaterThan(0)
      }
    }
  })

  it.each(STRATEGIES)('%s: every event points at real lines too', (strategy) => {
    const lines = codeFor(strategy).split('\n')
    for (const event of replay(strategy, showcaseFor(strategy)).events) {
      for (const n of event.lines) {
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(lines.length)
      }
      expect(event.label.length).toBeLessThanOrEqual(34)
    }
  })
})
