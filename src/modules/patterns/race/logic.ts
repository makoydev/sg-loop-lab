import type { Tone } from '@/lib/cn'

/*
 * The flash-sale race as a small deterministic state machine.
 *
 * Two checkout workers run the same program against one shared store. A
 * schedule is the order in which their steps happen to interleave. `apply`
 * advances one worker by one step (or stalls it past its lock TTL), and
 * `explore` walks every possible schedule, which is how the lab can say
 * "this strategy cannot oversell" and mean it. Everything is pure and tested.
 */

export type Strategy = 'naive' | 'atomic' | 'lock' | 'fencing'
export type WorkerId = 'A' | 'B'
export type OpId = 'read' | 'check' | 'write' | 'update' | 'confirm' | 'acquire' | 'release'
export type Result = 'confirmed' | 'sold-out' | 'aborted'

export const WORKERS: WorkerId[] = ['A', 'B']
export const STRATEGIES: Strategy[] = ['naive', 'atomic', 'lock', 'fencing']
export const INITIAL_STOCK = 1

export const other = (w: WorkerId): WorkerId => (w === 'A' ? 'B' : 'A')

export type Options = {
  /**
   * Fencing only. When false the token is checked on the write but not on the
   * read: the subtle variant that still loses an update.
   */
  fenceReads?: boolean
}

export type Op = {
  id: OpId
  /** Short name for the step button. */
  name: string
  /** Source text of the step, shown in the worker's program. */
  code: string
  /** 1-based lines of the strategy's code that this step runs. */
  lines: number[]
  /** Talks to the shared store (as opposed to a purely local step). */
  shared: boolean
}

export type WorkerState = {
  pc: number
  done: boolean
  result: Result | null
  /** Local copy of the stock from this worker's read. */
  stock: number | null
  /** Rows changed by the conditional update (atomic strategy). */
  rows: number | null
  /** Lock token this worker was handed. */
  token: number | null
  /** Has used its one stall. */
  stalled: boolean
}

export type Lock = { holder: WorkerId; token: number }

export type Store = {
  stock: number
  orders: number
  lock: Lock | null
  /** Tokens handed out so far. */
  issued: number
  /** Newest fencing token the storage has seen. */
  newest: number
}

export type State = {
  strategy: Strategy
  fenceReads: boolean
  initialStock: number
  store: Store
  workers: Record<WorkerId, WorkerState>
}

export type Action = { worker: WorkerId; kind: 'step' | 'stall' }

export type RaceEvent = {
  worker: WorkerId
  kind: 'step' | 'stall'
  op: OpId | 'stall'
  /** Short text for the sequence diagram. */
  label: string
  /** One or two sentences on what just happened. */
  detail: string
  tone: Tone
  /** Drawn as a message to the store (true) or as a local step (false). */
  shared: boolean
  /** Lines of the strategy's code involved. */
  lines: number[]
  /** Readouts that changed at this step. */
  changes: Record<string, string | number>
}

export type Outcome = {
  /** Orders confirmed to buyers. */
  orders: number
  /** What the stock row says at the end. */
  stock: number
  oversold: boolean
}

export type Schedule = {
  actions: Action[]
  outcome: Outcome
  /** How many TTL-expiry stalls the schedule uses. */
  stalls: number
}

export const STRATEGY_META: Record<Strategy, { name: string; short: string; blurb: string }> = {
  naive: {
    name: 'Check-then-act',
    short: 'Check-then-act',
    blurb: 'Read the stock, check it, then write it back. This is what shipped.',
  },
  atomic: {
    name: 'Atomic conditional update',
    short: 'Atomic update',
    blurb: 'One statement. The database checks and decrements in a single step.',
  },
  lock: {
    name: 'Lock with a TTL',
    short: 'Lock + TTL',
    blurb: 'A 10-second lock around the read, the check and the write.',
  },
  fencing: {
    name: 'Lock with a fencing token',
    short: 'Lock + fencing',
    blurb: 'Every request carries the lock token, and storage refuses a stale one.',
  },
}

/* ── reference code ───────────────────────────────────────────────────── */

const CODE_NAIVE = `def checkout(item):
    stock = db.get(item)
    if stock > 0:
        db.set(item, stock - 1)
        return "ORDER CONFIRMED"
    return "SOLD OUT"`

const CODE_ATOMIC = `def checkout(item):
    rows = db.execute(
        "UPDATE inventory SET stock = stock - 1 "
        "WHERE id = %s AND stock > 0", item)
    if rows == 1:
        return "ORDER CONFIRMED"
    return "SOLD OUT"`

const CODE_LOCK = `def checkout(item):
    # SET lock <token> NX PX 10000
    token = lock.acquire(item, ttl=10)
    try:
        stock = db.get(item)
        if stock > 0:
            db.set(item, stock - 1)
            return "ORDER CONFIRMED"
        return "SOLD OUT"
    finally:
        # deletes only if the lock is still mine
        lock.release(item, token)`

const codeFencing = (fenceReads: boolean) => `def checkout(item):
    # tokens only ever go up: 1, 2, 3 ...
    token = lock.acquire(item, ttl=10)
    try:
        ${fenceReads ? '# storage remembers the newest token' : '# the read carries no token'}
        stock = db.get(item${fenceReads ? ', token' : ''})
        if stock > 0:
            # storage refuses an older token
            db.set(item, stock - 1, token)
            return "ORDER CONFIRMED"
        return "SOLD OUT"
    finally:
        lock.release(item, token)`

/** The code the workers run, shown beside the visualizer. */
export function codeFor(strategy: Strategy, options: Options = {}): string {
  if (strategy === 'naive') return CODE_NAIVE
  if (strategy === 'atomic') return CODE_ATOMIC
  if (strategy === 'lock') return CODE_LOCK
  return codeFencing(options.fenceReads ?? true)
}

/** Lines that return "SOLD OUT", per strategy. */
const SOLD_OUT_LINE: Record<Strategy, number> = { naive: 6, atomic: 7, lock: 9, fencing: 11 }

/** The worker program as discrete, schedulable steps. */
export function programFor(strategy: Strategy, options: Options = {}): Op[] {
  if (strategy === 'naive') {
    return [
      { id: 'read', name: 'Read', code: 'stock = db.get(item)', lines: [2], shared: true },
      { id: 'check', name: 'Check', code: 'if stock > 0:', lines: [3], shared: false },
      { id: 'write', name: 'Write', code: 'db.set(item, stock - 1)', lines: [4, 5], shared: true },
    ]
  }
  if (strategy === 'atomic') {
    return [
      {
        id: 'update',
        name: 'Update',
        code: 'UPDATE … SET stock = stock - 1 WHERE stock > 0',
        lines: [2, 3, 4],
        shared: true,
      },
      { id: 'confirm', name: 'Check rows', code: 'if rows == 1:', lines: [5], shared: false },
    ]
  }
  if (strategy === 'lock') {
    return [
      {
        id: 'acquire',
        name: 'Acquire',
        code: 'token = lock.acquire(item, ttl=10)',
        lines: [3],
        shared: true,
      },
      { id: 'read', name: 'Read', code: 'stock = db.get(item)', lines: [5], shared: true },
      { id: 'check', name: 'Check', code: 'if stock > 0:', lines: [6], shared: false },
      { id: 'write', name: 'Write', code: 'db.set(item, stock - 1)', lines: [7, 8], shared: true },
      {
        id: 'release',
        name: 'Release',
        code: 'lock.release(item, token)',
        lines: [12],
        shared: true,
      },
    ]
  }
  const fenceReads = options.fenceReads ?? true
  return [
    {
      id: 'acquire',
      name: 'Acquire',
      code: 'token = lock.acquire(item, ttl=10)',
      lines: [3],
      shared: true,
    },
    {
      id: 'read',
      name: 'Read',
      code: fenceReads ? 'stock = db.get(item, token)' : 'stock = db.get(item)',
      lines: [6],
      shared: true,
    },
    { id: 'check', name: 'Check', code: 'if stock > 0:', lines: [7], shared: false },
    {
      id: 'write',
      name: 'Write',
      code: 'db.set(item, stock - 1, token)',
      lines: [9, 10],
      shared: true,
    },
    { id: 'release', name: 'Release', code: 'lock.release(item, token)', lines: [13], shared: true },
  ]
}

const usesLock = (strategy: Strategy) => strategy === 'lock' || strategy === 'fencing'

/* ── state ────────────────────────────────────────────────────────────── */

const freshWorker = (): WorkerState => ({
  pc: 0,
  done: false,
  result: null,
  stock: null,
  rows: null,
  token: null,
  stalled: false,
})

export function initialState(strategy: Strategy, options: Options = {}): State {
  return {
    strategy,
    fenceReads: options.fenceReads ?? true,
    initialStock: INITIAL_STOCK,
    store: { stock: INITIAL_STOCK, orders: 0, lock: null, issued: 0, newest: 0 },
    workers: { A: freshWorker(), B: freshWorker() },
  }
}

function clone(state: State): State {
  return {
    ...state,
    store: { ...state.store, lock: state.store.lock ? { ...state.store.lock } : null },
    workers: { A: { ...state.workers.A }, B: { ...state.workers.B } },
  }
}

const programOf = (state: State) =>
  programFor(state.strategy, { fenceReads: state.fenceReads })

/** The step a worker would run next, or null once it has finished. */
export function nextOp(state: State, worker: WorkerId): Op | null {
  const me = state.workers[worker]
  if (me.done) return null
  return programOf(state)[me.pc] ?? null
}

export function canStep(state: State, worker: WorkerId): boolean {
  const op = nextOp(state, worker)
  if (!op) return false
  // A worker waiting for the lock cannot move until the lock is free.
  if (op.id === 'acquire' && state.store.lock !== null) return false
  return true
}

/** A worker can be stalled past the TTL only while it really holds the lock. */
export function canStall(state: State, worker: WorkerId): boolean {
  const me = state.workers[worker]
  return (
    usesLock(state.strategy) &&
    !me.done &&
    !me.stalled &&
    state.store.lock?.holder === worker
  )
}

/** Why a worker cannot take its next step right now, in words. */
export function blockedReason(state: State, worker: WorkerId): string | null {
  const op = nextOp(state, worker)
  if (op?.id === 'acquire' && state.store.lock) {
    return `Waiting: Worker ${state.store.lock.holder} holds the lock`
  }
  return null
}

export function availableActions(state: State): Action[] {
  const actions: Action[] = []
  for (const worker of WORKERS) {
    if (canStep(state, worker)) actions.push({ worker, kind: 'step' })
    if (canStall(state, worker)) actions.push({ worker, kind: 'stall' })
  }
  return actions
}

export function isTerminal(state: State): boolean {
  return state.workers.A.done && state.workers.B.done
}

export function outcome(state: State): Outcome {
  return {
    orders: state.store.orders,
    stock: state.store.stock,
    oversold: state.store.orders > state.initialStock,
  }
}

const workerTone = (worker: WorkerId): Tone => (worker === 'A' ? 'trace' : 'info')
const rowsWord = (n: number) => `${n} row${n === 1 ? '' : 's'}`

/* ── transitions ──────────────────────────────────────────────────────── */

/**
 * Advance one worker by one step, or stall it until its lock expires.
 * Returns a new state; the input is never modified.
 */
export function apply(state: State, action: Action): { state: State; event: RaceEvent } {
  const next = clone(state)
  const w = action.worker
  const me = next.workers[w]
  const them = next.workers[other(w)]
  const store = next.store
  const program = programOf(state)
  const releaseAt = program.findIndex((op) => op.id === 'release')

  if (action.kind === 'stall') {
    if (!canStall(state, w)) throw new Error(`Worker ${w} cannot be stalled now`)
    const resumeAt = program[me.pc]
    store.lock = null
    me.stalled = true
    return {
      state: next,
      event: {
        worker: w,
        kind: 'stall',
        op: 'stall',
        label: 'paused… lock TTL expires',
        detail: `Worker ${w} freezes for longer than the 10 second TTL: a garbage-collection pause, a slow network hop. The lock service expires its lock. Worker ${w} does not know.`,
        tone: 'warn',
        shared: false,
        lines: resumeAt ? [resumeAt.lines[0]!] : [],
        changes: { lock: 'expired' },
      },
    }
  }

  if (!canStep(state, w)) throw new Error(`Worker ${w} cannot step now`)
  const op = program[me.pc]!
  const fenced = state.strategy === 'fencing'
  const base = { worker: w, kind: 'step' as const, op: op.id, shared: op.shared }
  let event: RaceEvent

  /** Jump to the `finally` block (lock strategies) or finish (the others). */
  const finish = () => {
    if (releaseAt >= 0) me.pc = releaseAt
    else me.done = true
  }

  switch (op.id) {
    case 'acquire': {
      store.issued += 1
      const token = store.issued
      store.lock = { holder: w, token }
      me.token = token
      me.pc += 1
      const rival = them.stalled && !them.done
      event = {
        ...base,
        label: `SET lock NX → OK, token ${token}`,
        detail: `Worker ${w} takes the lock with a 10 second TTL and is handed token ${token}.${rival ? ` Worker ${other(w)} still believes the lock is its own.` : ''}`,
        tone: workerTone(w),
        lines: op.lines,
        changes: { lock: `${w}, token ${token}` },
      }
      break
    }

    case 'read': {
      const token = me.token ?? 0
      if (fenced && state.fenceReads && token < store.newest) {
        me.result = 'aborted'
        finish()
        event = {
          ...base,
          label: `GET stock (token ${token}) ✗ stale`,
          detail: `Storage has already served token ${store.newest}. It refuses Worker ${w}'s read with the older token ${token}, which is how Worker ${w} finds out its lock expired.`,
          tone: 'ok',
          lines: op.lines,
          changes: { [`${w}.result`]: 'aborted' },
        }
        break
      }
      const changes: Record<string, string | number> = { [`${w}.stock`]: store.stock }
      if (fenced && state.fenceReads) {
        store.newest = Math.max(store.newest, token)
        changes['newest token'] = store.newest
      }
      me.stock = store.stock
      me.pc += 1
      const bothHold = them.stock === me.stock && them.result === null && me.stock > 0
      event = {
        ...base,
        label:
          fenced && state.fenceReads
            ? `GET stock (token ${token}) → ${me.stock}`
            : `GET stock → ${me.stock}`,
        detail: `Worker ${w} reads stock = ${me.stock} into a local variable.${
          bothHold
            ? ` Both workers now believe there is ${me.stock} left, and neither knows about the other.`
            : fenced && state.fenceReads
              ? ` Storage notes token ${token} as the newest it has seen.`
              : ''
        }`,
        tone: workerTone(w),
        lines: op.lines,
        changes,
      }
      break
    }

    case 'check': {
      const local = me.stock ?? 0
      if (local > 0) {
        me.pc += 1
        const stale = store.stock !== local
        event = {
          ...base,
          label: 'stock > 0 ✓',
          detail: stale
            ? `Worker ${w} checks its local copy: ${local} > 0. The real stock is already ${store.stock}. The check passes on stale data.`
            : `Worker ${w} checks its local copy: ${local} > 0, so it decides to sell.`,
          tone: stale ? 'warn' : 'ok',
          lines: op.lines,
          changes: {},
        }
      } else {
        me.result = 'sold-out'
        finish()
        event = {
          ...base,
          label: 'stock > 0 ✗ SOLD OUT',
          detail: `Worker ${w} checks its local copy: ${local} is not above 0. It tells its buyer the item is sold out.`,
          tone: 'neutral',
          lines: [...op.lines, SOLD_OUT_LINE[state.strategy]],
          changes: { [`${w}.result`]: 'sold out' },
        }
      }
      break
    }

    case 'write': {
      const value = (me.stock ?? 0) - 1
      const token = me.token ?? 0
      if (fenced && token < store.newest) {
        me.result = 'aborted'
        finish()
        event = {
          ...base,
          label: `SET stock = ${value} (token ${token}) ✗`,
          detail: `Storage has seen token ${store.newest}. Worker ${w}'s write carries the older token ${token}, so storage refuses it. No second order is confirmed.`,
          tone: 'ok',
          lines: [op.lines[0]!],
          changes: { [`${w}.result`]: 'aborted' },
        }
        break
      }
      const changes: Record<string, string | number> = {}
      if (fenced) {
        store.newest = token
        changes['newest token'] = token
      }
      store.stock = value
      store.orders += 1
      me.result = 'confirmed'
      finish()
      changes.stock = value
      changes.orders = store.orders
      const oversold = store.orders > state.initialStock
      event = {
        ...base,
        label: fenced ? `SET stock = ${value} (token ${token})` : `SET stock = ${value}`,
        detail: oversold
          ? `Worker ${w} writes its stale value, stock = ${value}, and confirms a second order. ${store.orders} orders now exist for ${state.initialStock} unit, and the stock row reads ${value}. Nothing in the database looks wrong.`
          : `Worker ${w} writes stock = ${value} and confirms the order to its buyer.`,
        tone: oversold ? 'bad' : workerTone(w),
        lines: op.lines,
        changes,
      }
      break
    }

    case 'update': {
      const hit = store.stock > 0
      if (hit) store.stock -= 1
      me.rows = hit ? 1 : 0
      me.pc += 1
      event = {
        ...base,
        label: `UPDATE … stock > 0 → ${rowsWord(me.rows)}`,
        detail: hit
          ? `The database tests stock > 0 and decrements it inside one statement. 1 row changed, so Worker ${w} has the unit. No other step can land between the test and the write.`
          : `The same statement now finds stock = 0. The WHERE clause fails inside the database, so 0 rows change.`,
        tone: hit ? workerTone(w) : 'neutral',
        lines: op.lines,
        changes: { stock: store.stock, [`${w}.rows`]: me.rows },
      }
      break
    }

    case 'confirm': {
      if (me.rows === 1) {
        store.orders += 1
        me.result = 'confirmed'
        me.done = true
        event = {
          ...base,
          label: 'rows == 1 ✓ confirmed',
          detail: `Worker ${w} changed a row, so it confirms the order to its buyer.`,
          tone: 'ok',
          lines: [...op.lines, 6],
          changes: { orders: store.orders },
        }
      } else {
        me.result = 'sold-out'
        me.done = true
        event = {
          ...base,
          label: 'rows == 0: SOLD OUT',
          detail: `Worker ${w} changed no rows, so it tells its buyer the item is sold out.`,
          tone: 'neutral',
          lines: [...op.lines, SOLD_OUT_LINE.atomic],
          changes: { [`${w}.result`]: 'sold out' },
        }
      }
      break
    }

    case 'release': {
      const token = me.token ?? 0
      const mine = store.lock !== null && store.lock.token === token
      if (mine) store.lock = null
      me.done = true
      event = {
        ...base,
        label: mine ? `DEL lock (token ${token}) → freed` : `DEL lock (token ${token}) → not mine`,
        detail: mine
          ? `Worker ${w} releases the lock.`
          : `Worker ${w} tries to release, but the lock stopped being its own when the TTL expired. Because release compares the token, this does nothing instead of deleting someone else's lock.`,
        tone: mine ? workerTone(w) : 'neutral',
        lines: op.lines,
        changes: mine ? { lock: 'free' } : {},
      }
      break
    }
  }

  return { state: next, event }
}

/* ── schedules ────────────────────────────────────────────────────────── */

export type Replay = {
  /** `states[i]` is the state before `actions[i]`; the last entry is the final state. */
  states: State[]
  events: RaceEvent[]
}

/** Run a schedule from the start. Throws if an action is not allowed. */
export function replay(strategy: Strategy, actions: Action[], options: Options = {}): Replay {
  const states: State[] = [initialState(strategy, options)]
  const events: RaceEvent[] = []
  for (const action of actions) {
    const { state, event } = apply(states[states.length - 1]!, action)
    states.push(state)
    events.push(event)
  }
  return { states, events }
}

export type ExploreOptions = Options & {
  /**
   * Which TTL-expiry stalls to explore (at most one per worker either way).
   * `useful` skips stalls nobody can exploit: a stall only matters while the
   * other worker is still waiting for the lock. `all` explores every one.
   */
  stalls?: 'none' | 'useful' | 'all'
}

/** Every schedule the scheduler could produce, with how each one ends. */
export function explore(strategy: Strategy, options: ExploreOptions = {}): Schedule[] {
  const mode = options.stalls ?? 'useful'
  const out: Schedule[] = []

  const walk = (state: State, path: Action[]) => {
    if (isTerminal(state)) {
      out.push({
        actions: path,
        outcome: outcome(state),
        stalls: path.filter((a) => a.kind === 'stall').length,
      })
      return
    }
    const actions = availableActions(state)
    if (actions.length === 0) throw new Error('Deadlock: no worker can move')
    for (const action of actions) {
      if (action.kind === 'stall') {
        if (mode === 'none') continue
        const rival = other(action.worker)
        const rivalWaiting = nextOp(state, rival)?.id === 'acquire'
        if (mode === 'useful' && !rivalWaiting) continue
      }
      walk(apply(state, action).state, [...path, action])
    }
  }

  walk(initialState(strategy, options), [])
  return out
}

/** Compact notation: `A B A! B` = A steps, B steps, A stalls, B steps. */
export function parseSchedule(text: string): Action[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const worker = part[0]
      if (worker !== 'A' && worker !== 'B') throw new Error(`Bad schedule token: ${part}`)
      return { worker, kind: part.endsWith('!') ? ('stall' as const) : ('step' as const) }
    })
}

export function formatSchedule(actions: Action[]): string {
  return actions.map((a) => `${a.worker}${a.kind === 'stall' ? '!' : ''}`).join(' ')
}

export const sameSchedule = (a: Action[], b: Action[]) => formatSchedule(a) === formatSchedule(b)

/**
 * The textbook schedule for each strategy: the one worth watching first.
 * `fencing-write-only` is the subtle case where fencing only the write still
 * loses an update.
 */
export const SHOWCASE: Record<Strategy | 'fencing-write-only', Action[]> = {
  naive: parseSchedule('A B A B A B'),
  atomic: parseSchedule('A B A B'),
  lock: parseSchedule('A A A A! B B B B B A A'),
  fencing: parseSchedule('A A A A! B B B B B A A'),
  'fencing-write-only': parseSchedule('A A A! B B A A B B B A'),
}

export function showcaseFor(strategy: Strategy, options: Options = {}): Action[] {
  if (strategy === 'fencing' && options.fenceReads === false) return SHOWCASE['fencing-write-only']
  return SHOWCASE[strategy]
}

/** Initial readouts for the sequence diagram's state strip. */
export function initialReadout(strategy: Strategy): Record<string, string | number> {
  const base: Record<string, string | number> = { stock: INITIAL_STOCK, orders: 0 }
  if (usesLock(strategy)) base.lock = 'free'
  return base
}
