import type { TraceLane, TraceStep } from '@/components/SequenceTrace'
import type { Lang } from '@/lib/highlight'

/*
 * The shape of one pull request in the Bug Bash. Everything the engine renders
 * (code, docs, bugs, traces, fixes, prompt outcomes) is data in this shape, so
 * adding a scenario means adding a file under `data/`, not touching the UI.
 */

export type Severity = 'critical' | 'high' | 'medium'

export type PrFile = {
  id: string
  /** Repository path shown on the file tab. */
  path: string
  lang: Lang
  code: string
}

/** An inclusive, 1-based range of lines in one file. */
export type Location = {
  fileId: string
  lines: [number, number]
}

/** One entry in the Docs tab: the real contract of something the PR calls. */
export type DocEntry = {
  title: string
  signature?: string
  lang?: Lang
  /** Short statements. Backticks mark inline code. */
  notes: string[]
}

/** The same scenario played twice: with the bug, and with the fix applied. */
export type BugTrace = {
  lanes: TraceLane[]
  initialState?: Record<string, string | number>
  broken: TraceStep[]
  fixed: TraceStep[]
  /** One sentence on what the broken run cost. */
  brokenOutcome: string
  /** One sentence on what the fixed run guarantees. */
  fixedOutcome: string
}

export type FixDiff = {
  path: string
  lang: Lang
  code: string
  /** 1-based line of `code` → added or removed. Unlisted lines are context. */
  tones: Record<number, 'add' | 'del'>
  /** What the fix guarantees, in one sentence. */
  note: string
}

export type PromptKind = 'vague' | 'delegate' | 'scoped'
export type PromptVerdict = 'weak' | 'risky' | 'strong'

/** A follow-up prompt the candidate could send, and its scripted outcome. */
export type PromptOption = {
  kind: PromptKind
  prompt: string
  outcome: {
    files: number
    added: number
    removed: number
    /** What came back. */
    happened: string
    /** What it broke, invented or left behind. */
    damage: string
    /** Minutes of careful review the result needs. */
    reviewMinutes: number
    verdict: PromptVerdict
    /** How an interviewer reads the choice. */
    interviewer: string
  }
}

export type Bug = {
  id: string
  title: string
  /** One of the PR's `categories`: the diagnosis a reviewer should give. */
  category: string
  severity: Severity
  /** Function the bug lives in, used by the nudge. */
  fn: string
  /** Lines that count as having found it. Ranges of different bugs may overlap. */
  locations: Location[]
  summary: string
  /** Why it survives a casual read. */
  plausible: string
  /** What it does in production. */
  impact: string
  trace: BugTrace
  fix: FixDiff
  prompts: PromptOption[]
}

/** Lines that look suspicious and are fine, with the reason. */
export type Decoy = Location & { why: string }

export type PrTakeaway = {
  headline: string
  points: { title: string; body: string }[]
  facts: { label: string; value: string }[]
  traps: string[]
  sayIt: string
  /** Optional pointer to a related lab. */
  seeAlso?: { text: string; label: string; path: string }
}

export type PullRequest = {
  /** Route segment, e.g. `refunds`. */
  id: string
  /** Hint-ladder progress key. */
  ladderId: string
  number: number
  title: string
  tab: { title: string; sub: string }
  tags: string[]
  ticket: { id: string; paragraphs: string[] }
  /** What a teammate typed to the assistant to get this PR. */
  teammatePrompt: string
  /** The PR description, in the assistant's confident voice. */
  description: { summary: string; bullets: string[]; closing: string }
  files: PrFile[]
  docs: { intro: string; entries: DocEntry[] }
  /** Diagnoses offered when flagging: the real ones plus distractors. */
  categories: string[]
  bugs: Bug[]
  decoys: Decoy[]
  /** How many flags the reviewer may hold at once. */
  flagBudget: number
  takeaway: PrTakeaway
}
