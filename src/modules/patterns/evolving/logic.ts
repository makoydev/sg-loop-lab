import {
  EXCERPT,
  shapeSnippet,
  SOLUTION,
  SOLUTION_HIDDEN_COUNTER,
  type PartNumber,
  type Shape,
} from './code'

/*
 * A teaching model of an evolving-requirements coding round.
 *
 * Five decisions go in; a 45-minute timeline comes out: what each part cost,
 * which minutes were rework caused by an earlier choice, and how far you got.
 * The minutes are a model, chosen so the trade-offs point the way they do in
 * a real round. They are not measurements. Everything here is pure and tested.
 */

export type { PartNumber, Shape }
export type Adapt = 'patch' | 'refactor'
export type Quota = 'counter' | 'argument'

export type Decisions = {
  /** Part 1: ask about units and rounding before typing. */
  clarify: boolean
  /** Part 1: the shape of the code. */
  shape: Shape
  /** Part 1: write a quick test before moving on. */
  test: boolean
  /** Part 2, hard-coded shape only: patch in place, or reshape into a table. */
  adapt: Adapt
  /** Part 3: where the free-payout count lives. */
  quota: Quota
}

export const TOTAL_MINUTES = 45
export const PARTS: PartNumber[] = [1, 2, 3, 4]

export const PART_TITLE: Record<PartNumber, string> = {
  1: 'Flat fee per currency',
  2: 'Tiered by amount',
  3: 'Merchant overrides and free payouts',
  4: 'Effective-dated schedules',
}

export const SHAPE_META: Record<Shape, { name: string; short: string; pitch: string }> = {
  branches: {
    name: 'Hard-coded branches',
    short: 'Hard-coded',
    pitch: 'An if/else chain. The fastest thing that passes Part 1.',
  },
  table: {
    name: 'Data table + one function',
    short: 'Data table',
    pitch: 'The fees live in a dictionary. One small function reads it.',
  },
  classes: {
    name: 'Class hierarchy + registry',
    short: 'Class hierarchy',
    pitch: 'A strategy interface and a registry, ready for anything.',
  },
}

/** `build` is the work itself, `habit` is time you chose to invest, `rework` is an earlier choice sending its bill. */
export type CostKind = 'build' | 'habit' | 'rework'
export type Cost = { kind: CostKind; minutes: number; label: string }
export type Diff = { kept: number; changed: number; added: number }

export type PartResult = {
  part: PartNumber
  /** Shape of the code while this part is being written. */
  shape: Shape
  costs: Cost[]
  /** Minutes the part needs. */
  minutes: number
  /** Clock (minutes elapsed) when the part starts. */
  start: number
  /** False if the clock had already run out before this part began. */
  reached: boolean
  /** True if the part was finished inside the 45 minutes. */
  completed: boolean
  /** Minutes actually spent on it before the clock ran out. */
  spent: number
  diff: Diff
  /** Assertions that failed when the twist landed; null when there is no test. */
  testsBroken: number | null
  /** How the twist landed for this shape, in one line. */
  headline: string
}

export type Note = { good: boolean; text: string }

export type Timeline = {
  decisions: Decisions
  parts: PartResult[]
  completedParts: number
  finished: boolean
  minutesUsed: number
  minutesLeft: number
  /** Total minutes lost to rework across the parts that were reached. */
  reworkMinutes: number
  notes: Note[]
  /** How a panel is likely to read the round. */
  verdict: string
}

/* ── the model ────────────────────────────────────────────────────────── */

/** Minutes to write each part, by the shape the code is in at that point. */
const BUILD: Record<PartNumber, Record<Shape, number>> = {
  1: { branches: 4, table: 7, classes: 14 },
  2: { branches: 9, table: 5, classes: 9 },
  3: { branches: 14, table: 8, classes: 12 },
  4: { branches: 16, table: 8, classes: 11 },
}

const BUILD_LABEL: Record<PartNumber, Record<Shape, string>> = {
  1: {
    branches: 'Write the if/else chain',
    table: 'Write the fee table and the lookup',
    classes: 'Write the interface, the flat-fee class and the registry',
  },
  2: {
    branches: 'Add a tier check inside every currency branch',
    table: 'Turn each fee into a list of bands, add the loop',
    classes: 'Add a tiered-fee class and thread amount through the interface',
  },
  3: {
    branches: 'Wrap merchant checks around every branch',
    table: 'Add the override table and the free-payout guard',
    classes: 'Add an override decorator, a quota wrapper and a merchant registry',
  },
  4: {
    branches: 'Add a date check to every branch and duplicate every number',
    table: 'Make schedules a dated list and write the statement loop',
    classes: 'Version the registries by date and teach each class about days',
  },
}

/** Minutes of plain building for a part, in a given shape. */
export function buildMinutes(part: PartNumber, shape: Shape): number {
  return BUILD[part][shape]
}

/** Part 2 for the hard-coded shape when you stop and move the numbers into a table. */
export const RESHAPE_MINUTES = 12
export const CLARIFY_MINUTES = 2
export const TEST_MINUTES = 3
export const PURE_ARGUMENT_MINUTES = 2
/** Converting float dollars to integer cents once percentages expose the problem. */
const FLOAT_REWORK: Record<Shape, number> = { branches: 6, table: 4, classes: 7 }
/** Re-checking earlier behaviour by hand when there is no test. */
const RECHECK: Record<2 | 3 | 4, number> = { 2: 2, 3: 2, 4: 3 }
/** Unpicking a global counter so last month can be re-computed. */
export const HIDDEN_STATE_REWORK = 7

const HEADLINE: Record<PartNumber, Record<Shape, string>> = {
  1: {
    branches: 'Four branches and it works. Nothing is faster today.',
    table: 'A dictionary and a one-line lookup.',
    classes:
      'An abstract base class, a flat-fee class and a registry, before any requirement asked for one.',
  },
  2: {
    branches: 'Every currency branch grew its own tier check. The same logic now exists three times.',
    table: 'Each fee became a list of bands. The function gained one loop.',
    classes:
      'A new class for tiers, and an interface that has to start caring about the amount.',
  },
  3: {
    branches:
      'Merchant checks wrapped around every currency branch. The tier logic now lives in six places.',
    table: 'Overrides are one more dictionary, consulted first. Free payouts are a guard at the top.',
    classes:
      'fee(amount) has no room for a merchant or a count, so every class and every caller changes.',
  },
  4: {
    branches: 'Every branch needs a date check, and every number has to exist twice.',
    table: 'Schedules became a dated list. One helper picks the schedule in force on the day.',
    classes: 'A registry of registries, keyed by date, and a second copy of every registration.',
  },
}

const RESHAPE_HEADLINE =
  'You stopped, said why, and moved the numbers into a table. Expensive now, and the last expensive move.'

/**
 * Illustrative line counts, after Part 1, for the shapes whose full code the
 * lab does not carry. (Part 1 and the whole table shape are counted from the
 * real code.)
 */
const DIFF_ESTIMATE: Record<'branches' | 'classes', Record<2 | 3 | 4, Diff>> = {
  branches: {
    2: { kept: 3, changed: 5, added: 16 },
    3: { kept: 8, changed: 16, added: 30 },
    4: { kept: 14, changed: 40, added: 34 },
  },
  classes: {
    2: { kept: 16, changed: 5, added: 16 },
    3: { kept: 24, changed: 13, added: 32 },
    4: { kept: 48, changed: 21, added: 24 },
  },
}
const TESTS_BROKEN: Record<PartNumber, number> = { 1: 0, 2: 1, 3: 2, 4: 1 }
export const TEST_ASSERTIONS = 3

/* ── line diffs on the real solution ──────────────────────────────────── */

/**
 * A small line diff: which lines of `next` are new, and how many lines were
 * kept, changed or added. Blank lines are ignored; order is not, by design
 * this is enough for code that only grows.
 */
export function diffLines(prev: string, next: string): Diff & { addedLines: number[] } {
  const remaining = new Map<string, number>()
  let prevCount = 0
  for (const line of prev.split('\n')) {
    const key = line.trim()
    if (!key) continue
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
    prevCount += 1
  }
  let kept = 0
  const addedLines: number[] = []
  next.split('\n').forEach((line, i) => {
    const key = line.trim()
    if (!key) return
    const left = remaining.get(key) ?? 0
    if (left > 0) {
      remaining.set(key, left - 1)
      kept += 1
    } else {
      addedLines.push(i + 1)
    }
  })
  const fresh = addedLines.length
  const removed = prevCount - kept
  const changed = Math.min(fresh, removed)
  return { kept, changed, added: fresh - changed, addedLines }
}

const counts = (d: Diff): Diff => ({ kept: d.kept, changed: d.changed, added: d.added })

/** The data-driven solution after `part`, with the lines that twist added. */
export function solutionAt(part: PartNumber): { code: string; addedLines: number[]; diff: Diff } {
  const code = SOLUTION[part]
  const prev = part === 1 ? '' : SOLUTION[(part - 1) as PartNumber]
  const result = diffLines(prev, code)
  return { code, addedLines: result.addedLines, diff: counts(result) }
}

/* ── simulation ───────────────────────────────────────────────────────── */

/** Shape the code is in while writing `part` (reshaping happens during Part 2). */
export function shapeAt(d: Decisions, part: PartNumber): Shape {
  if (d.shape === 'branches' && d.adapt === 'refactor' && part >= 2) return 'table'
  return d.shape
}

const reshapes = (d: Decisions) => d.shape === 'branches' && d.adapt === 'refactor'

function costsFor(d: Decisions, part: PartNumber): Cost[] {
  const shape = shapeAt(d, part)
  const costs: Cost[] = []
  if (part === 1) {
    if (d.clarify) {
      costs.push({ kind: 'habit', minutes: CLARIFY_MINUTES, label: 'Ask about units and rounding' })
    }
    costs.push({ kind: 'build', minutes: BUILD[1][shape], label: BUILD_LABEL[1][shape] })
    if (d.test) {
      costs.push({ kind: 'habit', minutes: TEST_MINUTES, label: 'Write a five-line test' })
    }
    return costs
  }

  if (part === 2 && reshapes(d)) {
    costs.push({
      kind: 'build',
      minutes: RESHAPE_MINUTES,
      label: 'Move the numbers into a table, then add the bands',
    })
  } else {
    costs.push({ kind: 'build', minutes: BUILD[part][shape], label: BUILD_LABEL[part][shape] })
  }

  if (part === 2 && !d.clarify) {
    costs.push({
      kind: 'rework',
      minutes: FLOAT_REWORK[shape],
      label: 'Float dollars broke on 0.8%: convert everything to integer cents',
    })
  }
  if (part === 3 && d.quota === 'argument') {
    costs.push({
      kind: 'habit',
      minutes: PURE_ARGUMENT_MINUTES,
      label: 'Pass the payout count in, and keep the function pure',
    })
  }
  if (part === 4 && d.quota === 'counter') {
    costs.push({
      kind: 'rework',
      minutes: HIDDEN_STATE_REWORK,
      label: 'The global counter only knows this month: unpick it into an argument',
    })
  }
  if (!d.test) {
    costs.push({
      kind: 'rework',
      minutes: RECHECK[part as 2 | 3 | 4],
      label:
        part === 4
          ? 'No test: check the re-computed statement by hand'
          : 'No test: re-check the earlier examples by hand',
    })
  }
  return costs
}

function diffFor(d: Decisions, part: PartNumber): Diff {
  const shape = shapeAt(d, part)
  // Part 1 is all new lines, counted from the snippet the candidate chose.
  if (part === 1) return counts(diffLines('', shapeSnippet(d.shape, d.clarify)))
  // Reshaping rewrites nearly every line of the if/else chain.
  if (part === 2 && reshapes(d)) {
    return counts(diffLines(shapeSnippet('branches', true), SOLUTION[2]))
  }
  if (shape !== 'table') return DIFF_ESTIMATE[shape][part]
  if (part === 3 && d.quota === 'counter') {
    return counts(diffLines(SOLUTION[2], SOLUTION_HIDDEN_COUNTER))
  }
  if (part === 4 && d.quota === 'counter') {
    // Unpicking the global touches lines the pure version never had to.
    return counts(diffLines(SOLUTION_HIDDEN_COUNTER, SOLUTION[4]))
  }
  return solutionAt(part).diff
}

export type CodeView = {
  code: string
  /** 1-based lines this part added or changed. */
  addedLines: number[]
  /** True when this is a representative excerpt, not the whole file. */
  excerpt: boolean
}

/** What the candidate's code looks like after `part`, on the path they chose. */
export function codeAt(d: Decisions, part: PartNumber): CodeView {
  if (part === 1) {
    return { code: shapeSnippet(d.shape, d.clarify), addedLines: [], excerpt: false }
  }
  const shape = shapeAt(d, part)
  if (shape !== 'table') return { code: EXCERPT[shape][part], addedLines: [], excerpt: true }
  if (part === 2 && reshapes(d)) {
    const { addedLines } = diffLines(shapeSnippet('branches', true), SOLUTION[2])
    return { code: SOLUTION[2], addedLines, excerpt: false }
  }
  if (part === 3 && d.quota === 'counter') {
    const { addedLines } = diffLines(SOLUTION[2], SOLUTION_HIDDEN_COUNTER)
    return { code: SOLUTION_HIDDEN_COUNTER, addedLines, excerpt: false }
  }
  if (part === 4 && d.quota === 'counter') {
    const { addedLines } = diffLines(SOLUTION_HIDDEN_COUNTER, SOLUTION[4])
    return { code: SOLUTION[4], addedLines, excerpt: false }
  }
  return { code: SOLUTION[part], addedLines: solutionAt(part).addedLines, excerpt: false }
}

function notesFor(d: Decisions, parts: PartResult[], finished: boolean): Note[] {
  const notes: Note[] = []
  const reached = (part: PartNumber) => parts[part - 1]!.reached

  notes.push(
    d.clarify
      ? { good: true, text: 'Asked about units and rounding before writing a line.' }
      : {
          good: false,
          text: reached(2)
            ? 'Assumed float dollars for money. Found out in Part 2, in front of me.'
            : 'Assumed float dollars for money and never checked.',
        },
  )

  if (d.shape === 'table') {
    notes.push({
      good: true,
      text: 'Put the rules in data from the start. Each new requirement was mostly a new row.',
    })
  } else if (reshapes(d)) {
    notes.push({
      good: true,
      text: 'Started simple, then reshaped the code when the second requirement showed the pattern, and said so out loud.',
    })
  } else if (d.shape === 'branches') {
    notes.push({
      good: false,
      text: 'Kept patching the if/else chain. Every requirement cost more than the one before.',
    })
  } else {
    notes.push({
      good: false,
      text: 'Built a framework for requirements nobody had stated. Part 1 took a third of the interview.',
    })
  }

  notes.push(
    d.test
      ? {
          good: true,
          text: 'Had a test. When behaviour changed, a failing assertion said exactly where.',
        }
      : { good: false, text: 'No test. Re-verified old behaviour by hand after every change.' },
  )

  if (reached(3)) {
    notes.push(
      d.quota === 'argument'
        ? {
            good: true,
            text: 'Kept the fee function pure. Re-computing last month was just a loop.',
          }
        : {
            good: false,
            text: reached(4)
              ? 'Hid the free-payout count in module state. The re-compute in Part 4 needed surgery first.'
              : 'Hid the free-payout count in module state.',
          },
    )
  }

  const stuck = parts.find((p) => p.reached && !p.completed)
  notes.push(
    finished
      ? {
          good: true,
          text: `Finished all four parts with ${TOTAL_MINUTES - parts[3]!.start - parts[3]!.minutes} minutes left to talk.`,
        }
      : {
          good: false,
          text: `Ran out of time in Part ${stuck?.part ?? 4}, ${stuck ? stuck.minutes - stuck.spent : 0} minutes short.`,
        },
  )
  return notes
}

function verdictFor(d: Decisions, finished: boolean, minutesLeft: number): string {
  if (finished && minutesLeft >= 5) {
    return 'Reads as senior. The code got cheaper to change as the problem got harder, and there was time left for the conversation that decides level.'
  }
  if (finished) {
    return 'Finished, barely. The shape held up, but the shortcuts ate the minutes you wanted for the follow-up questions.'
  }
  if (d.shape === 'classes') {
    return 'Reads as over-built. A framework for requirements that never came, and no time left for the ones that did.'
  }
  if (d.shape === 'branches' && !reshapes(d)) {
    return 'Reads as mid-level. Working code at every step, but each change cost more than the last, and the clock won.'
  }
  return 'The right shape, undone by shortcuts. Each one looked free when you took it, and each sent a bill later. One fewer and you finish.'
}

/** Turn five decisions into the 45-minute timeline they produce. */
export function simulate(decisions: Decisions): Timeline {
  let clock = 0
  let alive = true

  const parts = PARTS.map((part): PartResult => {
    const costs = costsFor(decisions, part)
    const minutes = costs.reduce((sum, c) => sum + c.minutes, 0)
    const start = clock
    const reached = alive
    const completed = reached && start + minutes <= TOTAL_MINUTES
    const spent = !reached ? 0 : completed ? minutes : TOTAL_MINUTES - start
    if (reached) clock = Math.min(TOTAL_MINUTES, start + minutes)
    if (!completed) alive = false
    return {
      part,
      shape: shapeAt(decisions, part),
      costs,
      minutes,
      start,
      reached,
      completed,
      spent,
      diff: diffFor(decisions, part),
      testsBroken: decisions.test ? TESTS_BROKEN[part] : null,
      headline:
        part === 2 && reshapes(decisions)
          ? RESHAPE_HEADLINE
          : HEADLINE[part][shapeAt(decisions, part)],
    }
  })

  const completedParts = parts.filter((p) => p.completed).length
  const finished = completedParts === PARTS.length
  const minutesLeft = TOTAL_MINUTES - clock
  const reworkMinutes = parts
    .filter((p) => p.reached)
    .flatMap((p) => p.costs)
    .filter((c) => c.kind === 'rework')
    .reduce((sum, c) => sum + c.minutes, 0)

  return {
    decisions,
    parts,
    completedParts,
    finished,
    minutesUsed: clock,
    minutesLeft,
    reworkMinutes,
    notes: notesFor(decisions, parts, finished),
    verdict: verdictFor(decisions, finished, minutesLeft),
  }
}

/** Minutes all four parts would need with no clock, for comparing paths. */
export function totalNeeded(decisions: Decisions): number {
  return simulate(decisions).parts.reduce((sum, p) => sum + p.minutes, 0)
}

/** Every combination of the five decisions. */
export function allDecisions(): Decisions[] {
  const out: Decisions[] = []
  for (const shape of ['branches', 'table', 'classes'] as Shape[]) {
    for (const clarify of [true, false]) {
      for (const test of [true, false]) {
        for (const adapt of ['patch', 'refactor'] as Adapt[]) {
          for (const quota of ['counter', 'argument'] as Quota[]) {
            out.push({ shape, clarify, test, adapt, quota })
          }
        }
      }
    }
  }
  return out
}

/** Minutes left as a clock face: 33.5 → "33:30". */
export function clockFace(minutes: number): string {
  const safe = Math.max(0, minutes)
  const whole = Math.floor(safe + 1e-9)
  const seconds = Math.round((safe - whole) * 60)
  if (seconds === 60) return `${String(whole + 1).padStart(2, '0')}:00`
  return `${String(whole).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/* ── the paths compared on the X-Ray ──────────────────────────────────── */

const GOOD_HABITS = { clarify: true, test: true, quota: 'argument' as Quota }

/**
 * The four shapes with identical good habits, so the only thing that differs
 * is the shape of the Part 1 code.
 */
export const CANONICAL: { id: string; name: string; decisions: Decisions }[] = [
  {
    id: 'branches',
    name: 'Hard-coded, patched every time',
    decisions: { ...GOOD_HABITS, shape: 'branches', adapt: 'patch' },
  },
  {
    id: 'reshape',
    name: 'Hard-coded, reshaped at Part 2',
    decisions: { ...GOOD_HABITS, shape: 'branches', adapt: 'refactor' },
  },
  {
    id: 'table',
    name: 'Data table from the start',
    decisions: { ...GOOD_HABITS, shape: 'table', adapt: 'patch' },
  },
  {
    id: 'classes',
    name: 'Class hierarchy + registry',
    decisions: { ...GOOD_HABITS, shape: 'classes', adapt: 'patch' },
  },
]
