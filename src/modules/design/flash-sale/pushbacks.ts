import type { Tone } from '@/lib/cn'
import {
  DT,
  fmtCount,
  fmtInt,
  fmtLatency,
  fmtMoney,
  fmtRate,
  NO_FAULTS,
  REDIS_FAIL_AT,
  REDIS_FAIL_FOR,
  TARGETS,
  type Run,
  type Scenario,
  type Tick,
} from './logic'

/*
 * The second half of a system design round: the interviewer changes one thing
 * and asks what breaks, and how you would know. Each pushback here re-runs the
 * simulation with one change, then answers three questions from the run itself:
 * which stage gives first, what a dashboard would show at that moment, and
 * which alert should already have fired.
 */

export type PushbackId = 'double' | 'redis' | 'pay' | 'bill'

export type Pushback = {
  id: PushbackId
  title: string
  /** The interviewer, verbatim. */
  quote: string
  /** What changes in the scenario. */
  apply: (scenario: Scenario) => Scenario
}

export const PUSHBACKS: Pushback[] = [
  {
    id: 'double',
    title: 'Double the traffic',
    quote:
      'A celebrity posts the link an hour before midnight. Twice the crowd you planned for shows up. What happens to your design?',
    apply: (s) => ({ ...s, surge: 2, faults: NO_FAULTS }),
  },
  {
    id: 'redis',
    title: 'Redis fails over',
    quote: `${REDIS_FAIL_AT} second into the sale the Redis primary dies, and the replica takes ${REDIS_FAIL_FOR} seconds to be promoted. Walk me through those ${REDIS_FAIL_FOR} seconds.`,
    apply: (s) => ({ ...s, surge: 1, faults: { ...NO_FAULTS, redis: true } }),
  },
  {
    id: 'pay',
    title: 'Payments go slow',
    quote:
      'Your payment provider is having a bad night. Its p99 goes from 250 milliseconds to 3 seconds. Who notices, and when?',
    apply: (s) => ({ ...s, surge: 1, faults: { ...NO_FAULTS, pay: true } }),
  },
  {
    id: 'bill',
    title: 'Finance reads the bill',
    quote:
      'Finance wants to know why selling S$1 phones costs what it costs. Which line do you defend first, and which would you give up?',
    apply: (s) => ({ ...s, surge: 1, faults: NO_FAULTS }),
  },
]

/* ── which stage gives first ──────────────────────────────────────────── */

export type Verdict = { tone: Tone; headline: string; detail: string }

const at = (t: number) => (t === 0 ? 'in the first quarter second' : `at ${t.toFixed(2)} s`)

export function firstToGive(id: PushbackId, run: Run): Verdict {
  const { design, summary, ticks } = run
  const gate = design.admission === 'waitingroom'
  const sync = design.orderWrite === 'sync'
  const sat = summary.firstSaturation

  if (id === 'redis' && design.inventory !== 'redis') {
    return {
      tone: 'neutral',
      headline: 'There is no Redis in this design.',
      detail:
        'Nothing fails over, so nothing changes. The same question now lands on your database primary: what does the sale do for the thirty seconds it takes to promote a replica? Without a gate in front, the answer is thirty seconds of errors.',
    }
  }

  if (!sat) {
    return {
      tone: 'ok',
      headline: 'Nothing saturates.',
      detail: gate
        ? `The line at the edge got longer and that is all. Everything behind the waiting room saw the same ${fmtInt(design.admitRate)} requests a second it was sized for.`
        : 'Every stage stayed inside its capacity for the whole run.',
    }
  }

  if (sat.stage === 'redis') {
    const down = ticks.some((tick) => tick.redisDown)
    if (down) {
      return gate
        ? {
            tone: 'warn',
            headline: `Redis is gone from second ${REDIS_FAIL_AT} to second ${REDIS_FAIL_AT + REDIS_FAIL_FOR}.`,
            detail:
              'The waiting room sees its dependency fail and closes the gate. People keep their place in line and nobody is shown an error. When the replica is promoted, the counter is rebuilt from confirmed orders before the gate reopens, because a promoted replica can be missing the last few decrements.',
          }
        : {
            tone: 'bad',
            headline: `Redis is gone from second ${REDIS_FAIL_AT} to second ${REDIS_FAIL_AT + REDIS_FAIL_FOR}.`,
            detail:
              'There is no gate in front of it, so every request in those ten seconds reaches a dead dependency and fails. Failing closed is still the right call: selling without the counter is how you oversell.',
          }
    }
    return {
      tone: 'bad',
      headline: `Redis saturates first, ${at(sat.t)}.`,
      detail:
        'One primary cannot decide this many requests a second. Without a gate, the size of the crowd sets the load on the counter.',
    }
  }

  if (sat.stage === 'app') {
    const detail =
      sync && run.scenario.faults.pay
        ? 'Its threads are parked on payment calls that now take three seconds, so it has none left to accept new work. A slow dependency called inside the request becomes your outage.'
        : design.page === 'origin'
          ? 'Sale-page refreshes and buy requests are competing for the same pods, and the refreshes outnumber the buys.'
          : 'More requests arrive than the fleet has threads for. They queue, wait, and are shed at the deadline.'
    return { tone: 'bad', headline: `The order service saturates first, ${at(sat.t)}.`, detail }
  }

  if (sat.stage === 'db') {
    const detail =
      design.inventory === 'lock'
        ? 'Every buyer is waiting for the same row lock. It is correct, and it is single file.'
        : !gate
          ? 'Hundreds of thousands of people who are about to be told "sold out" are each spending a database query to hear it.'
          : sync
            ? `Each confirmed order needs two writes inside the request, and the primary cannot keep pace with ${fmtInt(design.admitRate)} admissions a second.`
            : 'The request path is asking the primary for more operations than it sustains at this admission rate.'
    return { tone: 'bad', headline: `The primary database saturates first, ${at(sat.t)}.`, detail }
  }

  // payments
  if (sync) {
    return {
      tone: 'bad',
      headline: `Request threads fill up with payment calls, ${at(sat.t)}.`,
      detail:
        'Every buyer who wins a unit holds a thread until the provider answers. At three seconds a call, the fleet runs out.',
    }
  }
  const lag = Math.max(...ticks.map((tick) => tick.mqLag))
  return {
    tone: 'warn',
    headline: 'Only the worker is waiting on payments.',
    detail: `Buyers were told "order accepted" in ${fmtLatency(summary.peakP99)} and have no idea anything is wrong. Confirmations arrive late: the oldest order waits about ${Math.round(lag)} seconds. That is the trade you made when you put the queue there.`,
  }
}

/* ── what the dashboard shows ─────────────────────────────────────────── */

export type Signal = {
  id: string
  /** What the panel is called on the dashboard. */
  label: string
  /** One value per simulation step. */
  series: number[]
  format: (v: number) => string
  /** Where the alert trips; drawn on the chart. */
  threshold?: number
  min?: number
  max?: number
  /** The alert rule, in words. */
  alert: string
  /** Second at which the rule would trip in this run, or null if it stays quiet. */
  firesAt: number | null
  /** Whether tripping means "page someone" or "worth knowing". */
  severity: 'page' | 'inform'
  /** What this panel is telling you in this run. */
  reading: string
}

const SUSTAIN = Math.round(1 / DT)

/** First moment a condition has held for a full second. */
function sustained(ticks: Tick[], test: (tick: Tick) => boolean, need = SUSTAIN): number | null {
  let streak = 0
  for (let i = 0; i < ticks.length; i++) {
    streak = test(ticks[i]!) ? streak + 1 : 0
    if (streak >= need) return (i + 1) * DT
  }
  return null
}

const peak = (xs: number[]) => xs.reduce((max, x) => Math.max(max, x), 0)
const pct = (v: number) => `${Math.round(v * 100)}%`
const when = (t: number | null) => (t === null ? 'Stays quiet.' : `Trips at ${t.toFixed(2)} s.`)

function p99Signal({ ticks }: Run): Signal {
  const series = ticks.map((tick) => tick.p99)
  const firesAt = sustained(ticks, (tick) => tick.p99 > TARGETS.p99)
  return {
    id: 'p99',
    label: 'Buy-path p99',
    series,
    format: fmtLatency,
    threshold: TARGETS.p99,
    max: 2,
    alert: `Above ${fmtLatency(TARGETS.p99)} for one second.`,
    firesAt,
    severity: 'page',
    reading:
      firesAt === null
        ? `Peaks at ${fmtLatency(peak(series))}. From the buyer's side, nothing happened.`
        : `Peaks at ${fmtLatency(peak(series))}. This is the one buyers feel, and it is the last to move: by the time it trips, a queue upstream has been growing for a while.`,
  }
}

function lineSignal({ ticks, design }: Run): Signal {
  const series = ticks.map((tick) => tick.waiting)
  const firesAt = sustained(ticks, (tick) => tick.admissionPaused)
  return {
    id: 'line',
    label: 'People in the waiting room',
    series,
    format: fmtCount,
    alert: 'Do not page on length. Page if the gate is shut, or the oldest person has waited a minute, while stock remains.',
    firesAt,
    severity: 'page',
    reading: `Peaks at ${fmtCount(peak(series))}. This is the number that absorbs a surge, so it is supposed to be large. What matters is that ${fmtInt(design.admitRate)} a second keep leaving it.`,
  }
}

function queueWaitSignal({ ticks }: Run): Signal {
  const series = ticks.map((tick) => tick.appWait)
  const firesAt = sustained(ticks, (tick) => tick.appWait > 0.25)
  return {
    id: 'queue-wait',
    label: 'Order service queue wait',
    series,
    format: fmtLatency,
    threshold: 0.25,
    max: 5,
    alert: 'Above 250 ms for one second.',
    firesAt,
    severity: 'page',
    reading:
      firesAt === null
        ? 'Flat. Requests are being picked up as they arrive.'
        : `Climbs to ${fmtLatency(peak(series))}. Queue wait leads latency: it tells you the fleet is behind before the p99 does.`,
  }
}

function dbSignal({ ticks, design }: Run): Signal {
  const series = ticks.map((tick) => Math.min(tick.dbLoad, 1.5))
  const firesAt = sustained(ticks, (tick) => tick.dbLoad > 0.85)
  return {
    id: 'db',
    label: design.inventory === 'lock' ? 'Primary DB: lock wait and utilisation' : 'Primary DB utilisation',
    series,
    format: (v) => (v >= 1.5 ? 'over 150%' : pct(v)),
    threshold: 0.85,
    max: 1.5,
    alert: 'Above 85% for one second, or lock wait above 100 ms.',
    firesAt,
    severity: 'page',
    reading:
      firesAt === null
        ? `Peaks at ${pct(peak(series))}. The primary only ever sees work that survived the funnel.`
        : 'Pinned. The primary is the one component you cannot rent more of for a night, so this is the alert that ends the sale.',
  }
}

function redisSignal({ ticks }: Run): Signal {
  const series = ticks.map((tick) => Math.min(tick.redisLoad, 1.5))
  const firesAt = sustained(ticks, (tick) => tick.redisLoad > 0.85)
  return {
    id: 'redis-load',
    label: 'Redis operations against capacity',
    series,
    format: (v) => (v >= 1.5 ? 'over 150%' : pct(v)),
    threshold: 0.85,
    max: 1.5,
    alert: 'Above 85% for one second.',
    firesAt,
    severity: 'page',
    reading:
      firesAt === null
        ? `Peaks at ${pct(peak(series))}. The counter is nowhere near its limit.`
        : 'The counter itself is the bottleneck. Its load is set by whoever shows up, not by a number you chose.',
  }
}

function invErrorSignal({ ticks }: Run): Signal {
  const series = ticks.map((tick) => tick.invErrRps)
  const firesAt = sustained(ticks, (tick) => tick.invErrRps > 0, 1)
  return {
    id: 'inv-errors',
    label: 'Inventory errors per second',
    series,
    format: fmtRate,
    alert: 'Any inventory errors: close the gate automatically, then page.',
    firesAt,
    severity: 'page',
    reading:
      firesAt === null
        ? 'Zero throughout. No request ever reached the counter while it was down.'
        : `Peaks at ${fmtRate(peak(series))}. Every one of these is a buyer looking at an error page.`,
  }
}

function gateSignal({ ticks, design }: Run): Signal {
  const series = ticks.map((tick) => tick.admittedRps)
  const gate = design.admission === 'waitingroom'
  const firesAt = sustained(ticks, (tick) => tick.admissionPaused)
  return {
    id: 'gate',
    label: 'Admission rate',
    series,
    format: fmtRate,
    alert: 'Admission at zero while stock remains.',
    firesAt,
    severity: 'inform',
    reading: gate
      ? firesAt === null
        ? 'Steady until the stock is gone, then zero.'
        : 'Drops to zero when the counter becomes unreachable and returns when it is back. This alert is the system telling you it protected itself.'
      : 'There is no gate, so this is simply the size of the crowd. Nothing can close.',
  }
}

function invariantSignal({ ticks }: Run): Signal {
  const series = ticks.map((tick) => tick.stock)
  const firesAt = sustained(ticks, (tick) => tick.oversold > 0.5, 1)
  const lowest = series.reduce((min, x) => Math.min(min, x), 0)
  return {
    id: 'invariant',
    label: 'Stock left, checked against orders',
    series,
    format: (v) => `${v < 0 ? '−' : ''}${fmtInt(Math.abs(v))}`,
    threshold: 0,
    min: Math.min(0, lowest),
    alert: 'Stock below zero, or sold plus remaining not equal to 5,000: stop the sale.',
    firesAt,
    severity: 'page',
    reading:
      firesAt === null
        ? 'Counts down to zero and stops. Sold plus remaining equals 5,000 at every step, including across the failover.'
        : `Goes to ${fmtInt(lowest)}. This is the correctness alarm: latency can be forgiven the next morning, phantom phones cannot.`,
  }
}

function paySignal({ ticks, design }: Run): Signal {
  const sync = design.orderWrite === 'sync'
  const series = ticks.map((tick) => tick.payLoad)
  const firesAt = sustained(ticks, (tick) => tick.payLoad > 0.5)
  return {
    id: 'pay',
    label: sync ? 'Request threads held by payment calls' : 'Worker threads held by payment calls',
    series,
    format: pct,
    threshold: 0.5,
    max: 1,
    alert: sync
      ? 'More than half the threads waiting on one dependency: open the circuit breaker.'
      : 'More than half the worker waiting on one dependency: worth knowing. The queue is absorbing it.',
    firesAt,
    severity: sync ? 'page' : 'inform',
    reading: sync
      ? firesAt === null
        ? `Peaks at ${pct(peak(series))}.`
        : `Climbs to ${pct(peak(series))}. The service is healthy and cannot work: most of its threads are waiting on someone else.`
      : 'Pinned, and it does not matter to buyers. The worker is slow; the buy path never calls the provider.',
  }
}

function lagSignal({ ticks }: Run): Signal {
  const series = ticks.map((tick) => tick.mqLag)
  const firesAt = sustained(ticks, (tick) => tick.mqLag > 10)
  return {
    id: 'lag',
    label: 'Queue lag: age of the oldest order',
    series,
    format: (v) => `${v.toFixed(1)} s`,
    threshold: 10,
    alert: 'Oldest order waiting more than 10 seconds.',
    firesAt,
    severity: 'inform',
    reading:
      firesAt === null
        ? `Peaks at ${peak(series).toFixed(1)} s. Orders are written almost as fast as they are accepted.`
        : `Reaches ${Math.round(peak(series))} s. Alert on age, not depth: a deep queue that drains is fine, an old one means confirmations are late.`,
  }
}

/** The three panels worth watching for a given pushback, built from the run. */
export function signalsFor(id: PushbackId, run: Run): Signal[] {
  const { design } = run
  if (id === 'double') {
    return [
      design.admission === 'waitingroom' ? lineSignal(run) : queueWaitSignal(run),
      design.inventory === 'redis' ? redisSignal(run) : dbSignal(run),
      p99Signal(run),
    ]
  }
  if (id === 'redis') {
    return design.inventory === 'redis'
      ? [invErrorSignal(run), gateSignal(run), invariantSignal(run)]
      : [dbSignal(run), invariantSignal(run), p99Signal(run)]
  }
  if (id === 'pay') {
    return [
      paySignal(run),
      design.orderWrite === 'queue' ? lagSignal(run) : queueWaitSignal(run),
      p99Signal(run),
    ]
  }
  return []
}

export function alertSummary(signal: Signal): string {
  return when(signal.firesAt)
}

/* ── the bill ─────────────────────────────────────────────────────────── */

/** What to say about the bill, derived from the bill. */
export function billRemarks(run: Run): string[] {
  const { summary, design } = run
  const remarks: string[] = []
  const line = (id: string) => summary.costLines.find((l) => l.id === id)?.monthly ?? 0
  const share = (id: string) => line(id) / summary.monthlyCost

  if (summary.costPerOrder === null) {
    remarks.push(
      'No buyer received a clean confirmation in this run, so cost per good order is undefined. A small bill that buys nothing is not cheap.',
    )
  } else {
    remarks.push(
      `Each good order costs about S$${summary.costPerOrder.toFixed(3)} to serve, on a phone that sells for S$1. That is the number to defend, not the monthly total.`,
    )
  }

  if (share('prewarm') > 0.3) {
    remarks.push(
      `Pre-warmed pods are ${Math.round(share('prewarm') * 100)}% of the bill, ${fmtMoney(line('prewarm'))} a month. They are sized by the peak that reaches the service, so the size of the crowd is setting your spend. Put a gate in front and this line all but disappears.`,
    )
  } else if (design.capacity === 'prewarm' && design.admission === 'waitingroom') {
    remarks.push(
      `Pre-warming costs ${fmtMoney(line('prewarm'))} because the waiting room fixed the peak at ${fmtInt(design.admitRate)} a second. The waiting room is what makes every other line small.`,
    )
  }

  if (design.capacity === 'reactive') {
    remarks.push(
      `The ${fmtMoney(line('autoscale'))} for autoscaled pods is the line to give up: they come up about a minute after the sale has ended.`,
    )
  }

  if (design.page === 'origin' && design.capacity === 'prewarm') {
    remarks.push(
      'Serving the sale page from origin means every refresh is priced in pods. A CDN line of S$600 would remove more than half of the pre-warm cost.',
    )
  }

  if (design.botDefence) {
    remarks.push(
      `Bot defence at ${fmtMoney(line('botdefence'))} buys fairness, not speed. Defend it with the share of units that reach real buyers during a swarm, or give it up knowingly.`,
    )
  }

  if (design.inventory === 'redis' && design.admission === 'waitingroom' && design.admitRate <= 3000) {
    remarks.push(
      `At ${fmtInt(design.admitRate)} admissions a second, an atomic update in the database would also hold. Redis is ${fmtMoney(line('redis'))} of headroom: it is what lets you raise the admission rate later without touching the primary.`,
    )
  }

  remarks.push(
    summary.monthlyCost <= TARGETS.budget
      ? `Total ${fmtMoney(summary.monthlyCost)} against a budget of ${fmtMoney(TARGETS.budget)}.`
      : `Total ${fmtMoney(summary.monthlyCost)}: ${fmtMoney(summary.monthlyCost - TARGETS.budget)} over a budget of ${fmtMoney(TARGETS.budget)}.`,
  )
  return remarks
}
