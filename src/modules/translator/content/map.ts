import { CPMAI_PHASES } from '@/lib/facts'
import { parseMarked, type Annotated } from '../logic'

/*
 * Reference material for the translation map.
 *
 * Part one: delivery concepts a PMP uses every day, each restated as the
 * engineering mechanism that does the same job, with a line that works in an
 * interview and the line it replaces.
 *
 * Part two: what each CPMAI phase buys you in an AI system design round.
 * Phase names come from `CPMAI_PHASES`; the interview moves are this app's
 * reading of them, not PMI material.
 */

export type Phrase = {
  id: string
  /** The delivery concept, as a project manager names it. */
  pm: string
  /** The same job, as an engineering mechanism. */
  eng: string
  /** How the mechanism works. */
  mechanism: string
  /** A line that lands with an engineering panel. */
  say: Annotated
  /** The line it replaces. */
  not: Annotated
}

function phrase(
  id: string,
  pm: string,
  eng: string,
  mechanism: string,
  say: string,
  not: string,
): Phrase {
  return { id, pm, eng, mechanism, say: parseMarked(say), not: parseMarked(not) }
}

export const PHRASES: Phrase[] = [
  phrase(
    'risk-register',
    'Risk register',
    'Failure modes, ranked by blast radius',
    'List the ways the system breaks under load or bad input, what each one takes down with it, and the control that contains it: a timeout, a circuit breaker, a cap.',
    '{n:Three things} can take this down at {n:ten times the load}. The worst is the {s:ledger write}, so that one gets the {m:circuit breaker} and the {m:alert}.',
    'I maintained the {p:risk register} and reviewed it weekly with {p:stakeholders}.',
  ),
  phrase(
    'stakeholders',
    'Stakeholder management',
    'Shared numbers and written decisions',
    'Agree the one metric each party cares about, put them on a dashboard everyone can open, and record contested calls in a short decision note that lists the options you rejected.',
    'Operations cared about {n:refund time} and finance about {n:leakage}, so I put both on {m:one dashboard} and we argued about the numbers instead of each other.',
    'I am strong at {p:managing stakeholders} and {p:keeping everyone aligned}.',
  ),
  phrase(
    'stage-gates',
    'Stage gates and phased rollout',
    'Canary at 1, 10 and 50 percent, gated on error-budget burn',
    'Each stage widens exposure only if the service level objective holds for a set time. The gate is a query, not a meeting, and stepping back is one switch.',
    'We went {n:1, 10, 50, 100 percent}. Each step waited {n:an hour} for {m:error-budget burn under 2%}, and the {m:rollback was one flag}.',
    'We followed a {p:phased approach} with {p:go-live approval at each stage gate}.',
  ),
  phrase(
    'change-control',
    'Change control',
    'Feature flags, reviewed diffs and decision records',
    'Risky changes ship dark behind a flag, every change is a reviewed diff with a way back, and architectural choices get a short decision record.',
    'It {m:shipped dark behind a flag}. Turning it on was a {m:one-line config change} with {o:an owner}, and turning it off was the same line.',
    'All changes went through the {p:change control board} for {p:approval}.',
  ),
  phrase(
    'critical-path',
    'Critical path',
    'The one dependency that sets the date',
    'Find the single integration or migration that everything else waits on, start it first, and give it a spike or a contract test in week one.',
    'The date was set by the {s:ledger migration} and nothing else. So {d:I started there} and {m:stubbed everything around it}.',
    'I tracked the {p:critical path} on the {p:Gantt chart} and reported float each week.',
  ),
  phrase(
    'raci',
    'RACI',
    'A name on the pager, a name on the decision',
    'One owner per service and per alert, an on-call rotation, and a single named approver for each irreversible action.',
    '{o:I owned} the {s:payout service} and was {o:first on the pager}. Refunds above the cap had {m:one named approver}.',
    'We defined a {p:RACI matrix} so that {p:roles and responsibilities} were clear.',
  ),
  phrase(
    'lessons',
    'Lessons learned',
    'Blameless postmortem with owned, dated actions',
    'A timeline, the contributing causes, and a short list of fixes that each have an owner and a date and are tracked until done.',
    'The {m:postmortem} had {n:four actions}, each with an owner and a date. {n:Three shipped within two weeks}; the fourth was the {m:alert} that caught the next one.',
    'We held a {p:lessons learned session} and {p:documented the findings}.',
  ),
  phrase(
    'build-buy',
    'Build versus buy analysis',
    'A time-boxed spike on your real workload, with an exit condition',
    'Measure the candidate on your own data and queries for two days, decide, and write down the condition that would make you revisit.',
    'A {n:two-day} {m:spike on our real queries} showed the managed option met the target. {d:We revisit} at {n:ten times the volume}.',
    'I prepared a {p:build-versus-buy analysis} with a {p:weighted scoring matrix}.',
  ),
  phrase(
    'go-no-go',
    'Go / no-go',
    'A launch checklist where every line is a query',
    'Readiness is a set of conditions a machine can check: load test passed at target, alerts verified, rollback rehearsed, on-call covered.',
    'Go meant {n:four checks} were green: {m:load test at twice peak}, {m:rollback rehearsed}, {m:alerts verified}, {m:on-call covered}. One was red, so {d:it was a no}.',
    'We held a {p:go / no-go meeting} and the {p:stakeholders gave their approval}.',
  ),
  phrase(
    'scope',
    'Scope management',
    'The smallest slice that is safe to ship, and what you cut to get it',
    'Cut along a line that keeps correctness intact: fewer merchants, fewer features, never fewer safety checks.',
    '{d:I cut reporting from the first release} and kept the {m:reconciliation check}. {t:Scope moved; the correctness bar did not.}',
    'I managed {p:scope creep} through the {p:change request process}.',
  ),
  phrase(
    'quality',
    'Quality management',
    'Tests in CI, an SLO, and an error budget that can stop a launch',
    'Quality is enforced by the pipeline and measured in production: a regression test for every incident, an objective per user journey, and a budget that pauses feature work when it is spent.',
    '{s:Checkout} has a {n:99.9%} {m:SLO}. When we burned {n:half the monthly budget in a week}, {d:I paused the launch} and we fixed the {m:retry path} first.',
    'We followed the {p:quality management plan} and conducted regular {p:quality audits}.',
  ),
  phrase(
    'comms',
    'Communication plan',
    'Dashboards people can pull, and one channel during incidents',
    'Replace pushed status reports with a live dashboard and a short weekly note of decisions and numbers. During an incident, use one channel and a fixed update interval.',
    'Nobody waited for my update: the {m:migration dashboard} showed {n:mismatches remaining}. In the incident I posted {n:every 15 minutes} in {m:one channel}.',
    'I sent {p:weekly status reports} in line with the {p:communication plan}.',
  ),
]

export const PHRASE_BY_ID: Record<string, Phrase> = Object.fromEntries(
  PHRASES.map((p) => [p.id, p]),
)

/* ── CPMAI across an AI system design round ───────────────────────────── */

export type CpmaiPhaseId = (typeof CPMAI_PHASES)[number]['id']

export type CpmaiMove = {
  /** The interview move this phase gives you. */
  move: string
  /** A clarifying question to put to the interviewer. */
  ask: string
  /** How it sounds when you say it in the room. */
  sounds: string
  /** True for the phases that are about data and come before any model. */
  data: boolean
}

export const CPMAI_MOVES: Record<CpmaiPhaseId, CpmaiMove> = {
  business: {
    move: 'Challenge whether this needs AI at all, and price a wrong answer.',
    ask: 'What does a wrong answer cost here, and who notices first? Is there a rule-based version that gets most of the value?',
    sounds:
      'Before the architecture: is a wrong refund S$20 or S$20,000? That number decides how much autonomy this system ever gets.',
    data: false,
  },
  'data-understanding': {
    move: 'Ask what data exists, how fresh it is, and who is allowed to see it.',
    ask: 'Where do the documents live, how often do they change, and are permissions set per document or per user?',
    sounds:
      'Freshness and permissions shape this design more than the model does. A nightly index and a policy that changes at 9 a.m. means a day of wrong answers.',
    data: true,
  },
  'data-prep': {
    move: 'Treat chunking, personal-data handling and a labelled evaluation set as first-class work.',
    ask: 'Do we have labelled examples of good answers? Should I assume personal data must be masked before it reaches a model provider?',
    sounds:
      'I would spend the first week on the evaluation set and on chunking by document structure, because every later choice is measured against them.',
    data: true,
  },
  'model-dev': {
    move: 'Make the model a replaceable part: build versus buy, small versus large, with a fallback.',
    ask: 'Is a hosted model acceptable for this data, or does it have to run inside our environment?',
    sounds:
      'Start with a hosted model behind an interface we own, route the easy queries to a small one, and keep a fallback so a provider outage degrades the service instead of stopping it.',
    data: false,
  },
  'model-eval': {
    move: 'Define passing before building: offline evaluation, a golden set, red-teaming.',
    ask: 'What would make you comfortable launching: an accuracy bar, a ceiling on unsupported answers, zero leaked documents?',
    sounds:
      'Launch is gated on the golden set and on a prompt-injection suite. If we cannot say what passing means, we are not ready to say when.',
    data: false,
  },
  'model-ops': {
    move: 'Plan monitoring, drift, human override, rollback and cost before day one.',
    ask: 'Who is on call for this, what do they see when quality drops, and how do they turn it off?',
    sounds:
      'In production I want an online quality signal with an alert, a way for a person to take over, a rollback to the previous prompt and index, and cost per conversation on the same dashboard.',
    data: false,
  },
}
