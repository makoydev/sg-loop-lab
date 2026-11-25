/*
 * A flash sale, simulated.
 *
 * 5,000 units, a few hundred thousand people tapping Buy in the same second.
 * This file turns a set of design choices into a deterministic, tick-by-tick
 * account of the first 20 seconds: where each request went, which stage
 * queued, how much stock was left, what it all costs.
 *
 * It is a teaching model. Every capacity below is a round number picked so the
 * shape of the problem is visible; none of them is a benchmark. The UI only
 * renders what this file computes, so everything here is pure and unit-tested.
 */

/* ── the design space ─────────────────────────────────────────────────── */

export type PageMode = 'origin' | 'cdn'
export type Admission = 'none' | 'ratelimit' | 'waitingroom'
export type Inventory = 'rw' | 'lock' | 'atomic' | 'redis'
export type OrderWrite = 'sync' | 'queue'
export type Capacity = 'fixed' | 'prewarm' | 'reactive'
export type Fault = 'bots' | 'redis' | 'pay'

export type Design = {
  /** Where the sale page (and every refresh of it) is served from. */
  page: PageMode
  admission: Admission
  /** Waiting room only: buy requests let through per second. */
  admitRate: number
  inventory: Inventory
  orderWrite: OrderWrite
  /** Idempotency key on create-order. */
  idempotency: boolean
  capacity: Capacity
  botDefence: boolean
}

export type Scenario = {
  /** Buyers the sale was planned for. Capacity is sized from this. */
  buyers: number
  /** Multiplier on the traffic that actually shows up (the plan does not know). */
  surge?: number
  faults: Record<Fault, boolean>
}

export const NO_FAULTS: Record<Fault, boolean> = { bots: false, redis: false, pay: false }

/** Where everyone starts: the design that works fine on a normal Tuesday. */
export const NAIVE_DESIGN: Design = {
  page: 'origin',
  admission: 'none',
  admitRate: 2000,
  inventory: 'rw',
  orderWrite: 'sync',
  idempotency: false,
  capacity: 'fixed',
  botDefence: false,
}

/** The funnel: reject at the edge, decide in memory, write behind a queue. */
export const FUNNEL_DESIGN: Design = {
  page: 'cdn',
  admission: 'waitingroom',
  admitRate: 2000,
  inventory: 'redis',
  orderWrite: 'queue',
  idempotency: true,
  capacity: 'prewarm',
  botDefence: false,
}

/* ── the numbers the model runs on ────────────────────────────────────── */

/** Seconds per simulation step. */
export const DT = 0.25
/** Seconds simulated. */
export const DURATION = 20
export const TICKS = DURATION / DT
export const STOCK = 5000
export const MISSION_BUYERS = 600_000

/** Arrivals decay with this time constant: most taps land in the first ten seconds. */
const TAU = 5
/** Sale-page loads per buyer, arriving in the same spike. */
const PAGE_FACTOR = 1.2
/** Bot requests per human request on an ordinary night, and during a swarm. */
const BOT_BASE = 0.1
const BOT_SWARM = 5
/** Share of bot requests that still get past bot defence. */
const BOT_DEFENCE_PASS = 0.02
/** A per-user limit caps the bot accounts, combined, at this many requests a second. */
const BOT_ACCOUNT_CAP = 2500

export const POD_RPS = 100
export const BASE_PODS = 10
const THREADS_PER_POD = 200
/** Pre-warming provisions this much above the peak it expects. */
const HEADROOM = 1.4
/** Reactive autoscaling notices, decides and boots pods in about this long. */
export const AUTOSCALE_LAG = 75

/** A request that has not been answered by now is abandoned. */
export const TIMEOUT = 5
/** Queues shed anything that has already waited this long: it could not finish in time. */
const SHED_AFTER = TIMEOUT * 0.9
/** Writes per second the primary database sustains. It does not grow for one night. */
export const DB_OPS = 3000
/** Transactions per second through one row lock. */
export const LOCK_TPS = 300
export const REDIS_OPS = 150_000
/** Orders per second the queue worker writes at most, and its payment concurrency. */
const WORKER_MAX = 1200
const WORKER_THREADS = 800
/** The worker leaves the database this much headroom for the request path. */
const WORKER_DB_SHARE = 0.7

export const PAY_NORMAL = 0.25
export const PAY_SLOW = 3
export const REDIS_FAIL_AT = 1
export const REDIS_FAIL_FOR = 10

/** Winners whose response is lost on a flaky mobile network, and who tap again. */
const DUP_BASE = 0.02
/** Buyers who saw a timeout, although their order went through, and who try again. */
const GHOST_RETRY = 0.5

const SVC_APP = 0.035
const SVC_INV: Record<Inventory, number> = { rw: 0.014, lock: 0.012, atomic: 0.008, redis: 0.002 }
const SVC_WRITE = 0.03
const SVC_ENQUEUE = 0.004

export const SALES_PER_MONTH = 30
export const TARGETS = {
  /** Buy-path p99, seconds. */
  p99: 0.5,
  /** Share of admitted requests that get an answer. */
  success: 0.995,
  /** S$ per month. */
  budget: 10_000,
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/* ── capacity and cost ────────────────────────────────────────────────── */

const NORM = 1 - Math.exp(-DURATION / TAU)

/** Human buy requests per second at the very start of the sale. */
export function peakBuyRps(buyers: number): number {
  return (buyers * (1 - Math.exp(-DT / TAU))) / NORM / DT
}

export type CapacityPlan = {
  /** Pods it would take to serve the planned peak with headroom. */
  needed: number
  /** Pods actually serving during the 20 seconds that matter. */
  duringSale: number
  /** Pods the fleet reaches once any scaling has finished. */
  eventually: number
}

/** Size the order-service fleet from what the plan expects to reach it. */
export function capacityPlan(design: Design, plannedBuyers: number): CapacityPlan {
  const humans = peakBuyRps(plannedBuyers)
  let buyPeak: number
  if (design.admission === 'waitingroom') {
    buyPeak = design.admitRate
  } else {
    let bots = humans * BOT_BASE * (design.botDefence ? BOT_DEFENCE_PASS : 1)
    if (design.admission === 'ratelimit') bots = Math.min(bots, BOT_ACCOUNT_CAP)
    buyPeak = humans + bots
  }
  const pagePeak = design.page === 'origin' ? humans * PAGE_FACTOR : 0
  const needed = Math.max(BASE_PODS, Math.ceil(((buyPeak + pagePeak) * HEADROOM) / POD_RPS))
  if (design.capacity === 'prewarm') return { needed, duringSale: needed, eventually: needed }
  if (design.capacity === 'reactive') return { needed, duringSale: BASE_PODS, eventually: needed }
  return { needed, duringSale: BASE_PODS, eventually: BASE_PODS }
}

export type CostLine = { id: string; label: string; monthly: number; note: string }

const POD_HOUR = 0.12
const HOURS_PER_MONTH = 730
/** A pre-warmed pod is held for three hours around each sale. */
const PREWARM_HOURS = 3
/** A reactively scaled pod lives for about fifteen minutes per sale. */
const REACTIVE_HOURS = 0.25

/** Monthly bill for a design, assuming one sale like this every night. */
export function costOf(design: Design, plannedBuyers: number): CostLine[] {
  const plan = capacityPlan(design, plannedBuyers)
  const lines: CostLine[] = [
    {
      id: 'fleet',
      label: `Order service, ${BASE_PODS} pods always on`,
      monthly: BASE_PODS * HOURS_PER_MONTH * POD_HOUR,
      note: 'The fleet that serves a normal day.',
    },
    {
      id: 'db',
      label: 'Orders database, primary and replica',
      monthly: 3200,
      note: 'The same in every design. It is the part you cannot rent by the hour.',
    },
  ]
  const extra = plan.eventually - BASE_PODS
  if (design.capacity === 'prewarm' && extra > 0) {
    lines.push({
      id: 'prewarm',
      label: `Pre-warmed pods, ${extra.toLocaleString('en-SG')} extra`,
      monthly: extra * PREWARM_HOURS * SALES_PER_MONTH * POD_HOUR,
      note: `Held for ${PREWARM_HOURS} hours around each sale, sized to the peak that reaches the service.`,
    })
  }
  if (design.capacity === 'reactive' && extra > 0) {
    lines.push({
      id: 'autoscale',
      label: `Autoscaled pods, ${extra.toLocaleString('en-SG')} extra`,
      monthly: extra * REACTIVE_HOURS * SALES_PER_MONTH * POD_HOUR,
      note: 'Cheap, because they arrive after the sale and leave soon after.',
    })
  }
  if (design.page === 'cdn') {
    lines.push({
      id: 'cdn',
      label: 'CDN for the sale page',
      monthly: 600,
      note: 'Static shell and cached stock status, served from the edge.',
    })
  }
  if (design.admission === 'ratelimit') {
    lines.push({
      id: 'ratelimit',
      label: 'Per-user rate limit at the edge',
      monthly: 250,
      note: 'Stops one account hammering. Does nothing about 600,000 accounts asking once.',
    })
  }
  if (design.admission === 'waitingroom') {
    lines.push({
      id: 'waitingroom',
      label: 'Virtual waiting room',
      monthly: 1400,
      note: 'Holds the crowd at the edge and lets through only what the stack can take.',
    })
  }
  if (design.botDefence) {
    lines.push({
      id: 'botdefence',
      label: 'Bot defence',
      monthly: 1800,
      note: 'Device attestation and one place in line per verified account.',
    })
  }
  if (design.inventory === 'redis') {
    lines.push({
      id: 'redis',
      label: 'Redis, primary and replica',
      monthly: 700,
      note: 'Holds the stock counter in memory, in front of the database.',
    })
  }
  if (design.orderWrite === 'queue') {
    lines.push({
      id: 'queue',
      label: 'Message queue and worker',
      monthly: 650,
      note: 'Accepts the order now, writes it at a pace the database can keep.',
    })
  }
  if (design.idempotency) {
    lines.push({
      id: 'idempotency',
      label: 'Idempotency key store',
      monthly: 60,
      note: 'One small record per order attempt, kept for a day.',
    })
  }
  return lines
}

/* ── the simulation ───────────────────────────────────────────────────── */

export type Stage = 'app' | 'redis' | 'db' | 'pay'

export type Tick = {
  /** Seconds since 00:00:00 at the start of this step. */
  t: number

  /* traffic, per second */
  humanRps: number
  botRps: number
  pageRps: number
  /** Bots turned away at the edge. */
  blockedRps: number
  /** People in the waiting room told "sold out". */
  soldOutRps: number
  admittedRps: number
  /** Requests the inventory step decided. */
  decidedRps: number
  /** Units handed out. */
  winnersRps: number
  /** Requests answered, with a unit or with a clean "sold out". */
  servedRps: number
  appErrRps: number
  invErrRps: number
  writeErrRps: number
  /** Database operations issued by the request path. */
  dbRequestOpsRps: number
  /** Orders written inside the request (synchronous designs). */
  syncWriteRps: number
  enqueueRps: number
  /** Orders the worker wrote. */
  workerRps: number

  /* queues, in requests */
  waiting: number
  appQueue: number
  invQueue: number
  writeQueue: number
  mqBacklog: number

  /* seconds of queueing at each stage */
  appWait: number
  invWait: number
  writeWait: number
  /** Age of the oldest order waiting on the worker. */
  mqLag: number

  /* utilisation: 1 means saturated */
  appLoad: number
  dbLoad: number
  redisLoad: number
  payLoad: number
  /** Share of sale-page loads that failed. */
  pageFail: number

  /* state at the end of the step */
  stock: number
  oversold: number
  duplicates: number
  /** Orders whose buyer saw a timeout, although the order was still written. */
  ghosts: number
  /** Units promised to a buyer so far. */
  sold: number
  /** Orders persisted in the database. */
  orders: number
  unitsToBots: number
  /** Buy-path p99 for requests in flight during this step, seconds (0 when idle). */
  p99: number
  redisDown: boolean
  /** The waiting room is holding everyone because its dependency is unhealthy. */
  admissionPaused: boolean
}

export type Summary = {
  arrivals: number
  rejectedEarly: number
  admitted: number
  served: number
  errors: number
  /** Still in a queue when the 20 seconds end. */
  stillQueued: number

  oversold: number
  duplicates: number
  /** Orders written for buyers who had already been shown an error. */
  ghosts: number
  peakP99: number
  successRate: number
  peakDbLoad: number
  peakAppLoad: number
  /** Real units that reached a buyer (never more than the stock). */
  unitsSold: number
  /** Share of those units that went to bots. */
  botShare: number
  /** Seconds until the stock ran out, or null if it did not. */
  soldOutAt: number | null
  /** First stage to saturate, and when. */
  firstSaturation: { stage: Stage; t: number } | null

  pods: number
  plan: CapacityPlan
  monthlyCost: number
  costLines: CostLine[]
  /** Monthly cost divided by the month's good orders, or null if there were none. */
  costPerOrder: number | null
}

export type Run = { design: Design; scenario: Scenario; ticks: Tick[]; summary: Summary }

/** Simulate the first 20 seconds of the sale. Deterministic: same inputs, same run. */
export function simulate(design: Design, scenario: Scenario): Run {
  const actualBuyers = scenario.buyers * (scenario.surge ?? 1)
  const plan = capacityPlan(design, scenario.buyers)
  const pods = plan.duringSale
  const threads = pods * THREADS_PER_POD
  const payLatency = scenario.faults.pay ? PAY_SLOW : PAY_NORMAL
  const botFactor = scenario.faults.bots ? BOT_SWARM : BOT_BASE
  const sync = design.orderWrite === 'sync'
  const inv = design.inventory
  const dbBudget = DB_OPS * DT
  const workerRate = Math.min(WORKER_MAX, WORKER_THREADS / payLatency)

  let stock = STOCK
  let waiting = 0
  let waitingBots = 0
  let appQ = 0
  let appBots = 0
  let invQ = 0
  let invBots = 0
  let writeQ = 0
  let mq = 0
  let payInFlight = 0
  // the waiting room polls the stock counter, so it hears "sold out" one step late
  let soldOutSeen = false
  let soldOutKnown = false
  // read-then-write only: requests that read "in stock" before the last decrement landed
  let staleCarry = 0
  let crossed = false
  let prevDbWait = 0

  let arrivals = 0
  let rejectedEarly = 0
  let admitted = 0
  let served = 0
  let errors = 0
  let duplicates = 0
  let ghosts = 0
  let cleanOrders = 0
  let sold = 0
  let orders = 0
  let toBots = 0
  let handedOut = 0
  let soldOutAt: number | null = null
  let firstSaturation: Summary['firstSaturation'] = null

  const ticks: Tick[] = []

  for (let k = 0; k < TICKS; k++) {
    const t = k * DT

    /* who shows up */
    const share = (Math.exp(-t / TAU) - Math.exp(-(t + DT) / TAU)) / NORM
    const humans = actualBuyers * share
    const botsRaw = humans * botFactor
    const pages = humans * PAGE_FACTOR
    arrivals += humans + botsRaw

    /* the edge */
    let botsIn = design.botDefence ? botsRaw * BOT_DEFENCE_PASS : botsRaw
    if (design.admission === 'ratelimit') botsIn = Math.min(botsIn, BOT_ACCOUNT_CAP * DT)
    const blocked = botsRaw - botsIn
    rejectedEarly += blocked
    const passed = humans + botsIn

    const redisDown =
      scenario.faults.redis && t >= REDIS_FAIL_AT && t < REDIS_FAIL_AT + REDIS_FAIL_FOR
    const invHealthy = !(inv === 'redis' && redisDown)

    /* admission */
    let admit = 0
    let admitBots = 0
    let soldOutNow = 0
    let admissionPaused = false
    if (design.admission === 'waitingroom') {
      waiting += passed
      waitingBots += botsIn
      if (soldOutKnown) {
        soldOutNow = waiting
        waiting = 0
        waitingBots = 0
      } else if (invHealthy) {
        admit = Math.min(waiting, design.admitRate * DT)
        admitBots = waiting > 0 ? admit * (waitingBots / waiting) : 0
        waiting -= admit
        waitingBots -= admitBots
      } else {
        admissionPaused = true
      }
    } else {
      admit = passed
      admitBots = botsIn
    }
    rejectedEarly += soldOutNow
    admitted += admit

    /* order service */
    appQ += admit
    appBots += admitBots
    const threadFactor = sync ? Math.max(0.05, 1 - payInFlight / threads) : 1
    const appCap = pods * POD_RPS * DT * threadFactor
    const pageDemand = design.page === 'origin' ? pages : 0
    const appDemand = appQ + pageDemand
    const buyCap = appDemand > 0 ? appCap * (appQ / appDemand) : appCap
    const appDone = Math.min(appQ, buyCap)
    const appDoneBots = appQ > 0 ? appDone * (appBots / appQ) : 0
    appQ -= appDone
    appBots -= appDoneBots
    const pagesServed =
      design.page === 'origin' ? Math.min(pageDemand, Math.max(0, appCap - appDone)) : pages
    const pageFail = pageDemand > 0 ? 1 - pagesServed / pageDemand : 0
    const buyRate = buyCap / DT
    let appErr = 0
    const appMaxQ = buyRate * SHED_AFTER
    if (appQ > appMaxQ) {
      appErr = appQ - appMaxQ
      appBots *= appMaxQ / appQ
      appQ = appMaxQ
    }
    const appWait = appQ > 1e-9 ? (buyRate > 0 ? appQ / buyRate : TIMEOUT) : 0
    const appLoad = appCap > 0 ? appDemand / appCap : 0

    /* inventory */
    invQ += appDone
    invBots += appDoneBots
    const invQBefore = invQ
    const opsPerAttempt = inv === 'rw' ? (stock > 0 ? 1.5 : 0.5) : inv === 'atomic' ? 1 : inv === 'lock' ? 2 : 0
    const invOps = invQ * opsPerAttempt
    const syncWriteOps = sync ? writeQ * 2 : 0
    // each consumer can use at most the whole database in one step; when both
    // want more than there is, they share it in proportion
    const invWant = Math.min(invOps, dbBudget)
    const writeWant = Math.min(syncWriteOps, dbBudget)
    const contended = invWant + writeWant > dbBudget
    const dbScale = contended ? dbBudget / (invWant + writeWant) : 1
    const dbForInv = contended ? invWant * dbScale : dbBudget - writeWant
    const dbForWrite = contended ? writeWant * dbScale : dbBudget - invWant
    let invRate: number
    if (inv === 'redis') invRate = invHealthy ? REDIS_OPS : 0
    else if (inv === 'lock') invRate = Math.min(LOCK_TPS, dbForInv / 2 / DT)
    else invRate = dbForInv / opsPerAttempt / DT
    const invDone = Math.min(invQ, invRate * DT)
    const invDoneBots = invQ > 0 ? invDone * (invBots / invQ) : 0
    invQ -= invDone
    invBots -= invDoneBots
    let invErr = 0
    if (!invHealthy) {
      // the counter is unreachable: fail closed, and fast
      invErr = invQ
      invQ = 0
      invBots = 0
    } else {
      const invMaxQ = invRate * Math.max(DT, SHED_AFTER - appWait)
      if (invQ > invMaxQ) {
        invErr = invQ - invMaxQ
        invBots *= invMaxQ / invQ
        invQ = invMaxQ
      }
    }
    const invWait = invQ > 1e-9 && invRate > 0 ? invQ / invRate : 0
    const invOpsUsed = invDone * opsPerAttempt
    const staleGap = clamp(0.02 + prevDbWait, 0.02, 0.5)

    /* who gets a unit */
    let winners = 0
    let extra = 0
    if (stock > 0) {
      winners = Math.min(invDone, stock)
      stock -= winners
    }
    if (inv === 'rw') {
      // Check-then-act. Everyone who read "in stock" in the gap before the
      // final decrement committed also goes on to buy. The gap is the time
      // between a request's read and its write, and it stretches as the
      // database queues.
      if (!crossed && stock <= 1e-9) {
        crossed = true
        staleCarry = (invDone / DT) * staleGap
      }
      if (crossed && staleCarry > 0) {
        extra = Math.min(invDone - winners, staleCarry)
        staleCarry -= extra
        stock -= extra
      }
    }
    const got = winners + extra
    handedOut += got
    toBots += got * (invDone > 0 ? invDoneBots / invDone : 0)

    /* writing the order */
    const loserPath = SVC_APP + appWait + SVC_INV[inv] + invWait
    let written = 0
    let writeErr = 0
    let workerDone = 0
    let writeWait = 0
    let dups = 0
    if (sync) {
      // orders decided earlier get their two writes as the database allows
      written = Math.min(writeQ, dbForWrite / 2)
      writeQ -= written
      orders += written
      payInFlight += written
      const writeRate = dbForWrite / 2 / DT
      writeWait = writeQ > 1e-9 ? (writeRate > 0 ? writeQ / writeRate : TIMEOUT) : 0
      // A winner who would wait past the deadline sees an error. The server
      // does not know that: the order is still written. A timeout is not a rollback.
      const timedOut = loserPath + SVC_WRITE + writeWait + payLatency > TIMEOUT
      if (timedOut) {
        writeErr = got
        ghosts += got
      } else {
        served += got
        cleanOrders += got
      }
      served += invDone - got
      writeQ += got
      if (!design.idempotency && got > 0) {
        const retried = timedOut ? got * GHOST_RETRY : got * DUP_BASE
        dups = Math.min(retried, Math.max(0, stock))
      }
      orders += dups
    } else {
      served += invDone
      cleanOrders += got
      if (!design.idempotency && got > 0) dups = Math.min(got * DUP_BASE, Math.max(0, stock))
      mq += got + dups
      const dbLeft = Math.max(0, dbBudget * WORKER_DB_SHARE - invOpsUsed)
      workerDone = Math.min(mq, workerRate * DT, dbLeft / 2)
      mq -= workerDone
      orders += workerDone
    }
    // the same buyer, twice: a retry without an idempotency key is a new order
    stock -= dups
    duplicates += dups
    if (inv === 'rw' && !crossed && stock <= 1e-9) {
      // the last unit went to a retry: the stale readers show up next step
      crossed = true
      staleCarry = (invDone / DT) * staleGap
    }
    sold += got + dups
    payInFlight -= payInFlight * Math.min(1, DT / payLatency)
    errors += appErr + invErr + writeErr

    /* how long it felt */
    const winnerPath = loserPath + (sync ? SVC_WRITE + writeWait + payLatency : SVC_ENQUEUE)
    const active = admit > 1e-9 || appQ > 1e-9 || invQ > 1e-9 || invDone > 1e-9 || (sync && writeQ > 1e-9)
    let p99 = 0
    if (active) {
      const winnersInFlight = got > 0.01 * Math.max(invDone, 1) || (sync && writeQ > 1e-9)
      p99 = Math.min(TIMEOUT, winnersInFlight ? winnerPath : loserPath)
      const timedOut = appErr + (invHealthy ? invErr : 0) + writeErr
      const answered = invDone + timedOut
      if (timedOut > 0.01 * Math.max(answered, 1)) p99 = TIMEOUT
    }

    /* how hard each stage is working */
    const workerOps = workerDone * 2
    const opsLoad = (invOps + syncWriteOps + workerOps) / dbBudget
    const lockLoad = inv === 'lock' ? invQBefore / (LOCK_TPS * DT) : 0
    const dbLoad = Math.max(opsLoad, lockLoad)
    const redisLoad = inv === 'redis' ? (invHealthy ? invQBefore / (REDIS_OPS * DT) : 1) : 0
    const payLoad = sync
      ? Math.min(1, payInFlight / threads)
      : Math.min(1, ((workerDone / DT) * payLatency) / WORKER_THREADS)
    prevDbWait = inv === 'redis' ? 0 : invWait
    const oversold = Math.max(0, -stock)

    if (soldOutAt === null && stock <= 1e-9) soldOutAt = t + DT
    if (firstSaturation === null) {
      if (appLoad >= 1) firstSaturation = { stage: 'app', t }
      else if (inv === 'redis' && (redisDown || redisLoad >= 1)) firstSaturation = { stage: 'redis', t }
      else if (dbLoad >= 1) firstSaturation = { stage: 'db', t }
      else if (payLoad >= 0.9) firstSaturation = { stage: 'pay', t }
    }
    soldOutKnown = soldOutSeen
    soldOutSeen = stock <= 1e-9

    ticks.push({
      t,
      humanRps: humans / DT,
      botRps: botsRaw / DT,
      pageRps: pages / DT,
      blockedRps: blocked / DT,
      soldOutRps: soldOutNow / DT,
      admittedRps: admit / DT,
      decidedRps: invDone / DT,
      winnersRps: got / DT,
      servedRps: (invDone - writeErr) / DT,
      appErrRps: appErr / DT,
      invErrRps: invErr / DT,
      writeErrRps: writeErr / DT,
      dbRequestOpsRps: (invOpsUsed + written * 2) / DT,
      syncWriteRps: written / DT,
      enqueueRps: sync ? 0 : (got + dups) / DT,
      workerRps: workerDone / DT,
      waiting,
      appQueue: appQ,
      invQueue: invQ,
      writeQueue: writeQ,
      mqBacklog: mq,
      appWait,
      invWait,
      writeWait,
      mqLag: mq > 1e-9 ? mq / workerRate : 0,
      appLoad,
      dbLoad,
      redisLoad,
      payLoad,
      pageFail,
      stock,
      oversold,
      duplicates,
      ghosts,
      sold,
      orders,
      unitsToBots: toBots,
      p99,
      redisDown,
      admissionPaused,
    })
  }

  // the write backlog holds orders, not requests: their buyers were already answered
  const inFlight = appQ + invQ
  const answered = served + errors + inFlight
  const oversold = Math.max(0, -stock)
  const unitsSold = Math.max(0, Math.min(STOCK, STOCK - stock))
  // orders where a real unit reached a buyer who was also told so
  const goodOrders = Math.min(cleanOrders, STOCK)
  const costLines = costOf(design, scenario.buyers)
  const monthlyCost = costLines.reduce((sum, line) => sum + line.monthly, 0)

  const summary: Summary = {
    arrivals,
    rejectedEarly,
    admitted,
    served,
    errors,
    stillQueued: waiting + inFlight,
    oversold,
    duplicates,
    ghosts,
    peakP99: ticks.reduce((max, tick) => Math.max(max, tick.p99), 0),
    successRate: answered > 0 ? served / answered : 1,
    peakDbLoad: ticks.reduce((max, tick) => Math.max(max, tick.dbLoad), 0),
    peakAppLoad: ticks.reduce((max, tick) => Math.max(max, tick.appLoad), 0),
    unitsSold,
    botShare: handedOut > 0 ? toBots / handedOut : 0,
    soldOutAt,
    firstSaturation,
    pods,
    plan,
    monthlyCost,
    costLines,
    costPerOrder: goodOrders >= 1 ? monthlyCost / (goodOrders * SALES_PER_MONTH) : null,
  }

  return { design, scenario, ticks, summary }
}

/* ── the scorecard ────────────────────────────────────────────────────── */

export type TargetId = 'oversold' | 'duplicates' | 'p99' | 'success' | 'cost'

export type TargetResult = {
  id: TargetId
  label: string
  /** Current value, formatted. */
  value: string
  goal: string
  met: boolean
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-SG')
export const fmtMoney = (n: number) => `S$${fmtInt(n)}`

/** Seconds → "52 ms" or "1.2 s". */
export function fmtLatency(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`
  return `${(Math.round(seconds * 10) / 10).toFixed(1)} s`
}

/** A share → "99.8%" (never rounds a miss up to 100%). */
export function fmtPercent(share: number): string {
  const pct = Math.floor(share * 1000) / 10
  return `${pct.toFixed(1)}%`
}

/** Requests per second → "118k/s", "2.0k/s", "850/s". */
export function fmtRate(rps: number): string {
  if (rps >= 100_000) return `${Math.round(rps / 1000)}k/s`
  if (rps >= 1000) return `${(rps / 1000).toFixed(1)}k/s`
  return `${Math.round(rps)}/s`
}

/** A count → "412k", "5,000", "1.2M". */
export function fmtCount(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000) return `${Math.round(n / 1000)}k`
  return fmtInt(n)
}

/** The five things the interviewer marks, for one run. */
export function scorecard(summary: Summary): TargetResult[] {
  return [
    {
      id: 'oversold',
      label: 'Units sold that do not exist',
      value: fmtInt(summary.oversold),
      goal: '0',
      met: summary.oversold < 0.5,
    },
    {
      id: 'duplicates',
      label: 'Duplicate orders',
      value: fmtInt(summary.duplicates),
      goal: '0',
      met: summary.duplicates < 0.5,
    },
    {
      id: 'p99',
      label: 'Buy-path p99, at its worst',
      value: fmtLatency(summary.peakP99),
      goal: `≤ ${fmtLatency(TARGETS.p99)}`,
      met: summary.peakP99 <= TARGETS.p99 + 1e-9,
    },
    {
      id: 'success',
      label: 'Admitted requests answered',
      value: fmtPercent(summary.successRate),
      goal: `≥ ${(TARGETS.success * 100).toFixed(1)}%`,
      met: summary.successRate >= TARGETS.success,
    },
    {
      id: 'cost',
      label: 'Monthly cost',
      value: fmtMoney(summary.monthlyCost),
      goal: `≤ ${fmtMoney(TARGETS.budget)}`,
      met: summary.monthlyCost <= TARGETS.budget,
    },
  ]
}

/** The mission counts at full scale, with nothing injected. */
export function isSolved(run: Run): boolean {
  const { scenario, summary } = run
  const clean = !scenario.faults.bots && !scenario.faults.redis && !scenario.faults.pay
  const fullScale = scenario.buyers * (scenario.surge ?? 1) >= MISSION_BUYERS
  return clean && fullScale && scorecard(summary).every((target) => target.met)
}
