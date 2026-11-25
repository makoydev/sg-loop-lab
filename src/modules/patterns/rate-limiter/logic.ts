/*
 * Four rate limiters, simulated step by step.
 *
 * Each simulation turns a list of request timestamps into frames: one frame per
 * observable step of the algorithm, carrying the internal state at that moment
 * and the line of reference code being executed. The UI only renders frames, so
 * everything here is pure, deterministic and unit-tested.
 */

export type Algo = 'fixed' | 'log' | 'counter' | 'bucket'

export type Config = {
  /** Maximum requests per window. */
  limit: number
  /** Window length in seconds. */
  window: number
  /**
   * Sliding log only: keep a timestamp that is exactly `window` seconds old.
   * This is the classic off-by-one (`<` instead of `<=` when evicting).
   */
  closedBoundary?: boolean
}

export type Phase = 'arrive' | 'roll' | 'evict' | 'refill' | 'estimate' | 'allow' | 'reject'

export type Frame = {
  /** Index of the request being processed. */
  req: number
  t: number
  phase: Phase
  /** 1-based line of `CODE[algo]` executing in this frame. */
  line: number
  note: string
  /** Decision per request so far (`null` = not decided yet). */
  decisions: (boolean | null)[]
  /** fixed / counter: start time of the current window. */
  windowStart?: number
  /** fixed / counter: requests counted in the current window. */
  count?: number
  /** counter: total of the previous window. */
  prev?: number
  /** counter: fraction of the previous window still inside the sliding window. */
  overlap?: number
  /** counter: prev × overlap + count. */
  estimate?: number
  /** log: timestamps currently held. */
  log?: number[]
  /** log: timestamps removed in this frame. */
  evicted?: number[]
  /** log: now − window. */
  cutoff?: number
  /** bucket: tokens available. */
  tokens?: number
}

export const ALGO_META: Record<Algo, { name: string; short: string; verdict: string }> = {
  fixed: {
    name: 'Fixed window counter',
    short: 'Fixed window',
    verdict: 'Forgets everything at the boundary.',
  },
  log: {
    name: 'Sliding window log',
    short: 'Sliding log',
    verdict: 'Exact. Stores one timestamp per allowed request.',
  },
  counter: {
    name: 'Sliding window counter',
    short: 'Sliding counter',
    verdict: 'Two counters, weighted. Close, never exact.',
  },
  bucket: {
    name: 'Token bucket',
    short: 'Token bucket',
    verdict: 'Answers a different question: burst size and refill rate.',
  },
}

const CODE_FIXED = `def allow(self, now):
    bucket = int(now // self.window)
    if bucket != self.bucket:
        self.bucket, self.count = bucket, 0
    if self.count >= self.limit:
        return False
    self.count += 1
    return True`

const codeLog = (closed: boolean) => `def allow(self, now):
    cutoff = now - self.window
    while self.log and self.log[0] ${closed ? '<' : '<='} cutoff:
        self.log.popleft()
    if len(self.log) >= self.limit:
        return False
    self.log.append(now)
    return True`

const CODE_COUNTER = `def allow(self, now):
    bucket = int(now // self.window)
    if bucket != self.bucket:
        self.prev = self.curr if bucket == self.bucket + 1 else 0
        self.bucket, self.curr = bucket, 0
    elapsed = (now % self.window) / self.window
    estimate = self.prev * (1 - elapsed) + self.curr
    if estimate >= self.limit:
        return False
    self.curr += 1
    return True`

const CODE_BUCKET = `def allow(self, now):
    elapsed = now - self.last
    self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
    self.last = now
    if self.tokens < 1:
        return False
    self.tokens -= 1
    return True`

/** Reference implementation shown beside the visualizer. */
export function codeFor(algo: Algo, cfg: Config): string {
  if (algo === 'fixed') return CODE_FIXED
  if (algo === 'log') return codeLog(Boolean(cfg.closedBoundary))
  if (algo === 'counter') return CODE_COUNTER
  return CODE_BUCKET
}

/** Trim float noise for display: 4.250000001 → "4.25", 5 → "5". */
export function fmt(n: number, dp = 2): string {
  const rounded = Math.round(n * 10 ** dp) / 10 ** dp
  return String(rounded)
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export type Simulation = { frames: Frame[]; decisions: boolean[] }

/** Run `algo` over `requests` (seconds, ascending) and record every step. */
export function simulate(algo: Algo, requests: number[], cfg: Config): Simulation {
  const { limit: L, window: W } = cfg
  const frames: Frame[] = []
  const decisions: (boolean | null)[] = requests.map(() => null)
  const emit = (frame: Omit<Frame, 'decisions'>) =>
    frames.push({ ...frame, decisions: [...decisions] })

  if (algo === 'fixed') {
    let bucket = -1
    let count = 0
    requests.forEach((t, req) => {
      const b = Math.floor(t / W)
      emit({
        req,
        t,
        phase: 'arrive',
        line: 2,
        note: `t = ${fmt(t)}s falls in the window that covers ${b * W}s to ${(b + 1) * W}s.`,
        windowStart: Math.max(bucket, 0) * W,
        count,
      })
      if (b !== bucket) {
        const forgotten = count
        bucket = b
        count = 0
        emit({
          req,
          t,
          phase: 'roll',
          line: 4,
          note:
            forgotten > 0
              ? `New window, so the counter resets to 0. It has just forgotten the ${plural(forgotten, 'request')} it allowed moments ago.`
              : 'New window: the counter starts at 0.',
          windowStart: b * W,
          count,
        })
      }
      if (count >= L) {
        decisions[req] = false
        emit({
          req,
          t,
          phase: 'reject',
          line: 6,
          note: `The counter is already at ${count}, the limit: reject with 429.`,
          windowStart: b * W,
          count,
        })
      } else {
        count += 1
        decisions[req] = true
        emit({
          req,
          t,
          phase: 'allow',
          line: 7,
          note: `${count - 1} is under the limit of ${L}: allow, and the counter becomes ${count}.`,
          windowStart: b * W,
          count,
        })
      }
    })
  }

  if (algo === 'log') {
    const log: number[] = []
    const closed = Boolean(cfg.closedBoundary)
    requests.forEach((t, req) => {
      const cutoff = t - W
      emit({
        req,
        t,
        phase: 'arrive',
        line: 2,
        note:
          cutoff >= 0
            ? `t = ${fmt(t)}s. The window is the last ${W}s, so anything ${closed ? 'before' : 'at or before'} ${fmt(cutoff)}s no longer counts.`
            : `t = ${fmt(t)}s. The window reaches back ${W}s; nothing is old enough to drop yet.`,
        log: [...log],
        cutoff,
      })
      const evicted: number[] = []
      while (log.length > 0 && (closed ? log[0]! < cutoff : log[0]! <= cutoff)) {
        evicted.push(log.shift()!)
      }
      if (evicted.length > 0) {
        emit({
          req,
          t,
          phase: 'evict',
          line: 4,
          note: `Drop ${evicted.map((x) => `${fmt(x)}s`).join(', ')} from the front: ${evicted.length === 1 ? 'it has' : 'they have'} slid out of the window.`,
          log: [...log],
          evicted,
          cutoff,
        })
      }
      if (log.length >= L) {
        decisions[req] = false
        emit({
          req,
          t,
          phase: 'reject',
          line: 6,
          note: `The log still holds ${log.length} requests from the last ${W}s: reject.`,
          log: [...log],
          cutoff,
        })
      } else {
        log.push(t)
        decisions[req] = true
        emit({
          req,
          t,
          phase: 'allow',
          line: 7,
          note: `Only ${log.length - 1} in the last ${W}s: allow, and append ${fmt(t)}s to the log.`,
          log: [...log],
          cutoff,
        })
      }
    })
  }

  if (algo === 'counter') {
    let bucket = -1
    let prev = 0
    let curr = 0
    requests.forEach((t, req) => {
      const b = Math.floor(t / W)
      if (b !== bucket) {
        prev = b === bucket + 1 ? curr : 0
        bucket = b
        curr = 0
        emit({
          req,
          t,
          phase: 'roll',
          line: 4,
          note: `New window. Keep the finished window's total (${prev}) as "prev" and start "curr" again at 0.`,
          windowStart: b * W,
          count: curr,
          prev,
          overlap: 1 - (t - b * W) / W,
          estimate: prev * (1 - (t - b * W) / W) + curr,
        })
      }
      const elapsed = (t - b * W) / W
      const overlap = 1 - elapsed
      const estimate = prev * overlap + curr
      emit({
        req,
        t,
        phase: 'estimate',
        line: 7,
        note: `We are ${Math.round(elapsed * 100)}% into this window, so ${Math.round(overlap * 100)}% of the previous one still overlaps: ${prev} × ${fmt(overlap)} + ${curr} = ${fmt(estimate)}.`,
        windowStart: b * W,
        count: curr,
        prev,
        overlap,
        estimate,
      })
      if (estimate >= L) {
        decisions[req] = false
        emit({
          req,
          t,
          phase: 'reject',
          line: 9,
          note: `The estimate ${fmt(estimate)} has reached the limit of ${L}: reject.`,
          windowStart: b * W,
          count: curr,
          prev,
          overlap,
          estimate,
        })
      } else {
        curr += 1
        decisions[req] = true
        emit({
          req,
          t,
          phase: 'allow',
          line: 10,
          note: `The estimate ${fmt(estimate)} is under ${L}: allow, and "curr" becomes ${curr}.`,
          windowStart: b * W,
          count: curr,
          prev,
          overlap,
          estimate: prev * overlap + curr,
        })
      }
    })
  }

  if (algo === 'bucket') {
    const rate = L / W
    let tokens = L
    let last = 0
    requests.forEach((t, req) => {
      const elapsed = t - last
      const before = tokens
      tokens = Math.min(L, tokens + elapsed * rate)
      last = t
      const gained = tokens - before
      emit({
        req,
        t,
        phase: 'refill',
        line: 3,
        note:
          gained > 0
            ? `${fmt(elapsed)}s since the last request: add ${fmt(gained)} of a token at ${fmt(rate)} per second. Now ${fmt(tokens)}.`
            : before >= L
              ? `The bucket is already full at ${fmt(tokens)} tokens.`
              : `No time has passed, so nothing to refill. Still ${fmt(tokens)}.`,
        tokens,
      })
      if (tokens < 1) {
        decisions[req] = false
        emit({
          req,
          t,
          phase: 'reject',
          line: 6,
          note: `Only ${fmt(tokens)} of a token is available: reject.`,
          tokens,
        })
      } else {
        tokens -= 1
        decisions[req] = true
        emit({
          req,
          t,
          phase: 'allow',
          line: 7,
          note: `Spend one token: allow. ${fmt(tokens)} left.`,
          tokens,
        })
      }
    })
  }

  return { frames, decisions: decisions.map((d) => d === true) }
}

/** Just the allow/reject decisions. */
export function decide(algo: Algo, requests: number[], cfg: Config): boolean[] {
  return simulate(algo, requests, cfg).decisions
}

export type Span = {
  /** How many requests fall in the densest span. */
  count: number
  /** Time of the first request in that span. */
  start: number
  /** Time of the last request in that span. */
  last: number
}

/**
 * The densest half-open span of `window` seconds: the most timestamps that fit
 * in [t, t + window) for any t. This is the number a rate limit is really a
 * promise about.
 */
export function worstSpan(times: number[], window: number): Span | null {
  if (times.length === 0) return null
  const sorted = [...times].sort((a, b) => a - b)
  let best: Span = { count: 0, start: sorted[0]!, last: sorted[0]! }
  let j = 0
  for (let i = 0; i < sorted.length; i++) {
    if (j < i) j = i
    while (j + 1 < sorted.length && sorted[j + 1]! < sorted[i]! + window) j++
    const count = j - i + 1
    if (count > best.count) best = { count, start: sorted[i]!, last: sorted[j]! }
  }
  return best
}

/** Allowed timestamps → densest span, for one algorithm. */
export function worstAllowedSpan(algo: Algo, requests: number[], cfg: Config): Span | null {
  const decisions = decide(algo, requests, cfg)
  return worstSpan(
    requests.filter((_, i) => decisions[i]),
    cfg.window,
  )
}

/** What one key costs to track, in plain words. */
export function stateSize(algo: Algo, cfg: Config): string {
  if (algo === 'log') return `up to ${cfg.limit} timestamps`
  if (algo === 'counter') return '2 counters + a window id'
  if (algo === 'bucket') return '1 token count + 1 timestamp'
  return '1 counter + a window id'
}

/* ── request streams ──────────────────────────────────────────────────── */

export type Preset = { id: string; name: string; hint: string; requests: number[] }

const range = (from: number, to: number, step: number) => {
  const out: number[] = []
  for (let t = from; t <= to + 1e-9; t += step) out.push(Math.round(t * 100) / 100)
  return out
}

export const PRESETS: Preset[] = [
  {
    id: 'burst',
    name: 'Boundary burst',
    hint: '5 just before t = 10, 5 just after',
    requests: [...range(7.5, 9.5, 0.5), ...range(10, 12, 0.5)],
  },
  {
    id: 'hammer',
    name: 'Hammering client',
    hint: 'A request every half second',
    requests: range(0, 24.5, 0.5),
  },
  {
    id: 'drip',
    name: 'Well-behaved',
    hint: 'Exactly at the allowed rate',
    requests: range(0, 28, 2),
  },
  {
    id: 'edge',
    name: 'Exactly one window later',
    hint: 'Does t = 10 see the request at t = 0?',
    requests: [0, 1, 2, 3, 4, 10, 10.5],
  },
]

export const DEFAULT_CONFIG: Config = { limit: 5, window: 10 }
