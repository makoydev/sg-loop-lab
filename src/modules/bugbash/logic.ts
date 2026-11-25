import type { Bug, PullRequest } from './types'

/*
 * Scoring a code review.
 *
 * A reviewer places flags on lines and gives each flag a diagnosis. A bug is
 * "diagnosed" when a flag lands inside one of its locations with the right
 * diagnosis, "spotted" when the line is right and the diagnosis is not, and
 * "missed" otherwise. Flags on lines that belong to no bug are false alarms.
 * Everything here is pure, so the rules are unit-tested.
 */

export type Flag = {
  fileId: string
  /** 1-based line number. */
  line: number
  /** Chosen diagnosis, or `null` if the reviewer left it unnamed. */
  diagnosis: string | null
}

export type FindingStatus = 'diagnosed' | 'spotted' | 'missed'

export type Finding = {
  bug: Bug
  status: FindingStatus
  /** The flag that earned the finding. */
  flag?: Flag
}

export type FalseAlarm = { flag: Flag; why: string }

export type ReviewResult = {
  /** One finding per bug, in the PR's bug order. */
  findings: Finding[]
  falseAlarms: FalseAlarm[]
  found: number
  diagnosed: number
  missed: number
  allFound: boolean
}

export function flagKey(flag: { fileId: string; line: number }): string {
  return `${flag.fileId}:${flag.line}`
}

/** Every bug with a location covering this line (locations may overlap). */
export function bugsAt(pr: PullRequest, fileId: string, line: number): Bug[] {
  return pr.bugs.filter((bug) =>
    bug.locations.some(
      (loc) => loc.fileId === fileId && line >= loc.lines[0] && line <= loc.lines[1],
    ),
  )
}

const GENERIC_FALSE_ALARM =
  'Nothing on this line changes what the code does in a way that matters here. In the room, a flag you cannot defend costs more than a flag you did not place.'

/** Why a line that is not part of any bug is fine. */
export function explainFalseAlarm(pr: PullRequest, flag: Flag): string {
  const decoy = pr.decoys.find(
    (d) => d.fileId === flag.fileId && flag.line >= d.lines[0] && flag.line <= d.lines[1],
  )
  return decoy?.why ?? GENERIC_FALSE_ALARM
}

/**
 * Score a set of flags against a PR.
 *
 * Where locations overlap, a flag is credited to the bug its diagnosis names.
 * Failing that it goes to the first bug on that line not yet found. A flag on
 * a bug that is already found is neither a new finding nor a false alarm.
 */
export function scoreReview(pr: PullRequest, flags: Flag[]): ReviewResult {
  const status = new Map<string, { status: FindingStatus; flag: Flag }>()
  const falseAlarms: FalseAlarm[] = []
  const pending: { flag: Flag; candidates: Bug[] }[] = []

  for (const flag of flags) {
    const candidates = bugsAt(pr, flag.fileId, flag.line)
    if (candidates.length === 0) {
      falseAlarms.push({ flag, why: explainFalseAlarm(pr, flag) })
      continue
    }
    const named = candidates.find((bug) => bug.category === flag.diagnosis)
    if (named) {
      if (status.get(named.id)?.status !== 'diagnosed') {
        status.set(named.id, { status: 'diagnosed', flag })
      }
    } else {
      pending.push({ flag, candidates })
    }
  }

  for (const { flag, candidates } of pending) {
    const open = candidates.find((bug) => !status.has(bug.id))
    if (open) status.set(open.id, { status: 'spotted', flag })
  }

  const findings: Finding[] = pr.bugs.map((bug) => {
    const hit = status.get(bug.id)
    return hit ? { bug, status: hit.status, flag: hit.flag } : { bug, status: 'missed' }
  })
  const found = findings.filter((f) => f.status !== 'missed').length
  const diagnosed = findings.filter((f) => f.status === 'diagnosed').length

  return {
    findings,
    falseAlarms,
    found,
    diagnosed,
    missed: findings.length - found,
    allFound: found === findings.length,
  }
}

/** A clean review: everything found, with at most one false alarm in total. */
export function isCleanReview(result: ReviewResult, totalFalseAlarms: number): boolean {
  return result.allFound && totalFalseAlarms <= 1
}

/** Add a flag, or remove it if the line is already flagged. Respects the budget. */
export function toggleFlag(
  flags: Flag[],
  fileId: string,
  line: number,
  budget: number,
): Flag[] {
  const key = flagKey({ fileId, line })
  if (flags.some((f) => flagKey(f) === key)) return flags.filter((f) => flagKey(f) !== key)
  if (flags.length >= budget) return flags
  return [...flags, { fileId, line, diagnosis: null }]
}

/** Set the diagnosis on one flag. */
export function diagnoseFlag(flags: Flag[], key: string, diagnosis: string | null): Flag[] {
  return flags.map((f) => (flagKey(f) === key ? { ...f, diagnosis } : f))
}

/** Text of a line of a file, or an empty string if it does not exist. */
export function lineText(pr: PullRequest, fileId: string, line: number): string {
  const file = pr.files.find((f) => f.id === fileId)
  return file?.code.split('\n')[line - 1] ?? ''
}

/**
 * Where a bug lives, in words: "handler.ts, lines 28 to 32 and 45". Locations
 * are grouped by file and listed in line order.
 */
export function describeLocation(pr: PullRequest, bug: Bug): string {
  const byFile = new Map<string, [number, number][]>()
  for (const loc of bug.locations) {
    const ranges = byFile.get(loc.fileId) ?? []
    ranges.push(loc.lines)
    byFile.set(loc.fileId, ranges)
  }
  return [...byFile.entries()]
    .map(([fileId, ranges]) => {
      const file = pr.files.find((f) => f.id === fileId)
      const name = file?.path.split('/').pop() ?? fileId
      const parts = [...ranges]
        .sort((x, y) => x[0] - y[0])
        .map(([a, b]) => (a === b ? `${a}` : `${a} to ${b}`))
      const single = ranges.length === 1 && ranges[0]![0] === ranges[0]![1]
      const list =
        parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]
      return `${name}, ${single ? 'line' : 'lines'} ${list}`
    })
    .join(' · ')
}

/* ── data integrity ───────────────────────────────────────────────────── */

const MAX_TRACE_LABEL = 34
const MAX_CODE_WIDTH = 88

/**
 * Problems in a scenario's data. An empty list means the scenario is internally
 * consistent: every location points at real lines, every trace step uses a real
 * lane, labels fit on the diagram, and so on. Run by the tests for every PR.
 */
export function validatePr(pr: PullRequest): string[] {
  const problems: string[] = []
  const fileLines = new Map(pr.files.map((f) => [f.id, f.code.split('\n')]))

  const dupes = (ids: string[]) => ids.filter((id, i) => ids.indexOf(id) !== i)
  for (const id of dupes(pr.files.map((f) => f.id))) problems.push(`duplicate file id ${id}`)
  for (const id of dupes(pr.bugs.map((b) => b.id))) problems.push(`duplicate bug id ${id}`)
  for (const c of dupes(pr.categories)) problems.push(`duplicate category ${c}`)

  if (pr.flagBudget < pr.bugs.length) problems.push('flag budget is smaller than the bug count')

  for (const file of pr.files) {
    file.code.split('\n').forEach((line, i) => {
      if (line.includes('\t')) problems.push(`${file.path}:${i + 1} contains a tab`)
      if (line.length > MAX_CODE_WIDTH) problems.push(`${file.path}:${i + 1} is ${line.length} wide`)
    })
  }

  const checkLocation = (label: string, fileId: string, [a, b]: [number, number]) => {
    const lines = fileLines.get(fileId)
    if (!lines) {
      problems.push(`${label}: unknown file ${fileId}`)
      return
    }
    if (a < 1 || b > lines.length || a > b) {
      problems.push(`${label}: lines ${a}-${b} are outside ${fileId} (1-${lines.length})`)
      return
    }
    if (lines.slice(a - 1, b).every((l) => l.trim() === '')) {
      problems.push(`${label}: lines ${a}-${b} of ${fileId} are blank`)
    }
  }

  for (const bug of pr.bugs) {
    if (!pr.categories.includes(bug.category)) {
      problems.push(`${bug.id}: category "${bug.category}" is not offered as a diagnosis`)
    }
    if (bug.locations.length === 0) problems.push(`${bug.id}: no locations`)
    bug.locations.forEach((loc) => checkLocation(bug.id, loc.fileId, loc.lines))

    const lanes = new Set(bug.trace.lanes.map((l) => l.id))
    if (lanes.size !== bug.trace.lanes.length) problems.push(`${bug.id}: duplicate lane id`)
    for (const [name, steps] of [
      ['broken', bug.trace.broken],
      ['fixed', bug.trace.fixed],
    ] as const) {
      if (steps.length < 3) problems.push(`${bug.id}: ${name} trace is too short`)
      steps.forEach((step, i) => {
        if (!lanes.has(step.from)) problems.push(`${bug.id}: ${name}[${i}] from "${step.from}"`)
        if (step.to && !lanes.has(step.to)) problems.push(`${bug.id}: ${name}[${i}] to "${step.to}"`)
        if (step.label.length > MAX_TRACE_LABEL) {
          problems.push(`${bug.id}: ${name}[${i}] label is ${step.label.length} chars`)
        }
        if (!step.detail) problems.push(`${bug.id}: ${name}[${i}] has no detail`)
      })
    }
    if (!bug.trace.broken.some((s) => s.tone === 'bad')) {
      problems.push(`${bug.id}: broken trace never shows damage`)
    }
    if (bug.trace.fixed.some((s) => s.tone === 'bad' && !s.dashed)) {
      problems.push(`${bug.id}: fixed trace still shows undashed damage`)
    }

    const diffLines = bug.fix.code.split('\n').length
    const toneLines = Object.keys(bug.fix.tones).map(Number)
    if (toneLines.some((n) => n < 1 || n > diffLines)) problems.push(`${bug.id}: fix tone out of range`)
    if (!Object.values(bug.fix.tones).includes('add')) problems.push(`${bug.id}: fix adds nothing`)

    const kinds = bug.prompts.map((p) => p.kind).sort().join(',')
    if (kinds !== 'delegate,scoped,vague') problems.push(`${bug.id}: prompts are ${kinds}`)
    const scoped = bug.prompts.find((p) => p.kind === 'scoped')
    if (scoped && scoped.outcome.verdict !== 'strong') problems.push(`${bug.id}: scoped is not strong`)
    for (const p of bug.prompts) {
      if (p.kind !== 'scoped' && p.outcome.verdict === 'strong') {
        problems.push(`${bug.id}: ${p.kind} prompt is marked strong`)
      }
    }
  }

  pr.decoys.forEach((decoy, i) => {
    checkLocation(`decoy ${i}`, decoy.fileId, decoy.lines)
    for (let line = decoy.lines[0]; line <= decoy.lines[1]; line++) {
      if (bugsAt(pr, decoy.fileId, line).length > 0) {
        problems.push(`decoy ${i} overlaps a bug at ${decoy.fileId}:${line}`)
      }
    }
  })

  return problems
}
