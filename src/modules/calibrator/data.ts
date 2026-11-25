/*
 * The Loop Calibrator's content.
 *
 * The round weights are this app's estimates, pieced together from public
 * candidate reports and (for OGP) the employer's own careers pages. They are
 * a way to decide where to spend prep hours, not a description of any one
 * company's process. See the Sources page for what each claim rests on.
 */

export type RoundId = 'dsa' | 'ai' | 'classic' | 'agentic' | 'lead'

export type Round = {
  id: RoundId
  name: string
  short: string
  color: string
  /** Where to practise it. */
  path: string
  lab: string
  what: string
}

export const ROUNDS: Round[] = [
  {
    id: 'dsa',
    name: 'Algorithms & concurrency',
    short: 'Algorithms',
    color: 'var(--color-line-green)',
    path: '/patterns',
    lab: 'Pattern & Concurrency Lab',
    what: 'Core patterns under a clock, locks and races, problems that change mid-round.',
  },
  {
    id: 'ai',
    name: 'AI-assisted & practical coding',
    short: 'AI-assisted',
    color: 'var(--color-line-purple)',
    path: '/bugbash',
    lab: 'AI-Assisted Bug Bash',
    what: 'Reading unfamiliar code, catching what an assistant got wrong, debugging, integrating.',
  },
  {
    id: 'classic',
    name: 'Classic system design',
    short: 'System design',
    color: 'var(--color-line-orange)',
    path: '/design/flash-sale',
    lab: 'System Design Sandbox · Flash sale',
    what: 'High-scale design with numbers, a bottleneck, a failure mode and a bill.',
  },
  {
    id: 'agentic',
    name: 'AI & agentic system design',
    short: 'AI design',
    color: '#e0a23c',
    path: '/design/agent',
    lab: 'System Design Sandbox · Refund agent',
    what: 'Retrieval, serving, agents that act, and the governance that bounds them.',
  },
  {
    id: 'lead',
    name: 'Leadership & trade-offs',
    short: 'Leadership',
    color: 'var(--color-line-blue)',
    path: '/translator',
    lab: 'PMP + CPMAI Translator',
    what: 'Ownership stories, judgment calls, and how you talk about delivery.',
  },
]

export type ArchetypeId = 'regional' | 'global' | 'banks' | 'public'

export type Archetype = {
  id: ArchetypeId
  name: string
  examples: string
  /** One line on the character of the loop. */
  tagline: string
  /** Percent of the loop's weight per round. Sums to 100. */
  weights: Record<RoundId, number>
  /** The usual order of stages. */
  sequence: string[]
  graded: string[]
  downlevel: string
  edge: string
  /** Where to start, in order. */
  startWith: { label: string; path: string }[]
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'regional',
    name: 'Regional tech',
    examples: 'Grab · Sea / Shopee · ByteDance / TikTok',
    tagline: 'A gate of algorithms and fundamentals, then a design round that decides your level.',
    weights: { dsa: 32, ai: 8, classic: 30, agentic: 10, lead: 20 },
    sequence: ['Online assessment', 'Technical screen', 'Coding rounds', 'System design', 'Hiring manager'],
    graded: [
      'Speed and correctness on core patterns under a clock. Fundamentals sit close behind: operating systems, networking and databases show up in assessments.',
      'Whether your design survives a real traffic shape: a flash sale, ride dispatch, a flaky mobile network.',
      'Concurrency you can reason about out loud: locks, idempotency, and what happens on a retry.',
    ],
    downlevel:
      'A correct but slow coding round, or a design that stops at boxes and arrows: no numbers, no bottleneck, no failure mode. At six years, the design round sets the level.',
    edge:
      'Use it late. In the hiring-manager round, shipping under ambiguity and landing cross-team launches count for a lot, once the engineering signal is already banked.',
    startWith: [
      { label: 'Flash-sale race', path: '/patterns/race' },
      { label: 'Flash sale at midnight', path: '/design/flash-sale' },
      { label: 'Rate limiter', path: '/patterns/rate-limiter' },
    ],
  },
  {
    id: 'global',
    name: 'Global tech & fintech',
    examples: 'Stripe · Google · Meta',
    tagline: 'Engineering craft on realistic code, increasingly with an assistant in the room.',
    weights: { dsa: 24, ai: 22, classic: 24, agentic: 8, lead: 22 },
    sequence: ['Recruiter screen', 'Technical screen', 'Classic coding', 'AI-assisted or practical coding', 'System design', 'Behavioural'],
    graded: [
      'Craft on code that looks like work: reading unfamiliar files, debugging, integrating an API from its documentation.',
      'Judgment with an assistant in the loop. You verify, you scope, you own the result. Formats differ by company and team, so ask which one you will get.',
      'Clear trade-off narration, and a problem scope that matches the level you are interviewing for.',
    ],
    downlevel:
      'Accepting generated code you cannot explain, or quietly solving the easy version of the design. Senior is awarded for scope and judgment, not for finishing first.',
    edge:
      'Behavioural rounds reward ownership stories told with mechanisms and numbers. Your delivery background supplies the stories. The Translator makes them sound like an engineer’s.',
    startWith: [
      { label: 'AI-Assisted Bug Bash', path: '/bugbash' },
      { label: 'The requirement changed', path: '/patterns/evolving' },
      { label: 'The answer mixer', path: '/translator/mixer' },
    ],
  },
  {
    id: 'banks',
    name: 'Banks & regulated',
    examples: 'DBS · OCBC · UOB · GIC',
    tagline: 'Depth in what you have built, and proof you can design inside the rules.',
    weights: { dsa: 14, ai: 10, classic: 26, agentic: 24, lead: 26 },
    sequence: ['Online assessment', 'Technical interview', 'Design and project deep-dive', 'Panel or hiring manager', 'HR'],
    graded: [
      'Depth in your own stack and projects. Expect to be walked through what you built layer by layer; Java and Spring, SQL and messaging come up often.',
      'Reliability and control: idempotent payments, reconciliation, audit trails, change management, modernising a system without breaking it.',
      'For AI roles, whether you can design inside the rules: MAS’ AI risk guidelines, FEAT, PDPA and, for agents, IMDA’s framework.',
    ],
    downlevel:
      'Treating governance as someone else’s job. Or designing for a scale the bank does not have while leaving out the audit trail it must have.',
    edge:
      'This is where it compounds. Risk materiality, staged rollout, human approval, vendor accountability: you already think this way. Say it as architecture, not as process.',
    startWith: [
      { label: 'The refund agent', path: '/design/agent' },
      { label: 'Translation map', path: '/translator/map' },
      { label: 'Bug bash: refunds', path: '/bugbash/refunds' },
    ],
  },
  {
    id: 'public',
    name: 'Public-good tech',
    examples: 'GovTech · Open Government Products',
    tagline: 'Show that you build, and that you build the smallest thing that helps.',
    weights: { dsa: 10, ai: 28, classic: 22, agentic: 12, lead: 28 },
    sequence: ['Screening', 'Skills interview', 'Practical work or presentation', 'Hiring managers'],
    graded: [
      'Evidence that you build: shipped products, side projects, and how clearly you can talk about your own code.',
      'Pragmatism. The smallest thing that solves an officer’s or a citizen’s problem, shipped safely.',
      'Product sense and user impact, weighed alongside the engineering.',
    ],
    downlevel:
      'Over-engineering a simple brief, or being unable to say why you built it that way and what you would cut first.',
    edge:
      'Delivery and stakeholder instincts are a real asset here, provided the first thing they see is working software.',
    startWith: [
      { label: 'AI-Assisted Bug Bash', path: '/bugbash' },
      { label: 'The first 90 seconds', path: '/translator/opening' },
      { label: 'The requirement changed', path: '/patterns/evolving' },
    ],
  },
]

export type Shift = {
  n: string
  title: string
  body: string
  facts: string[]
  grade: 'checked' | 'reported'
}

export const SHIFTS: Shift[] = [
  {
    n: '01',
    title: 'Algorithm screens changed shape',
    body: 'They did not go away. Regional employers still gate on them. At six years the weight moves from trick puzzles to core patterns under a clock, concurrency, and problems whose requirements change while you are solving them.',
    facts: [
      'Online assessments remain the first gate at regional tech firms and banks.',
      'Evolving, multi-part problems are a staple of practical coding rounds.',
    ],
    grade: 'reported',
  },
  {
    n: '02',
    title: 'An assistant joined some coding rounds',
    body: 'A few employers now hand you existing code and an AI assistant, and watch how you read, verify and direct it. It is real and it is uneven: others still ban AI outright.',
    facts: [
      'Meta: a 60-minute AI-assisted coding round since October 2025.',
      'Google: reported pilot of a code-comprehension round, junior and mid-level roles on select US teams.',
      'Stripe: Bug Bash and Integration rounds are long-standing.',
    ],
    grade: 'reported',
  },
  {
    n: '03',
    title: 'In Singapore, governance became a design constraint',
    body: 'Two documents now shape how AI systems are discussed here, especially at banks and in the public sector. Knowing them as engineering requirements, not as compliance trivia, is a differentiator.',
    facts: [
      'IMDA’s agentic AI framework: launched 22 Jan 2026, v1.5 on 20 May 2026. Voluntary. Four dimensions.',
      'MAS’ AI risk guidelines: final on 7 Oct 2026, phased in over 2027 and 2028.',
    ],
    grade: 'checked',
  },
]

/** Split a weekly hour budget across rounds, in half-hour steps. */
export function allocateHours(
  weights: Record<RoundId, number>,
  hours: number,
): Record<RoundId, number> {
  const ids = Object.keys(weights) as RoundId[]
  const halfHours = Math.round(hours * 2)
  const exact = ids.map((id) => (weights[id] / 100) * halfHours)
  const floors = exact.map(Math.floor)
  let left = halfHours - floors.reduce((a, b) => a + b, 0)
  // Largest-remainder rounding, so the parts always add up to the budget.
  const order = exact
    .map((x, i) => ({ i, rem: x - Math.floor(x) }))
    .sort((a, b) => b.rem - a.rem)
  for (const { i } of order) {
    if (left <= 0) break
    floors[i]! += 1
    left -= 1
  }
  return Object.fromEntries(ids.map((id, i) => [id, floors[i]! / 2])) as Record<RoundId, number>
}
