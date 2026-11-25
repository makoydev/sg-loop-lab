import type { ImdaDimensionId } from '@/lib/facts'

/*
 * The refund agent, as a model small enough to reason about.
 *
 * `evaluate(design)` turns a set of design choices into metrics, a reading of
 * governance coverage, and the outcome of five incidents. `runIncident` turns
 * (design, incident) into a step-by-step trace. Everything is pure and
 * deterministic, so the UI only renders and the claims below are unit-tested.
 *
 * Every number here is a teaching model: chosen so that the trade-offs point
 * the right way and stay easy to follow, not measured from a real system.
 *
 * One rule carries most of the lesson. The cap and the approval checkpoint are
 * only real when the deterministic policy check is on, because that check is
 * the code that enforces them. Without it they are sentences in a prompt.
 */

/* ── the design ───────────────────────────────────────────────────────── */

export type Design = {
  // 1 · bound the risks upfront
  identity: 'shared' | 'scoped'
  /** Largest refund the agent may issue with no human, in S$. */
  cap: number
  tools: 'narrow' | 'broad'
  // 2 · make humans accountable
  approval: 'none' | 'above-cap' | 'all'
  reviewers: number
  // 3 · technical controls and processes
  guardrails: boolean
  policyCheck: boolean
  idempotency: boolean
  audit: 'none' | 'logs' | 'trace'
  breaker: boolean
  rollout: 'full' | 'staged'
  // 4 · end-user responsibility
  disclosure: boolean
  escalation: boolean
  // retrieval and serving
  retrieval: 'vector' | 'hybrid'
  chunking: 'fixed' | 'structure'
  freshness: 'nightly' | 'event'
  permissions: 'none' | 'post' | 'pre'
  cache: 'off' | 'on' | 'scoped'
  routing: 'large' | 'cascade'
  fallback: 'none' | 'secondary' | 'degrade'
}

export type ControlId = keyof Design

/**
 * Which IMDA dimension a control serves, in this app's reading of the
 * framework, or `rag` for retrieval and serving choices that are plain
 * engineering rather than governance.
 */
export type GroupId = ImdaDimensionId | 'rag'

export const CONTROLS: Record<ControlId, { label: string; group: GroupId }> = {
  identity: { label: 'Agent identity', group: 'bound' },
  cap: { label: 'Auto-approve cap', group: 'bound' },
  tools: { label: 'Tool allow-list', group: 'bound' },
  approval: { label: 'Approval checkpoint', group: 'accountable' },
  reviewers: { label: 'Reviewer capacity', group: 'accountable' },
  guardrails: { label: 'Guardrails', group: 'technical' },
  policyCheck: { label: 'Deterministic policy check', group: 'technical' },
  idempotency: { label: 'Idempotency keys', group: 'technical' },
  audit: { label: 'Audit trail', group: 'technical' },
  breaker: { label: 'Circuit breaker', group: 'technical' },
  rollout: { label: 'Staged rollout', group: 'technical' },
  disclosure: { label: 'Agent disclosure', group: 'enduser' },
  escalation: { label: 'Human escalation path', group: 'enduser' },
  retrieval: { label: 'Retrieval', group: 'rag' },
  chunking: { label: 'Chunking', group: 'rag' },
  freshness: { label: 'Index freshness', group: 'rag' },
  // A retrieval setting, but limiting what the agent can read is part of
  // bounding it, so it counts toward dimension 1.
  permissions: { label: 'Document permissions', group: 'bound' },
  cache: { label: 'Semantic cache', group: 'rag' },
  routing: { label: 'Model routing', group: 'rag' },
  fallback: { label: 'Provider fallback', group: 'rag' },
}

/** No controls at all: the comparison baseline for the incident replay. */
export const BASELINE: Design = {
  identity: 'shared',
  cap: 5000,
  tools: 'broad',
  approval: 'none',
  reviewers: 0,
  guardrails: false,
  policyCheck: false,
  idempotency: false,
  audit: 'none',
  breaker: false,
  rollout: 'full',
  disclosure: false,
  escalation: false,
  retrieval: 'vector',
  chunking: 'fixed',
  freshness: 'nightly',
  permissions: 'none',
  cache: 'on',
  routing: 'large',
  fallback: 'none',
}

/** Where the sandbox starts: the demo that impressed the steering committee. */
export const STARTING: Design = { ...BASELINE, tools: 'narrow', audit: 'logs' }

/** One design that meets every target. There are others. */
export const REFERENCE: Design = {
  identity: 'scoped',
  cap: 200,
  tools: 'narrow',
  approval: 'above-cap',
  reviewers: 2,
  guardrails: true,
  policyCheck: true,
  idempotency: true,
  audit: 'trace',
  breaker: true,
  rollout: 'staged',
  disclosure: true,
  escalation: true,
  retrieval: 'hybrid',
  chunking: 'structure',
  freshness: 'event',
  permissions: 'pre',
  cache: 'scoped',
  routing: 'cascade',
  fallback: 'secondary',
}

/** Stops on the cap slider: dense where the decisions are. */
export const CAP_STOPS = [0, 20, 50, 100, 150, 200, 300, 500, 750, 1000, 2000, 5000]

/* ── scale and targets ────────────────────────────────────────────────── */

export const SCALE = {
  conversations: 200_000,
  documents: 40_000,
  /** About 6% of conversations end in a refund request. */
  refundsPerMonth: 12_000,
} as const

export const BOUNDS = {
  /** Worst single agent action, S$. */
  blast: 500,
  staleMinutes: 15,
  ttftMs: 1200,
  /** S$ per month. */
  budget: 60_000,
  /** Grounded-answer rate, %. */
  grounded: 90,
  /** Minimum reading for each IMDA dimension, out of 100. */
  coverage: 75,
} as const

/* ── formatting ───────────────────────────────────────────────────────── */

export function money(n: number): string {
  return `S$${Math.round(n).toLocaleString('en-SG')}`
}

export function fmtDuration(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  if (m < 60 * 48) {
    const h = m / 60
    return `${Number.isInteger(h) ? h : h.toFixed(h < 10 ? 1 : 0)} h`
  }
  return `${Math.round(m / 1440)} days`
}

export function pct(share: number, dp = 0): string {
  return `${(share * 100).toFixed(dp)}%`
}

/* ── refund sizes ─────────────────────────────────────────────────────── */

// Share of refund requests at or below an amount. Most are small fees.
const REFUND_CDF: [number, number][] = [
  [0, 0],
  [20, 0.35],
  [50, 0.7],
  [100, 0.82],
  [200, 0.9],
  [500, 0.955],
  [1000, 0.98],
  [2000, 0.992],
  [5000, 1],
]

/** Share of refund requests that are at or below `amount`. */
export function shareAtOrBelow(amount: number): number {
  if (amount <= 0) return 0
  for (let i = 1; i < REFUND_CDF.length; i++) {
    const [x1, y1] = REFUND_CDF[i]!
    const [x0, y0] = REFUND_CDF[i - 1]!
    if (amount <= x1) return y0 + ((amount - x0) / (x1 - x0)) * (y1 - y0)
  }
  return 1
}

/* ── human oversight ──────────────────────────────────────────────────── */

const CAREFUL_REVIEW_SECONDS = 360
const MIN_REVIEW_SECONDS = 45
const REVIEWER_HOURS = 150
/** Careful reviews one reviewer can do in a month. */
const REVIEWS_PER_REVIEWER = (REVIEWER_HOURS * 3600) / CAREFUL_REVIEW_SECONDS
const REVIEWER_HOURLY = 38
/** A request nobody is on shift to read expires after three days. */
const STALLED_WAIT_MINUTES = 4320

export type Oversight = {
  /** Routing to a human is done by code (the policy check), not by the model. */
  enforced: boolean
  /** Share of refunds that are sent to a human. */
  reviewedShare: number
  reviewsPerMonth: number
  /** Demand divided by what the team can read carefully. Infinity with nobody on shift. */
  load: number
  /** Requests exist but nobody is on shift. */
  stalled: boolean
  /** More arrives than can be read properly, so reviews get shorter. */
  rubberStamping: boolean
  /** Seconds actually spent on each review. */
  reviewSeconds: number
  /** Share of requests reviewers reject or change. */
  overrideRate: number
  /** Typical wait for a human decision. */
  waitMinutes: number
  hours: number
  cost: number
  /** A real person reads the requests, and the routing cannot be skipped. */
  effective: boolean
}

export function oversight(d: Design): Oversight {
  const reviewedShare =
    d.approval === 'all' ? 1 : d.approval === 'above-cap' ? 1 - shareAtOrBelow(d.cap) : 0
  const reviewsPerMonth = SCALE.refundsPerMonth * reviewedShare
  const hasWork = reviewsPerMonth > 0
  const stalled = hasWork && d.reviewers === 0
  const load = !hasWork
    ? 0
    : d.reviewers === 0
      ? Infinity
      : reviewsPerMonth / (d.reviewers * REVIEWS_PER_REVIEWER)
  const rubberStamping = !stalled && load > 1
  const reviewSeconds =
    !hasWork || stalled
      ? 0
      : load <= 1
        ? CAREFUL_REVIEW_SECONDS
        : Math.max(MIN_REVIEW_SECONDS, CAREFUL_REVIEW_SECONDS / load)
  // Reviewing everything dilutes the queue with trivial requests, so the
  // honest override rate is lower to begin with. Rushing lowers it further.
  const baseOverride = d.approval === 'all' ? 0.03 : 0.09
  const overrideRate =
    !hasWork || stalled ? 0 : baseOverride * (reviewSeconds / CAREFUL_REVIEW_SECONDS) ** 1.4
  const waitMinutes = !hasWork
    ? 0
    : stalled
      ? STALLED_WAIT_MINUTES
      : 5 + 55 * Math.min(load, 1) ** 3 + (load > 1 ? 240 * (load - 1) : 0)
  const hours = stalled
    ? 0
    : Math.min((reviewsPerMonth * reviewSeconds) / 3600, d.reviewers * REVIEWER_HOURS)
  const enforced = d.policyCheck && d.approval !== 'none'
  return {
    enforced,
    reviewedShare,
    reviewsPerMonth,
    load,
    stalled,
    rubberStamping,
    reviewSeconds,
    overrideRate,
    waitMinutes,
    hours,
    cost: hours * REVIEWER_HOURLY,
    effective: enforced && !stalled && !rubberStamping,
  }
}

/* ── metrics ──────────────────────────────────────────────────────────── */

const SMALL_MODEL_MS = 340
const LARGE_MODEL_MS = 950
/** Share of turns the small model hands to the large one. */
const ESCALATION_SHARE = 0.28
const CACHE_HIT_MS = 70
const CACHE_HIT_RATE = { off: 0, on: 0.34, scoped: 0.26 } as const
const LARGE_COST = 0.21
const SMALL_COST = 0.03
const GUARDRAIL_COST = 0.012
const INDEX_LAG_MINUTES = { nightly: 1020, event: 5 } as const
const CACHE_TTL_MINUTES = 1440

export type Metrics = {
  /** Average time to first token, ms. */
  ttftMs: number
  cacheHitRate: number
  cost: { tokens: number; infra: number; reviewers: number; total: number }
  /** Share of answers grounded in a retrieved, current passage, %. */
  grounded: number
  /** How long an outdated answer can keep being served after a document changes. */
  staleMinutes: number
  /** Worst loss from one agent action, S$. */
  blast: number
  /** The payments tool's own per-call limit. */
  toolMax: number
  /** The cap is enforced by code outside the model. */
  capEnforced: boolean
  /** Share of refunds decided with no real human look. */
  autonomyShare: number
}

export function toolMaxOf(d: Design): number {
  return d.tools === 'broad' ? 20_000 : 5000
}

function blastRadius(d: Design, o: Oversight): number {
  const toolMax = toolMaxOf(d)
  // No code enforces anything: the tool's own limit is the only limit.
  if (!d.policyCheck) return toolMax
  const auto = d.approval === 'all' ? 0 : d.cap
  // Reviewers who cannot read what they approve are not a limit.
  const human = d.approval !== 'none' && o.rubberStamping ? toolMax : 0
  return Math.max(auto, human)
}

export function metrics(d: Design, o: Oversight = oversight(d)): Metrics {
  const hit = CACHE_HIT_RATE[d.cache]
  const guardMs = d.guardrails ? 110 : 0
  const retrievalMs =
    (d.retrieval === 'hybrid' ? 260 : 90) +
    (d.permissions === 'pre' ? 15 : d.permissions === 'post' ? 5 : 0)
  const modelMs =
    d.routing === 'cascade' ? SMALL_MODEL_MS + ESCALATION_SHARE * LARGE_MODEL_MS : LARGE_MODEL_MS
  const missMs = guardMs + retrievalMs + modelMs
  const ttftMs = hit * (guardMs + CACHE_HIT_MS) + (1 - hit) * missMs

  const perConversation =
    (d.routing === 'cascade' ? SMALL_COST + ESCALATION_SHARE * LARGE_COST : LARGE_COST) *
    (d.chunking === 'structure' ? 0.9 : 1) *
    (1 - hit)
  const tokens = (perConversation + (d.guardrails ? GUARDRAIL_COST : 0)) * SCALE.conversations

  const infra =
    3000 +
    (d.retrieval === 'hybrid' ? 1400 : 0) +
    (d.freshness === 'event' ? 1800 : 400) +
    (d.cache === 'on' ? 600 : d.cache === 'scoped' ? 900 : 0) +
    (d.audit === 'logs' ? 300 : d.audit === 'trace' ? 2200 : 0) +
    (d.breaker ? 500 : 0) +
    (d.policyCheck ? 700 : 0) +
    (d.identity === 'scoped' ? 400 : 0) +
    (d.rollout === 'staged' ? 600 : 0) +
    (d.fallback === 'secondary' ? 1500 : d.fallback === 'degrade' ? 300 : 0) +
    (d.escalation ? 2000 : 0) +
    (d.permissions === 'pre' ? 300 : d.permissions === 'post' ? 100 : 0)

  const grounded = Math.min(
    97,
    78 +
      (d.retrieval === 'hybrid' ? 8 : 0) +
      (d.chunking === 'structure' ? 6 : 0) +
      (d.routing === 'cascade' ? -2 : 0) +
      (d.guardrails ? 3 : 0) +
      (d.freshness === 'nightly' ? -2 : 0) +
      (d.cache === 'on' ? -1 : 0),
  )

  const staleMinutes = INDEX_LAG_MINUTES[d.freshness] + (d.cache === 'on' ? CACHE_TTL_MINUTES : 0)
  const humanShare = o.effective ? o.reviewedShare : 0

  return {
    ttftMs,
    cacheHitRate: hit,
    cost: { tokens, infra, reviewers: o.cost, total: tokens + infra + o.cost },
    grounded,
    staleMinutes,
    blast: blastRadius(d, o),
    toolMax: toolMaxOf(d),
    capEnforced: d.policyCheck,
    autonomyShare: d.policyCheck ? 1 - humanShare : 1,
  }
}

/* ── governance coverage: this app's reading of the IMDA framework ────── */

export type CoverageItem = { control: ControlId; label: string; points: number; max: number }
export type Coverage = Record<ImdaDimensionId, { score: number; items: CoverageItem[] }>

/**
 * A 0 to 100 reading of how much of each IMDA dimension the design exercises.
 * The framework itself has no scores; this is the app's own interpretation,
 * there to make gaps visible.
 */
export function coverage(d: Design, o: Oversight = oversight(d)): Coverage {
  const autonomy = !d.policyCheck
    ? 0
    : d.approval === 'all' || d.cap <= BOUNDS.blast
      ? 40
      : d.cap <= 2000
        ? 25
        : 10
  const bound: CoverageItem[] = [
    {
      control: 'identity',
      label: 'Own identity, least privilege',
      points: d.identity === 'scoped' ? 30 : 0,
      max: 30,
    },
    { control: 'cap', label: 'Autonomy bounded in code', points: autonomy, max: 40 },
    { control: 'tools', label: 'Narrow tool access', points: d.tools === 'narrow' ? 15 : 0, max: 15 },
    {
      control: 'permissions',
      label: 'Reads only what the user may',
      points: d.permissions === 'pre' ? 15 : d.permissions === 'post' ? 8 : 0,
      max: 15,
    },
  ]
  const accountable: CoverageItem[] = [
    {
      control: 'approval',
      label: 'Approval before sensitive actions',
      points: d.approval === 'none' ? 0 : d.policyCheck ? 40 : 10,
      max: 40,
    },
    {
      control: 'reviewers',
      label: 'Reviewers have time to look',
      points: o.effective ? 30 : 0,
      max: 30,
    },
    {
      control: 'identity',
      label: 'Actions traceable to an owner',
      points: d.identity === 'scoped' ? 15 : 0,
      max: 15,
    },
    {
      control: 'audit',
      label: 'Approvals on record',
      points: d.audit === 'trace' ? 15 : d.audit === 'logs' ? 5 : 0,
      max: 15,
    },
  ]
  const technical: CoverageItem[] = [
    {
      control: 'policyCheck',
      label: 'Deterministic check outside the model',
      points: d.policyCheck ? 25 : 0,
      max: 25,
    },
    { control: 'guardrails', label: 'Guardrails', points: d.guardrails ? 10 : 0, max: 10 },
    { control: 'idempotency', label: 'Idempotent tool calls', points: d.idempotency ? 15 : 0, max: 15 },
    {
      control: 'audit',
      label: 'Monitoring and audit trail',
      points: d.audit === 'trace' ? 20 : d.audit === 'logs' ? 8 : 0,
      max: 20,
    },
    { control: 'breaker', label: 'A way to halt the agent', points: d.breaker ? 15 : 0, max: 15 },
    { control: 'rollout', label: 'Gradual rollout', points: d.rollout === 'staged' ? 15 : 0, max: 15 },
  ]
  const enduser: CoverageItem[] = [
    { control: 'disclosure', label: 'Told it is an agent', points: d.disclosure ? 50 : 0, max: 50 },
    { control: 'escalation', label: 'Can reach a human', points: d.escalation ? 50 : 0, max: 50 },
  ]
  const sum = (items: CoverageItem[]) => items.reduce((n, item) => n + item.points, 0)
  return {
    bound: { score: sum(bound), items: bound },
    accountable: { score: sum(accountable), items: accountable },
    technical: { score: sum(technical), items: technical },
    enduser: { score: sum(enduser), items: enduser },
  }
}

/* ── materiality: an illustration in the MAS vocabulary ───────────────── */

export type Level = 'Low' | 'Medium' | 'High'
export type Rating = { score: number; level: Level; why: string }
export type Materiality = { impact: Rating; complexity: Rating; reliance: Rating; overall: Level }

function level(score: number): Level {
  return score < 40 ? 'Low' : score < 70 ? 'Medium' : 'High'
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, n))

/**
 * Impact, complexity and reliance are the three dimensions MAS names for
 * rating AI risk materiality. The scores are this app's illustration of how a
 * design moves them; the real rating is the institution's to make.
 */
export function materiality(d: Design, m: Metrics): Materiality {
  const impactScore = clamp100(
    (m.blast <= BOUNDS.blast ? 30 : m.blast <= 2000 ? 55 : 80) +
      (d.tools === 'broad' ? 10 : 0) +
      (d.identity === 'shared' ? 10 : 0),
  )
  const complexityScore = clamp100(
    55 +
      (d.routing === 'cascade' ? 8 : 0) +
      (d.fallback === 'secondary' ? 7 : 0) +
      (d.tools === 'broad' ? 10 : 0) +
      (d.retrieval === 'hybrid' ? 3 : 0) +
      (d.audit === 'trace' ? -10 : d.audit === 'none' ? 10 : 0),
  )
  const capFactor = !d.policyCheck ? 1 : d.approval === 'all' ? 0 : d.cap / 5000
  const relianceScore = clamp100(20 + 50 * m.autonomyShare + 30 * capFactor)

  const impact: Rating = {
    score: impactScore,
    level: level(impactScore),
    why: `One action can move up to ${money(m.blast)}${d.identity === 'shared' ? ', and the agent can read every customer' : ''}.`,
  }
  const complexity: Rating = {
    score: complexityScore,
    level: level(complexityScore),
    why:
      d.audit === 'trace'
        ? 'A language-model agent with tools, but its reasoning and actions are on record.'
        : 'A language-model agent with tools, and little record of why it acted.',
  }
  const reliance: Rating = {
    score: relianceScore,
    level: level(relianceScore),
    why: !d.policyCheck
      ? 'Nothing outside the model decides anything, so every refund relies on the model.'
      : `${pct(m.autonomyShare)} of refunds are decided with no person involved.`,
  }
  const top = Math.max(impactScore, complexityScore, relianceScore)
  return { impact, complexity, reliance, overall: level(top) }
}
