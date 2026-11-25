import { describe, expect, it } from 'vitest'
import {
  AUTOSCALE_LAG,
  BASE_PODS,
  capacityPlan,
  costOf,
  DURATION,
  FUNNEL_DESIGN,
  isSolved,
  MISSION_BUYERS,
  NAIVE_DESIGN,
  NO_FAULTS,
  REDIS_FAIL_AT,
  REDIS_FAIL_FOR,
  scorecard,
  simulate,
  STOCK,
  TARGETS,
  TICKS,
  TIMEOUT,
  type Admission,
  type Capacity,
  type Design,
  type Fault,
  type Inventory,
  type OrderWrite,
  type Scenario,
  type TargetId,
} from './logic'

const at = (buyers: number, faults: Partial<Record<Fault, boolean>> = {}, surge = 1): Scenario => ({
  buyers,
  surge,
  faults: { ...NO_FAULTS, ...faults },
})
const mission = at(MISSION_BUYERS)
const run = (design: Design, scenario: Scenario = mission) => simulate(design, scenario)
const missed = (design: Design, scenario: Scenario = mission): TargetId[] =>
  scorecard(run(design, scenario).summary)
    .filter((t) => !t.met)
    .map((t) => t.id)

/** No admission control, capacity bought to match: the brute-force answer. */
const BRUTE: Design = { ...FUNNEL_DESIGN, admission: 'none' }

const ADMISSIONS: Admission[] = ['none', 'ratelimit', 'waitingroom']
const INVENTORIES: Inventory[] = ['rw', 'lock', 'atomic', 'redis']
const WRITES: OrderWrite[] = ['sync', 'queue']
const CAPACITIES: Capacity[] = ['fixed', 'prewarm', 'reactive']
const LOADS = Array.from({ length: 20 }, (_, i) => (i + 1) * 50_000)

describe('the design everyone starts with', () => {
  const { summary } = run(NAIVE_DESIGN)

  it('sells phones that do not exist', () => {
    expect(summary.oversold).toBeGreaterThan(1)
  })

  it('misses the latency target by an order of magnitude', () => {
    expect(summary.peakP99).toBeGreaterThan(TARGETS.p99 * 5)
  })

  it('answers almost nobody, and double-sells to some of those it does answer', () => {
    expect(summary.successRate).toBeLessThan(0.1)
    expect(summary.duplicates).toBeGreaterThan(1)
  })

  it('gets exactly one thing right: it is cheap', () => {
    expect(missed(NAIVE_DESIGN)).toEqual(['oversold', 'duplicates', 'p99', 'success'])
  })
})

describe('the funnel', () => {
  it('meets every target at full scale', () => {
    expect(missed(FUNNEL_DESIGN)).toEqual([])
    expect(isSolved(run(FUNNEL_DESIGN))).toBe(true)
  })

  it('sells exactly the stock, once each', () => {
    const { summary, ticks } = run(FUNNEL_DESIGN)
    expect(summary.unitsSold).toBe(STOCK)
    expect(summary.oversold).toBe(0)
    expect(summary.duplicates).toBe(0)
    expect(ticks.at(-1)!.orders).toBeCloseTo(STOCK, 6)
  })

  it('turns away most of the crowd at the edge, before it costs anything', () => {
    const { summary } = run(FUNNEL_DESIGN)
    expect(summary.rejectedEarly / summary.arrivals).toBeGreaterThan(0.95)
    expect(summary.admitted).toBeLessThan(STOCK * 2)
  })

  it('does not notice when twice the crowd shows up', () => {
    const planned = run(FUNNEL_DESIGN).summary
    const doubled = run(FUNNEL_DESIGN, at(MISSION_BUYERS, {}, 2)).summary
    expect(doubled.arrivals).toBeCloseTo(planned.arrivals * 2, 3)
    expect(doubled.peakP99).toBeCloseTo(planned.peakP99, 9)
    expect(doubled.successRate).toBe(1)
    expect(doubled.firstSaturation).toBeNull()
  })

  it('also passes with an atomic update in the database instead of Redis', () => {
    expect(missed({ ...FUNNEL_DESIGN, inventory: 'atomic' })).toEqual([])
  })
})

describe('inventory strategies', () => {
  it('read-then-write oversells even behind a waiting room: throttling shrinks the race, it does not close it', () => {
    const fast = run({ ...FUNNEL_DESIGN, inventory: 'rw' }).summary
    const slow = run({ ...FUNNEL_DESIGN, inventory: 'rw', admitRate: 500 }).summary
    expect(fast.oversold).toBeGreaterThan(slow.oversold)
    expect(slow.oversold).toBeGreaterThan(1)
  })

  it('a row lock never oversells but saturates the database', () => {
    for (const admission of ADMISSIONS) {
      const { summary } = run({ ...FUNNEL_DESIGN, inventory: 'lock', admission })
      expect(summary.oversold).toBe(0)
      expect(summary.peakDbLoad).toBeGreaterThan(1)
      expect(summary.firstSaturation?.stage).toBe('db')
      expect(summary.peakP99).toBeGreaterThan(TARGETS.p99)
    }
  })

  it('atomic strategies never oversell, at any load, in any combination', () => {
    for (const inventory of ['lock', 'atomic', 'redis'] as Inventory[]) {
      let worstOversold = 0
      let lowestStock = STOCK
      for (const buyers of LOADS) {
        for (const admission of ADMISSIONS) {
          for (const orderWrite of WRITES) {
            for (const capacity of CAPACITIES) {
              const design = { ...FUNNEL_DESIGN, inventory, admission, orderWrite, capacity }
              const { summary, ticks } = run(design, at(buyers))
              worstOversold = Math.max(worstOversold, summary.oversold)
              for (const tick of ticks) lowestStock = Math.min(lowestStock, tick.stock)
            }
          }
        }
      }
      expect(worstOversold, inventory).toBe(0)
      expect(lowestStock, inventory).toBeGreaterThanOrEqual(0)
    }
  })

  it('units are conserved: sold plus remaining is always the stock', () => {
    for (const inventory of INVENTORIES) {
      for (const orderWrite of WRITES) {
        const { ticks } = run({ ...NAIVE_DESIGN, page: 'cdn', inventory, orderWrite })
        for (const tick of ticks) expect(tick.sold + tick.stock).toBeCloseTo(STOCK, 6)
      }
    }
  })
})

describe('capacity', () => {
  it('reactive autoscaling does nothing for the spike: the pods arrive after it', () => {
    expect(AUTOSCALE_LAG).toBeGreaterThan(DURATION)
    for (const base of [NAIVE_DESIGN, FUNNEL_DESIGN, BRUTE]) {
      const fixed = run({ ...base, capacity: 'fixed' })
      const reactive = run({ ...base, capacity: 'reactive' })
      expect(reactive.summary.pods).toBe(BASE_PODS)
      expect(reactive.ticks).toEqual(fixed.ticks)
      expect(reactive.summary.monthlyCost).toBeGreaterThan(fixed.summary.monthlyCost)
    }
  })

  it('pre-warming is sized by what reaches the service, so admission control decides the bill', () => {
    const gated = capacityPlan(FUNNEL_DESIGN, MISSION_BUYERS)
    const open = capacityPlan(BRUTE, MISSION_BUYERS)
    expect(gated.duringSale).toBeLessThan(50)
    expect(open.duringSale).toBeGreaterThan(1000)
  })

  it('brute-force capacity works, and busts the budget', () => {
    expect(missed(BRUTE)).toEqual(['cost'])
    expect(run(BRUTE).summary.monthlyCost).toBeGreaterThan(TARGETS.budget * 2)
  })

  it('brute force stops working the moment the forecast is wrong', () => {
    const { summary } = run(BRUTE, at(MISSION_BUYERS, {}, 2))
    expect(summary.firstSaturation?.stage).toBe('app')
    expect(summary.peakP99).toBeGreaterThan(TARGETS.p99)
  })

  it('at a tenth of the scale you do not need a waiting room at all', () => {
    expect(missed(BRUTE, at(50_000))).toEqual([])
  })

  it('serving the sale page from origin drags every refresh onto the order service', () => {
    const { summary } = run({ ...FUNNEL_DESIGN, page: 'origin' })
    expect(summary.plan.duringSale).toBeGreaterThan(1000)
    expect(missed({ ...FUNNEL_DESIGN, page: 'origin' })).toEqual(['cost'])
    expect(run({ ...FUNNEL_DESIGN, page: 'origin', capacity: 'fixed' }).summary.successRate).toBeLessThan(0.5)
  })
})

describe('admission', () => {
  it('a per-user rate limit does nothing about 600,000 different people asking once', () => {
    const none = run({ ...NAIVE_DESIGN, page: 'cdn' }).summary
    const limited = run({ ...NAIVE_DESIGN, page: 'cdn', admission: 'ratelimit' }).summary
    expect(limited.admitted).toBeGreaterThan(none.admitted * 0.9)
    expect(limited.successRate).toBeLessThan(0.1)
  })

  it('the admission rate has to fit the slowest stage behind it', () => {
    const sync = (admitRate: number) => missed({ ...FUNNEL_DESIGN, orderWrite: 'sync', admitRate })
    expect(sync(1000)).toEqual([])
    expect(sync(2000)).toEqual(['p99'])
  })
})

describe('order writes and retries', () => {
  it('idempotency keys remove duplicate orders', () => {
    for (const base of [NAIVE_DESIGN, FUNNEL_DESIGN]) {
      expect(run({ ...base, idempotency: false }).summary.duplicates).toBeGreaterThan(1)
      expect(run({ ...base, idempotency: true }).summary.duplicates).toBe(0)
    }
  })

  it('a retry cannot double-buy once a correct counter has reached zero', () => {
    // with no gate the stock is gone inside the first quarter second
    const { summary } = run({ ...BRUTE, idempotency: false })
    expect(summary.soldOutAt).toBeLessThanOrEqual(0.25)
    expect(summary.duplicates).toBe(0)
  })

  it('a queue keeps the write off the buy path', () => {
    const sync = run({ ...FUNNEL_DESIGN, orderWrite: 'sync' }).summary
    const queued = run(FUNNEL_DESIGN).summary
    expect(sync.peakP99).toBeGreaterThan(TARGETS.p99)
    expect(queued.peakP99).toBeLessThan(0.1)
    expect(sync.firstSaturation?.stage).toBe('db')
  })

  it('a timeout is not a rollback: slow synchronous writes leave orders the buyer never saw', () => {
    const { summary } = run({ ...NAIVE_DESIGN, page: 'cdn', capacity: 'prewarm' })
    expect(summary.ghosts).toBeGreaterThan(100)
    expect(run(FUNNEL_DESIGN).summary.ghosts).toBe(0)
  })
})

describe('injected faults', () => {
  it('Redis failover behind a waiting room: the gate closes, nobody sees an error, nothing oversells', () => {
    const { summary, ticks } = run(FUNNEL_DESIGN, at(MISSION_BUYERS, { redis: true }))
    expect(summary.errors).toBe(0)
    expect(summary.oversold).toBe(0)
    expect(summary.soldOutAt).toBeGreaterThan(REDIS_FAIL_AT + REDIS_FAIL_FOR)
    const during = ticks.filter((tick) => tick.redisDown)
    expect(during.length).toBe(REDIS_FAIL_FOR / 0.25)
    expect(during.every((tick) => tick.admissionPaused && tick.admittedRps === 0)).toBe(true)
    expect(missed(FUNNEL_DESIGN, at(MISSION_BUYERS, { redis: true }))).toEqual([])
  })

  it('Redis failover with no gate: ten seconds of errors', () => {
    const { summary } = run(BRUTE, at(MISSION_BUYERS, { redis: true }))
    expect(summary.successRate).toBeLessThan(0.5)
    expect(summary.oversold).toBe(0)
  })

  it('a design without Redis does not care about Redis', () => {
    const design = { ...FUNNEL_DESIGN, inventory: 'atomic' as const }
    const calm = run(design)
    const failing = run(design, at(MISSION_BUYERS, { redis: true }))
    expect(failing.summary.peakP99).toBe(calm.summary.peakP99)
    expect(failing.summary.successRate).toBe(calm.summary.successRate)
    expect(failing.summary.soldOutAt).toBe(calm.summary.soldOutAt)
  })

  it('slow payments sink a synchronous design and only delay a queued one', () => {
    const slow = at(MISSION_BUYERS, { pay: true })
    const sync = run({ ...FUNNEL_DESIGN, orderWrite: 'sync', admitRate: 1000 }, slow)
    const queued = run(FUNNEL_DESIGN, slow)
    expect(sync.summary.peakP99).toBeGreaterThan(TARGETS.p99 * 5)
    expect(sync.summary.firstSaturation?.stage).toBe('app')
    expect(missed(FUNNEL_DESIGN, slow)).toEqual([])
    expect(Math.max(...queued.ticks.map((tick) => tick.mqLag))).toBeGreaterThan(10)
  })

  it('a bot swarm behind a waiting room is safe but not fair, until bot defence is on', () => {
    const swarm = at(MISSION_BUYERS, { bots: true })
    const open = run(FUNNEL_DESIGN, swarm).summary
    const defended = run({ ...FUNNEL_DESIGN, botDefence: true }, swarm).summary
    expect(missed(FUNNEL_DESIGN, swarm)).toEqual([])
    expect(open.botShare).toBeGreaterThan(0.8)
    expect(defended.botShare).toBeLessThan(0.15)
    expect(missed({ ...FUNNEL_DESIGN, botDefence: true }, swarm)).toEqual([])
  })
})

describe('the model itself', () => {
  const scenarios: Scenario[] = [
    mission,
    at(50_000),
    at(1_000_000),
    at(MISSION_BUYERS, {}, 2),
    at(MISSION_BUYERS, { bots: true }),
    at(MISSION_BUYERS, { redis: true }),
    at(MISSION_BUYERS, { pay: true }),
    at(MISSION_BUYERS, { bots: true, redis: true, pay: true }),
  ]
  const designs: Design[] = []
  for (const admission of ADMISSIONS) {
    for (const inventory of INVENTORIES) {
      for (const orderWrite of WRITES) {
        for (const capacity of CAPACITIES) {
          designs.push({ ...NAIVE_DESIGN, admission, inventory, orderWrite, capacity })
          designs.push({ ...FUNNEL_DESIGN, admission, inventory, orderWrite, capacity, botDefence: true })
        }
      }
    }
  }

  it('conserves requests: arrivals = rejected early + served + errors + still queued', () => {
    let worst = 0
    for (const design of designs) {
      for (const scenario of scenarios) {
        const { summary: s } = run(design, scenario)
        const accounted = s.rejectedEarly + s.served + s.errors + s.stillQueued
        worst = Math.max(worst, Math.abs(accounted - s.arrivals) / s.arrivals)
      }
    }
    expect(worst).toBeLessThan(1e-9)
  })

  it('never produces a number that is not a number', () => {
    const problems: string[] = []
    for (const design of designs) {
      for (const scenario of scenarios) {
        const { ticks, summary } = run(design, scenario)
        if (ticks.length !== TICKS) problems.push('wrong number of ticks')
        for (const tick of ticks) {
          for (const [key, value] of Object.entries(tick)) {
            if (typeof value !== 'number') continue
            if (!Number.isFinite(value)) problems.push(`${key} is not finite at t=${tick.t}`)
            else if (value < 0 && key !== 'stock') problems.push(`${key} is negative at t=${tick.t}`)
          }
          if (tick.p99 > TIMEOUT) problems.push(`p99 beyond the deadline at t=${tick.t}`)
          if (tick.pageFail > 1) problems.push(`pageFail above 1 at t=${tick.t}`)
        }
        if (!(summary.successRate >= 0 && summary.successRate <= 1)) problems.push('successRate out of range')
        if (!(summary.botShare >= 0 && summary.botShare <= 1)) problems.push('botShare out of range')
      }
    }
    expect(problems.slice(0, 5)).toEqual([])
  })

  it('is deterministic', () => {
    for (const scenario of scenarios) {
      expect(run(NAIVE_DESIGN, scenario)).toEqual(run(NAIVE_DESIGN, scenario))
      expect(run(FUNNEL_DESIGN, scenario)).toEqual(run(FUNNEL_DESIGN, scenario))
    }
  })

  it('bills every component: adding one never lowers the total', () => {
    const total = (design: Design) => costOf(design, MISSION_BUYERS).reduce((sum, l) => sum + l.monthly, 0)
    const bare = total(NAIVE_DESIGN)
    expect(total({ ...NAIVE_DESIGN, page: 'cdn', capacity: 'prewarm' })).toBeLessThan(
      total({ ...NAIVE_DESIGN, capacity: 'prewarm' }),
    ) // the CDN pays for itself in pods you no longer pre-warm
    for (const patch of [
      { admission: 'ratelimit' },
      { admission: 'waitingroom' },
      { inventory: 'redis' },
      { orderWrite: 'queue' },
      { idempotency: true },
      { botDefence: true },
    ] as Partial<Design>[]) {
      expect(total({ ...NAIVE_DESIGN, ...patch })).toBeGreaterThan(bare)
    }
    expect(run(FUNNEL_DESIGN).summary.monthlyCost).toBe(total(FUNNEL_DESIGN))
  })
})

describe('the mission', () => {
  it('only counts at full scale with nothing injected', () => {
    expect(isSolved(run(FUNNEL_DESIGN, at(50_000)))).toBe(false)
    expect(isSolved(run(FUNNEL_DESIGN, at(MISSION_BUYERS, { redis: true })))).toBe(false)
    expect(isSolved(run(FUNNEL_DESIGN, at(1_000_000)))).toBe(true)
    expect(isSolved(run(NAIVE_DESIGN))).toBe(false)
    expect(isSolved(run(BRUTE))).toBe(false)
  })

  it('reports a cost per good order, or none when no buyer got a clean confirmation', () => {
    const funnel = run(FUNNEL_DESIGN).summary
    expect(funnel.costPerOrder).toBeCloseTo(funnel.monthlyCost / (STOCK * 30), 9)
    expect(funnel.costPerOrder!).toBeLessThan(0.1)
    expect(run(BRUTE).summary.costPerOrder!).toBeGreaterThan(funnel.costPerOrder! * 3)
  })
})
