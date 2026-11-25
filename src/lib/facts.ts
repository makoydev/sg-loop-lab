/*
 * The checked facts every lab draws on, kept in one place so wording stays
 * consistent and corrections happen once. Each entry records where it came
 * from and how solid that source is. Last checked: 25 Nov 2026.
 *
 * Interview formats and regulatory guidance both move. Treat this file as a
 * dated snapshot, and confirm anything load-bearing against the primary source.
 */

/* ── IMDA: agentic AI governance ──────────────────────────────────────── */

export type ImdaDimensionId = 'bound' | 'accountable' | 'technical' | 'enduser'

export type ImdaDimension = {
  id: ImdaDimensionId
  n: number
  title: string
  short: string
  gist: string
  /** What the dimension turns into when you are the engineer designing the system. */
  practices: string[]
}

export const IMDA = {
  name: 'Model AI Governance Framework for Agentic AI',
  short: 'IMDA agentic AI framework',
  owner: 'Infocomm Media Development Authority (IMDA), Singapore',
  launched: '22 Jan 2026',
  updated: 'v1.5, 20 May 2026',
  status: 'Voluntary guidance. It is not law and creates no legal obligations.',
  url: 'https://www.imda.gov.sg/-/media/imda/files/about/emerging-tech-and-research/artificial-intelligence/mgf-for-agentic-ai.pdf',
  risks: [
    'Erroneous actions',
    'Unauthorised actions',
    'Biased or unfair actions',
    'Data breaches',
    'Disruption to connected systems',
  ],
  dimensions: [
    {
      id: 'bound',
      n: 1,
      title: 'Assess and bound the risks upfront',
      short: 'Bound risks upfront',
      gist: 'Decide what the agent may touch before it exists: scope its tools, autonomy and blast radius per use case.',
      practices: [
        'Risk-assess each use case: data sensitivity, range of actions, reversibility',
        'Give every agent its own identity, tied to an accountable human or team',
        'Least-privilege, scoped permissions that never exceed the authorising human’s',
        'Prefer deterministic limits (caps, allow-lists, sandboxes) over prompt instructions',
      ],
    },
    {
      id: 'accountable',
      n: 2,
      title: 'Make humans meaningfully accountable',
      short: 'Human accountability',
      gist: 'A named human answers for what the agent does, and approves the actions that matter.',
      practices: [
        'Human approval before high-stakes or irreversible actions (payments, deletions, outbound messages)',
        'Watch for automation bias: track override rates and review times',
        'Deny by default when the approval path is unavailable',
        'Clear allocation of responsibility across builder, platform and deployer',
      ],
    },
    {
      id: 'technical',
      n: 3,
      title: 'Implement technical controls and processes',
      short: 'Technical controls',
      gist: 'Engineer the guardrails across the lifecycle: build, test, roll out gradually, monitor, and be able to stop.',
      practices: [
        'System-level deterministic safeguards for higher-risk actions, not only prompt-level ones',
        'Test whole workflows before deployment: tool calls, policy compliance, robustness',
        'Roll out gradually: trained users and lower-risk systems first',
        'Continuous monitoring and logging; audit trails that cannot be quietly deleted',
        'A way to halt the agent and fall back when it misbehaves',
      ],
    },
    {
      id: 'enduser',
      n: 4,
      title: 'Enable end-user responsibility',
      short: 'End-user responsibility',
      gist: 'People using or supervising the agent know what it is, what it can do, and how to reach a human.',
      practices: [
        'Disclose up front that the user is dealing with an agent',
        'Explain the agent’s range of actions and how data is used',
        'Give a human escalation path',
        'Train staff who oversee agents, and keep their core skills alive',
      ],
    },
  ] satisfies ImdaDimension[] as ImdaDimension[],
}

/* ── MAS: AI risk management for financial institutions ───────────────── */

export const MAS = {
  name: 'Guidelines on Artificial Intelligence Risk Management',
  short: 'MAS AI risk guidelines',
  owner: 'Monetary Authority of Singapore (MAS)',
  consulted: '13 Nov 2025',
  issued: '7 Oct 2026',
  phases: [
    { when: 'from 7 Oct 2027', what: 'Oversight, AI identification, inventory, risk materiality' },
    { when: 'by 7 Oct 2028', what: 'AI life cycle controls, capability and capacity' },
  ],
  status:
    'Supervisory guidelines applied proportionately, not a binding notice. FEAT (2018) continues to apply alongside.',
  url: 'https://www.mas.gov.sg/regulation/guidelines/guidelines-on-artificial-intelligence-risk-management-for-financial-institutions',
  pillars: [
    'Board and senior management oversight',
    'AI identification, inventory and risk materiality assessment',
    'AI life cycle controls',
    'Capability and capacity',
  ],
  materiality: [
    { id: 'impact', title: 'Impact', gist: 'What a failure costs customers and the firm, including data sensitivity.' },
    { id: 'complexity', title: 'Complexity', gist: 'Novelty, explainability, and how much you can see into third-party AI.' },
    { id: 'reliance', title: 'Reliance', gist: 'How much autonomy the AI has and how much a human is still involved.' },
  ],
  forEngineers: [
    'An AI inventory: for agents, their identifiers, the tools and systems they can reach, and their guardrails',
    'Independent validation before deploying high-materiality use cases',
    'Monitoring that can cover an agent’s reasoning, actions and tool use',
    'Kill switches or overrides considered for high-materiality AI, with tested fallbacks',
    'Change management with version control and rollback',
    'The institution stays accountable for third-party AI',
  ],
  next: 'MAS has said it intends to consult on further agentic AI guidance in 2027.',
}

export const FEAT = {
  name: 'FEAT Principles',
  expanded: 'Fairness, Ethics, Accountability, Transparency',
  owner: 'MAS',
  issued: '2018',
  url: 'https://www.mas.gov.sg/publications/monographs-or-information-paper/2018/feat',
}

export const PDPA = {
  name: 'Personal Data Protection Act 2012',
  short: 'PDPA',
  gist: 'Singapore’s baseline law on collecting, using and disclosing personal data.',
  url: 'https://www.pdpc.gov.sg/overview-of-pdpa/the-legislation/personal-data-protection-act',
}

/* ── CPMAI ────────────────────────────────────────────────────────────── */

export const CPMAI_PHASES = [
  { n: 1, id: 'business', title: 'Business Understanding' },
  { n: 2, id: 'data-understanding', title: 'Data Understanding' },
  { n: 3, id: 'data-prep', title: 'Data Preparation' },
  { n: 4, id: 'model-dev', title: 'Model Development' },
  { n: 5, id: 'model-eval', title: 'Model Evaluation' },
  { n: 6, id: 'model-ops', title: 'Model Operationalization' },
] as const

/* ── Sources ──────────────────────────────────────────────────────────── */

export type SourceGrade = 'primary' | 'secondary' | 'anecdotal'

export type Source = {
  topic: string
  claim: string
  grade: SourceGrade
  /** Why the grade, and what to double-check. */
  note: string
  links: { label: string; url: string }[]
}

export const SOURCES: Source[] = [
  {
    topic: 'IMDA agentic AI framework',
    claim:
      'Launched 22 Jan 2026 and updated to v1.5 on 20 May 2026. Voluntary. Four dimensions: bound risks upfront, human accountability, technical controls and processes, end-user responsibility.',
    grade: 'secondary',
    note: 'Dates and the four dimensions are consistent across IMDA’s release and two law-firm summaries. The practice-level detail in this app is paraphrased from summaries of the PDF, so quote the PDF itself, not this app, in an interview.',
    links: [
      { label: 'IMDA framework (PDF)', url: IMDA.url },
      {
        label: 'IMDA launch release',
        url: 'https://www.imda.gov.sg/resources/press-releases-factsheets-and-speeches/press-releases/2026/new-model-ai-governance-framework-for-agentic-ai',
      },
      {
        label: 'Baker McKenzie on v1.5',
        url: 'https://www.bakermckenzie.com/en/insight/publications/2026/06/singapore-imda-updates-model-ai-governance-framework-for-agentic-ai',
      },
    ],
  },
  {
    topic: 'MAS AI risk guidelines',
    claim:
      'Final guidelines issued 7 Oct 2026 after a Nov 2025 consultation. Oversight, inventory and materiality expectations apply from 7 Oct 2027; life cycle controls and capability by 7 Oct 2028. Materiality is rated on impact, complexity and reliance.',
    grade: 'secondary',
    note: 'Dates agree across several commentaries. Section-level detail here comes from commentary rather than a direct read of the MAS text, and commentators note MAS expects controls for high-risk uses sooner than the outer dates.',
    links: [
      { label: 'MAS guidelines page', url: MAS.url },
      { label: 'MAS FEAT principles (2018)', url: FEAT.url },
    ],
  },
  {
    topic: 'AI-assisted coding rounds',
    claim:
      'Meta has run a 60-minute AI-assisted coding round in CoderPad since Oct 2025, in place of one classic coding round for many candidates. Google is reported to be piloting a “human-led, AI-assisted” code comprehension round with Gemini for junior and mid-level roles on select US teams. Canva and Shopify use AI tools in parts of their technical interviews.',
    grade: 'secondary',
    note: 'No company has published a scoring rubric. Scope differs by team, level and country, and some employers still prohibit AI entirely. Ask your recruiter which format you will get.',
    links: [
      {
        label: 'CoderPad on Meta’s format',
        url: 'https://coderpad.io/blog/hiring-developers/ai-in-the-interview-is-not-cheating-it-is-the-job-according-to-meta/',
      },
      {
        label: 'interviewing.io on Meta’s round',
        url: 'https://interviewing.io/blog/how-to-use-ai-in-meta-s-ai-assisted-coding-interview-with-real-prompts-and-examples',
      },
    ],
  },
  {
    topic: 'Stripe’s practical rounds',
    claim:
      'Stripe loops are reported to include scenario-driven coding plus Bug Bash and Integration rounds, with an AI-assisted coding round appearing in some 2026 loops.',
    grade: 'anecdotal',
    note: 'From candidate-written guides, not from Stripe. Round mix varies by role, level and country.',
    links: [
      { label: 'interviewing.io: Stripe', url: 'https://interviewing.io/stripe-interview-questions' },
    ],
  },
  {
    topic: 'Singapore employer loops',
    claim:
      'Regional tech firms commonly start with an online assessment and run algorithm, fundamentals and system design rounds. Banks lean on stack, SQL, project deep-dives and design. Open Government Products describes 3–4 rounds over 3–5 weeks, starting with screening and ending with hiring managers.',
    grade: 'anecdotal',
    note: 'Only OGP publishes its process. Everything else is pieced together from anonymous candidate reports of mixed age and seniority. The round weightings in the Calibrator are this app’s estimates, not data.',
    links: [{ label: 'OGP hiring process', url: 'https://www.open.gov.sg/careers/roles/' }],
  },
  {
    topic: 'Employment Pass and COMPASS',
    claim:
      'The Employment Pass qualifying salary is reported to rise to S$6,000 a month (S$6,600 in financial services) for new applications from 1 Jan 2027, and it increases with age. Most candidates must also score 40 points on COMPASS, where salary relative to sector peers is one criterion.',
    grade: 'secondary',
    note: 'Figures come from immigration advisories. Check MOM for the current numbers and the age-adjusted thresholds before relying on them.',
    links: [
      { label: 'MOM: Employment Pass eligibility', url: 'https://www.mom.gov.sg/passes-and-permits/employment-pass/eligibility' },
      { label: 'MOM: COMPASS', url: 'https://www.mom.gov.sg/compass' },
    ],
  },
  {
    topic: 'CPMAI',
    claim:
      'PMI’s CPMAI methodology has six iterative phases: Business Understanding, Data Understanding, Data Preparation, Model Development, Model Evaluation, Model Operationalization.',
    grade: 'primary',
    note: 'Phase names are stable across PMI material. Two of the six phases are about data, and both come before any model is built.',
    links: [
      { label: 'PMI: six stages of an AI project', url: 'https://www.pmi.org/blog/6-stages-to-run-a-successful-ai-project' },
    ],
  },
]
