import type { Tone } from '@/lib/cn'

/*
 * The Translator's rules, as pure functions.
 *
 * Three ideas live here:
 *   1. Signal anatomy: a sentence is made of spans that give an interview
 *      panel something (a system, a number, a decision, a mechanism…) or
 *      give it nothing it can write down (a process noun, a buzzword).
 *   2. The opening: the order of your first lines decides what kind of
 *      candidate the panel thinks it is talking to.
 *   3. The level reading: an answer built from four parts is levelled by
 *      what each part contains.
 *
 * The readings are a teaching model of how panels tend to react. They are
 * deterministic and unit-tested so the feedback in the lab is consistent,
 * not because interviewers follow a formula.
 */

/* ── signal anatomy ───────────────────────────────────────────────────── */

export type SignalKind =
  | 'system'
  | 'mechanism'
  | 'number'
  | 'decision'
  | 'tradeoff'
  | 'ownership'
  | 'credential'
  | 'process'
  | 'buzz'

/** How a span is drawn. Two kinds can share a colour and differ by mark. */
export type SignalMark = 'underline' | 'fill' | 'dashed' | 'outline' | 'wavy'

/** Which side of the ledger a signal falls on. */
export type SignalSide = 'engineering' | 'credential' | 'delivery'

export type SignalMeta = {
  label: string
  /** What the span gives the panel. */
  hint: string
  tone: Tone
  mark: SignalMark
  side: SignalSide
}

export const SIGNALS: Record<SignalKind, SignalMeta> = {
  system: {
    label: 'System',
    hint: 'A named thing you built or ran',
    tone: 'trace',
    mark: 'underline',
    side: 'engineering',
  },
  mechanism: {
    label: 'Mechanism',
    hint: 'Something you could point to in a repo or a runbook',
    tone: 'trace',
    mark: 'fill',
    side: 'engineering',
  },
  number: {
    label: 'Number',
    hint: 'A scale, a rate, a date, a cost',
    tone: 'warn',
    mark: 'fill',
    side: 'engineering',
  },
  decision: {
    label: 'Decision',
    hint: 'A call made in the first person',
    tone: 'ok',
    mark: 'fill',
    side: 'engineering',
  },
  tradeoff: {
    label: 'Trade-off',
    hint: 'What the decision cost',
    tone: 'ok',
    mark: 'dashed',
    side: 'engineering',
  },
  ownership: {
    label: 'Ownership',
    hint: 'A verb with you as its subject',
    tone: 'info',
    mark: 'underline',
    side: 'engineering',
  },
  credential: {
    label: 'Credential',
    hint: 'A certificate or a title',
    tone: 'neutral',
    mark: 'outline',
    side: 'credential',
  },
  process: {
    label: 'Process noun',
    hint: 'A document, a meeting, a forum',
    tone: 'bad',
    mark: 'underline',
    side: 'delivery',
  },
  buzz: {
    label: 'Buzzword',
    hint: 'Sounds senior, names nothing',
    tone: 'bad',
    mark: 'wavy',
    side: 'delivery',
  },
}

export const SIGNAL_ORDER: SignalKind[] = [
  'system',
  'mechanism',
  'number',
  'decision',
  'tradeoff',
  'ownership',
  'credential',
  'process',
  'buzz',
]

/** One-letter codes used by the inline markup in the content files. */
export const SIGNAL_CODES: Record<string, SignalKind> = {
  s: 'system',
  m: 'mechanism',
  n: 'number',
  d: 'decision',
  t: 'tradeoff',
  o: 'ownership',
  c: 'credential',
  p: 'process',
  b: 'buzz',
}

export type Piece = { text: string; kind?: SignalKind }
export type Span = { text: string; kind: SignalKind; start: number; end: number }

/** A sentence with its signal spans located. */
export type Annotated = {
  /** The plain text, with the markup removed. */
  text: string
  /** The text cut into plain and annotated pieces, in order. */
  pieces: Piece[]
  spans: Span[]
}

const MARK = /\{([a-z]):([^{}]+)\}/g

/**
 * Parse authored text such as `I {d:said no} to {n:the 9th}` into plain text
 * plus classified spans. Unknown codes are kept as plain text and produce no
 * span, which the content tests catch.
 */
export function parseMarked(marked: string): Annotated {
  const pieces: Piece[] = []
  const spans: Span[] = []
  let text = ''
  let last = 0
  for (const match of marked.matchAll(MARK)) {
    const whole = match[0]
    const kind = SIGNAL_CODES[match[1] ?? '']
    const inner = match[2] ?? ''
    const at = match.index
    const before = marked.slice(last, at)
    if (before) {
      pieces.push({ text: before })
      text += before
    }
    if (kind) {
      spans.push({ text: inner, kind, start: text.length, end: text.length + inner.length })
      pieces.push({ text: inner, kind })
    } else {
      pieces.push({ text: inner })
    }
    text += inner
    last = at + whole.length
  }
  const rest = marked.slice(last)
  if (rest) {
    pieces.push({ text: rest })
    text += rest
  }
  return { text, pieces, spans }
}

export type Tally = Record<SignalKind, number>

export function emptyTally(): Tally {
  return {
    system: 0,
    mechanism: 0,
    number: 0,
    decision: 0,
    tradeoff: 0,
    ownership: 0,
    credential: 0,
    process: 0,
    buzz: 0,
  }
}

/** Count spans by kind across any number of sentences. */
export function tally(items: Pick<Annotated, 'spans'>[]): Tally {
  const out = emptyTally()
  for (const item of items) for (const span of item.spans) out[span.kind] += 1
  return out
}

/** Totals for the two sides that matter: what a panel can write down, and what it cannot. */
export function sides(t: Tally): Record<SignalSide, number> {
  const out: Record<SignalSide, number> = { engineering: 0, credential: 0, delivery: 0 }
  for (const kind of SIGNAL_ORDER) out[SIGNALS[kind].side] += t[kind]
  return out
}

/* ── speaking time ────────────────────────────────────────────────────── */

/** A comfortable interview pace. */
export const WORDS_PER_MINUTE = 150

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function speakingSeconds(words: number, wpm = WORDS_PER_MINUTE): number {
  return (words / wpm) * 60
}

/* ── the opening ──────────────────────────────────────────────────────── */

/**
 * What a line of an opening does for the panel:
 *   proof:      a system, an incident or a trade-off only an engineer could describe
 *   lead:       team or cross-team scope
 *   credential: a certification
 *   process:    a claim about process with no mechanism in it
 *   close:      what you want next
 */
export type LineRole = 'proof' | 'lead' | 'credential' | 'process' | 'close'

export type LineInfo = { role: LineRole; words: number }

export type NoteTone = 'ok' | 'warn' | 'bad'
export type Note = { tone: NoteTone; text: string }

export type OpeningBand = 'empty' | 'pm' | 'unclear' | 'engineer' | 'lead'

export const OPENING_BUDGET_SECONDS = 90

export const OPENING_BANDS: { band: Exclude<OpeningBand, 'empty'>; from: number; label: string }[] =
  [
    { band: 'pm', from: 0, label: 'Project manager who used to code' },
    { band: 'unclear', from: 35, label: 'Hard to place' },
    { band: 'engineer', from: 60, label: 'Engineer' },
    { band: 'lead', from: 80, label: 'Engineer who can lead' },
  ]

export type OpeningReading = {
  /** 0 (project manager who used to code) … 100 (engineer who can lead). */
  score: number
  band: OpeningBand
  label: string
  words: number
  seconds: number
  withinBudget: boolean
  /** Lines of engineering proof included. */
  proofs: number
  /** Proof lines spoken before the first credential, or null if no credential is mentioned. */
  proofsBeforeCredential: number | null
  /** What the interviewer writes down, most important first. */
  notes: Note[]
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const FIRST_LINE_SCORE: Record<LineRole, number> = {
  proof: 18,
  lead: 2,
  credential: -32,
  process: -24,
  close: -10,
}

const FIRST_LINE_NOTE: Record<LineRole, Note> = {
  proof: {
    tone: 'ok',
    text: 'Opened with a system and its scale. I am talking to an engineer.',
  },
  lead: {
    tone: 'warn',
    text: 'Opened with team size before anything they built themselves.',
  },
  credential: {
    tone: 'bad',
    text: 'Led with a certificate. Is this a project manager applying for an engineering role?',
  },
  process: {
    tone: 'bad',
    text: 'Opened on stakeholder management. Still waiting to hear what they built.',
  },
  close: {
    tone: 'warn',
    text: 'Told me what they want before telling me what they have done.',
  },
}

const SEVERITY: Record<NoteTone, number> = { bad: 0, warn: 1, ok: 2 }

function bandFor(score: number): Exclude<OpeningBand, 'empty'> {
  let current: Exclude<OpeningBand, 'empty'> = 'pm'
  for (const b of OPENING_BANDS) if (score >= b.from) current = b.band
  return current
}

/**
 * Read an opening the way a panel hears it. `order` is the list of line ids
 * as spoken; `lines` describes each line. Works on a prefix too, which is how
 * the X-Ray replays the impression forming line by line.
 */
export function readOpening(order: string[], lines: Record<string, LineInfo>): OpeningReading {
  const spoken = order.map((id) => lines[id]).filter((l): l is LineInfo => l != null)
  const roles = spoken.map((l) => l.role)
  const words = spoken.reduce((sum, l) => sum + l.words, 0)
  const seconds = speakingSeconds(words)
  const withinBudget = seconds <= OPENING_BUDGET_SECONDS

  if (roles.length === 0) {
    return {
      score: 0,
      band: 'empty',
      label: 'Nothing said yet',
      words: 0,
      seconds: 0,
      withinBudget: true,
      proofs: 0,
      proofsBeforeCredential: null,
      notes: [{ tone: 'warn', text: 'Silence. Add a line to begin.' }],
    }
  }

  const first = roles[0]!
  const proofs = roles.filter((r) => r === 'proof').length
  const firstCredential = roles.indexOf('credential')
  const hasCredential = firstCredential !== -1
  const proofsBeforeCredential = hasCredential
    ? roles.slice(0, firstCredential).filter((r) => r === 'proof').length
    : null
  const processAt = roles.indexOf('process')
  const leadAt = roles.indexOf('lead')
  const closeAt = roles.indexOf('close')
  const leadAfterProof = leadAt !== -1 && roles.slice(0, leadAt).includes('proof')

  let score = 50 + FIRST_LINE_SCORE[first]
  if (proofsBeforeCredential != null) {
    score += proofsBeforeCredential >= 2 ? 14 : proofsBeforeCredential === 1 ? 4 : -18
  }
  score += proofs === 0 ? -20 : Math.min(proofs, 3) * 7
  if (processAt !== -1) score += processAt <= 1 ? -16 : -8
  if (leadAfterProof) score += 4
  if (closeAt !== -1) score += closeAt === roles.length - 1 ? 6 : -4
  if (!withinBudget) score -= 10

  // Ceilings: some things cannot be compensated for by the rest of the opening.
  let ceiling = 100
  if (first !== 'proof') ceiling = Math.min(ceiling, 59)
  if (proofs < 2) ceiling = Math.min(ceiling, 74)
  if (proofsBeforeCredential == null || proofsBeforeCredential < 2) ceiling = Math.min(ceiling, 79)
  if (!withinBudget) ceiling = Math.min(ceiling, 74)

  const finalScore = clamp(Math.round(Math.min(score, ceiling)), 0, 100)
  const band = bandFor(finalScore)

  const rest: Note[] = []
  if (proofs === 0) {
    rest.push({ tone: 'bad', text: 'Nothing so far that only an engineer could say.' })
  } else if (proofs === 1) {
    rest.push({
      tone: 'warn',
      text: 'One concrete system. I want a second proof before I believe the level.',
    })
  } else {
    rest.push({
      tone: 'ok',
      text: 'Two or more proofs with numbers in them. Senior scope is believable.',
    })
  }

  if (proofsBeforeCredential == null) {
    rest.push({
      tone: 'warn',
      text: 'No mention of the PMP or CPMAI. For an AI systems role that was a free differentiator, left unused.',
    })
  } else if (proofsBeforeCredential >= 2) {
    rest.push({
      tone: 'ok',
      text: 'The certifications arrived after the proof, as how they de-risk delivery. A bonus, not the headline.',
    })
  } else if (proofsBeforeCredential === 1) {
    rest.push({
      tone: 'warn',
      text: 'Certifications after a single proof point. A little early: one example is not yet a pattern.',
    })
  } else if (first !== 'credential') {
    rest.push({ tone: 'bad', text: 'Certifications arrived before any engineering proof.' })
  }

  if (processAt !== -1) {
    rest.push(
      processAt <= 1
        ? {
            tone: 'bad',
            text: '“Stakeholder management” in the first two lines, with no mechanism behind it.',
          }
        : {
            tone: 'warn',
            text: '“Stakeholder management” as a claim. No mechanism, so nothing to write down.',
          },
    )
  }

  if (!withinBudget) {
    rest.push({ tone: 'bad', text: 'Ran past 90 seconds. I cut in before the close.' })
  }

  if (leadAfterProof) {
    rest.push({
      tone: 'ok',
      text: 'Team scope described through a flag and cohorts. That is technical leadership.',
    })
  }

  if (closeAt !== -1) {
    rest.push(
      closeAt === roles.length - 1
        ? { tone: 'ok', text: 'Ended on a clear ask.' }
        : { tone: 'warn', text: 'The ask came before the evidence was finished.' },
    )
  }

  // The first impression always leads; after it, the most damaging notes first.
  const sorted = rest
    .map((note, i) => ({ note, i }))
    .sort((a, b) => SEVERITY[a.note.tone] - SEVERITY[b.note.tone] || a.i - b.i)
    .map((x) => x.note)

  return {
    score: finalScore,
    band,
    label: OPENING_BANDS.find((b) => b.band === band)!.label,
    words,
    seconds,
    withinBudget,
    proofs,
    proofsBeforeCredential,
    notes: [FIRST_LINE_NOTE[first], ...sorted],
  }
}

/**
 * What one line does to the impression, given everything said before it.
 * Used by the X-Ray to caption each step of the replay.
 */
export function lineEffect(order: string[], index: number, lines: Record<string, LineInfo>): Note {
  const roles = order.map((id) => lines[id]?.role)
  const role = roles[index]
  if (!role) return { tone: 'warn', text: 'Nothing said.' }
  const before = roles.slice(0, index)
  const proofsBefore = before.filter((r) => r === 'proof').length
  const framedBadly = before.length > 0 && before[0] !== 'proof'

  if (role === 'proof') {
    if (index === 0) {
      return {
        tone: 'ok',
        text: 'The first words are a system and a number. The panel files you under engineer, and hears everything after it that way.',
      }
    }
    if (framedBadly) {
      return {
        tone: 'warn',
        text: 'Good material, but the frame was set by the first line. This now reads as background, not as who you are.',
      }
    }
    if (proofsBefore === 1) {
      return {
        tone: 'ok',
        text: 'A second proof. One example is an anecdote; two is a pattern.',
      }
    }
    return { tone: 'ok', text: 'More proof, with a number in it. The level is now believable.' }
  }

  if (role === 'credential') {
    if (index === 0) {
      return {
        tone: 'bad',
        text: 'The first thing the panel knows about you is a certificate. Everything after it is heard as a project manager who codes.',
      }
    }
    if (proofsBefore >= 2) {
      return {
        tone: 'ok',
        text: 'Now the certification lands as how you de-risk delivery: a bonus on top of proof, with a mechanism attached.',
      }
    }
    if (proofsBefore === 1) {
      return {
        tone: 'warn',
        text: 'A little early. After a single proof the certificate still competes for the headline.',
      }
    }
    return { tone: 'bad', text: 'A credential before any engineering proof.' }
  }

  if (role === 'process') {
    return index <= 1
      ? { tone: 'bad', text: 'Process nouns up front, before anything has been built.' }
      : {
          tone: 'warn',
          text: 'A claim with no mechanism in it. The panel writes nothing down for this line.',
        }
  }

  if (role === 'lead') {
    return proofsBefore >= 1
      ? {
          tone: 'ok',
          text: 'Team scope, told through a flag and cohorts. This is leadership an engineer recognises.',
        }
      : { tone: 'warn', text: 'Team size and dates before anything you built yourself.' }
  }

  return index === order.length - 1
    ? { tone: 'ok', text: 'Ends on a clear ask, so the panel knows what you are here for.' }
    : { tone: 'warn', text: 'The ask arrived before the evidence was finished.' }
}

/* ── the answer mixer ─────────────────────────────────────────────────── */

/**
 * The four voices an answer segment can be written in:
 *   pm:     process artefacts and meetings
 *   mid:    technically true, but no decision and no number
 *   buzz:   sounds senior, names no mechanism
 *   senior: a decision, a mechanism, a number, a trade-off, ownership
 */
export type VariantKind = 'pm' | 'mid' | 'buzz' | 'senior'

export type SegmentId = 'frame' | 'decision' | 'mechanism' | 'result'

export const SEGMENT_ORDER: SegmentId[] = ['frame', 'decision', 'mechanism', 'result']

export const SEGMENT_META: Record<SegmentId, { label: string; ask: string }> = {
  frame: { label: 'Frame', ask: 'Set the scene in one breath: the system, the stakes, your part.' },
  decision: { label: 'Decision', ask: 'What you decided, in the first person.' },
  mechanism: { label: 'Mechanism', ask: 'How you made it safe or true.' },
  result: { label: 'Result', ask: 'What happened, with a number, and what it cost.' },
}

export const VARIANT_META: Record<VariantKind, { label: string; tell: string; tone: NoteTone }> = {
  pm: {
    label: 'PM-flavoured',
    tell: 'The nouns are documents, meetings and forums.',
    tone: 'bad',
  },
  mid: {
    label: 'Mid-level',
    tell: 'True, but no decision and no number.',
    tone: 'warn',
  },
  buzz: {
    label: 'Buzzword trap',
    tell: 'Sounds senior. Names nothing you could probe.',
    tone: 'bad',
  },
  senior: {
    label: 'Senior',
    tell: 'A decision, a mechanism, a number, and its cost.',
    tone: 'ok',
  },
}

/** How much of the bar each voice clears. */
export const VARIANT_WEIGHT: Record<VariantKind, number> = {
  senior: 1,
  mid: 0.5,
  buzz: 0.25,
  pm: 0.2,
}

export type Level = 'mid' | 'senior' | 'staff'

export const LEVELS: { level: Level; label: string }[] = [
  { level: 'mid', label: 'Mid-level' },
  { level: 'senior', label: 'Senior' },
  { level: 'staff', label: 'Staff-track' },
]

const SENIOR_FROM = 0.8
const STAFF_FROM = 0.95

export type LevelReading = {
  /** Mean weight of the chosen parts, 0..1. */
  value: number
  level: Level
  /** Needle position, 0..100, across three equal zones. */
  position: number
  /** How many of the four parts have been chosen. */
  chosen: number
  complete: boolean
  counts: Record<VariantKind, number>
  headline: string
}

/** Map a 0..1 reading onto a bar with three equal zones (mid, senior, staff-track). */
export function levelPosition(value: number): number {
  const v = clamp(value, 0, 1)
  if (v >= STAFF_FROM) return 84
  if (v >= SENIOR_FROM) return 38 + ((v - SENIOR_FROM) / (STAFF_FROM - SENIOR_FROM)) * 24
  return 4 + (v / SENIOR_FROM) * 28
}

/**
 * Level an answer from the voice of each of its four parts
 * (`null` = that part has not been chosen yet).
 */
export function readLevel(kinds: (VariantKind | null)[]): LevelReading {
  const counts: Record<VariantKind, number> = { pm: 0, mid: 0, buzz: 0, senior: 0 }
  let sum = 0
  let chosen = 0
  for (const kind of kinds) {
    if (!kind) continue
    counts[kind] += 1
    sum += VARIANT_WEIGHT[kind]
    chosen += 1
  }
  const complete = chosen === kinds.length && kinds.length > 0
  const value = chosen === 0 ? 0 : sum / chosen
  const level: Level = value >= STAFF_FROM ? 'staff' : value >= SENIOR_FROM ? 'senior' : 'mid'

  let headline: string
  if (chosen === 0) {
    headline = 'Nothing on the page yet.'
  } else if (!complete) {
    headline = `Provisional: ${chosen} of ${kinds.length} parts chosen.`
  } else if (level === 'staff') {
    headline = 'Staff-track. Every part was a decision, a mechanism or a number.'
  } else if (level === 'senior') {
    headline = 'Senior. One part gave the panel nothing to write down.'
  } else if (counts.pm >= 2) {
    headline = 'Reads as a project manager. The nouns are documents and meetings.'
  } else if (counts.buzz >= 2) {
    headline = 'Sounds senior, says little. There is no mechanism to probe.'
  } else {
    headline = 'Mid-level. True statements, but too few decisions and numbers.'
  }

  return { value, level, position: levelPosition(value), chosen, complete, counts, headline }
}

/* ── deterministic shuffle ────────────────────────────────────────────── */

function hash(seed: string): number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^ (h >>> 16)) >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Shuffle a copy of `items` in an order fixed by `seed`. The answer variants
 * must not sit in a recognisable order, and must not move between renders.
 */
export function seededOrder<T>(items: readonly T[], seed: string): T[] {
  const out = [...items]
  const random = mulberry32(hash(seed))
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}
