import { countWords, parseMarked, type Annotated, type LineInfo, type LineRole } from '../logic'

/*
 * The raw material for "tell me about yourself".
 *
 * These eight lines are stand-ins for the user's own career: the lab is about
 * which lines make the cut and in what order, not about these exact words.
 * Signal spans are marked inline as {code:text}; see SIGNAL_CODES in logic.ts.
 */

export type OpeningLine = Annotated & {
  id: string
  role: LineRole
  /** What the line is, in three words. */
  label: string
  words: number
}

function line(id: string, role: LineRole, label: string, marked: string): OpeningLine {
  const parsed = parseMarked(marked)
  return { id, role, label, ...parsed, words: countWords(parsed.text) }
}

export const OPENING_LINES: OpeningLine[] = [
  line(
    'systems',
    'proof',
    'A system and its scale',
    'For the last three years I have {o:built} the {s:order-routing service} at a regional marketplace. It is {s:Go and Kafka on Postgres}, and it handles about {n:40,000 requests a second} at peak with {n:p99 under 120 milliseconds}.',
  ),
  line(
    'incident',
    'proof',
    'An incident you owned',
    'I was the {o:on-call lead} when a retry storm took {s:checkout} down for {n:23 minutes}. I {o:traced it} to a missing {m:idempotency key}, {o:shipped the fix} that night, and wrote the {m:postmortem}.',
  ),
  line(
    'tradeoff',
    'proof',
    'A hard technical call',
    '{d:The hardest call I made} was moving stock checks from {m:row locks} to an {m:atomic counter in Redis}. We {t:accepted a few seconds of reconciliation lag}, and oversells during flash sales {n:went to zero}.',
  ),
  line(
    'delivery',
    'lead',
    'Cross-team delivery',
    'I also {o:led} the migration off our monolith’s {s:payment module}: {n:six engineers across three teams}, cut over behind a {m:feature flag}, {m:one merchant cohort at a time}, with {n:no downtime}.',
  ),
  line(
    'pmp',
    'credential',
    'The PMP',
    'I hold a {c:PMP}. In practice it is how I plan a risky change: a {m:staged rollout}, a {m:rollback I have rehearsed}, and {m:a number that tells us to stop}.',
  ),
  line(
    'cpmai',
    'credential',
    'CPMAI, in progress',
    'I am finishing {c:CPMAI}, PMI’s methodology for running AI projects. It is why I ask about {m:data readiness} and the {m:evaluation set} before anyone argues about which model.',
  ),
  line(
    'stakeholders',
    'process',
    'Stakeholder management',
    'I am strong at {p:stakeholder management}. I keep product, operations and compliance {p:aligned}, run the {p:steering updates}, and make sure {p:expectations are managed} throughout the project.',
  ),
  line(
    'next',
    'close',
    'What you want next',
    'What I want next is a senior role where I {o:own a system end to end} and help the team ship AI features without betting the company on them.',
  ),
]

export const LINE_BY_ID: Record<string, OpeningLine> = Object.fromEntries(
  OPENING_LINES.map((l) => [l.id, l]),
)

/** The shape `readOpening` needs: role and length of every line. */
export const LINE_INFO: Record<string, LineInfo> = Object.fromEntries(
  OPENING_LINES.map((l) => [l.id, { role: l.role, words: l.words }]),
)

/** Where the challenge starts: the order a CV suggests, credentials first. */
export const CV_ORDER: string[] = [
  'pmp',
  'cpmai',
  'stakeholders',
  'delivery',
  'systems',
  'incident',
  'tradeoff',
  'next',
]

/** One strong arrangement: three proofs, then scope, then the credentials as mechanisms. */
export const REFERENCE_ORDER: string[] = [
  'systems',
  'incident',
  'tradeoff',
  'delivery',
  'pmp',
  'cpmai',
  'next',
]

export const ROLE_LABEL: Record<LineRole, string> = {
  proof: 'Engineering proof',
  lead: 'Team scope',
  credential: 'Credential',
  process: 'Process claim',
  close: 'The ask',
}
