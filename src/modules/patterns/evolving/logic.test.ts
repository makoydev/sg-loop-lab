import { describe, expect, it } from 'vitest'
import { EXCERPT, QUOTA_SNIPPET, shapeSnippet, SOLUTION } from './code'
import {
  allDecisions,
  CANONICAL,
  clockFace,
  codeAt,
  diffLines,
  PARTS,
  shapeAt,
  simulate,
  solutionAt,
  TOTAL_MINUTES,
  totalNeeded,
  type Decisions,
} from './logic'

const best: Decisions = {
  shape: 'table',
  clarify: true,
  test: true,
  adapt: 'patch',
  quota: 'argument',
}

describe('the three shapes', () => {
  it('data table with good habits finishes all four parts with time to talk', () => {
    const t = simulate(best)
    expect(t.finished).toBe(true)
    expect(t.completedParts).toBe(4)
    expect(t.minutesUsed).toBe(35)
    expect(t.minutesLeft).toBe(10)
    expect(t.reworkMinutes).toBe(0)
  })

  it('the hard-coded path never finishes if you keep patching, whatever else you do', () => {
    const paths = allDecisions().filter((d) => d.shape === 'branches' && d.adapt === 'patch')
    expect(paths).toHaveLength(8)
    for (const d of paths) {
      const t = simulate(d)
      expect(t.finished).toBe(false)
      expect(t.completedParts).toBeLessThan(4)
    }
  })

  it('the over-engineered path never finishes either: it loses on up-front cost', () => {
    const paths = allDecisions().filter((d) => d.shape === 'classes')
    for (const d of paths) expect(simulate(d).finished).toBe(false)
    // Even with perfect habits, Part 1 alone takes 19 of the 45 minutes.
    const t = simulate({ ...best, shape: 'classes' })
    expect(t.parts[0]!.minutes).toBe(19)
    expect(t.completedParts).toBe(3)
  })

  it('hard-coding Part 1 is survivable if you reshape when the pattern shows', () => {
    const t = simulate({ ...best, shape: 'branches', adapt: 'refactor' })
    expect(t.finished).toBe(true)
    expect(t.minutesLeft).toBe(6)
    expect(PARTS.map((p) => shapeAt(t.decisions, p))).toEqual([
      'branches',
      'table',
      'table',
      'table',
    ])
  })

  it('starting with the table still beats reshaping into it', () => {
    expect(totalNeeded(best)).toBeLessThan(
      totalNeeded({ ...best, shape: 'branches', adapt: 'refactor' }),
    )
  })

  it('each twist costs the hard-coded shape more than the last', () => {
    const minutes = simulate({ ...best, shape: 'branches' }).parts.map((p) => p.minutes)
    // Part 1 includes the question and the test, so compare the twists.
    expect(minutes[2]!).toBeGreaterThan(minutes[1]!)
    expect(minutes[3]!).toBeGreaterThanOrEqual(minutes[2]!)
  })
})

describe('the habits', () => {
  const flip = (d: Decisions, patch: Partial<Decisions>) => ({ ...d, ...patch })

  it('asking the clarifying question is net positive on every path', () => {
    for (const d of allDecisions().filter((x) => x.clarify)) {
      expect(totalNeeded(d)).toBeLessThan(totalNeeded(flip(d, { clarify: false })))
    }
  })

  it('writing the test is net positive on every path', () => {
    for (const d of allDecisions().filter((x) => x.test)) {
      expect(totalNeeded(d)).toBeLessThan(totalNeeded(flip(d, { test: false })))
    }
  })

  it('keeping the function pure is net positive on every path', () => {
    for (const d of allDecisions().filter((x) => x.quota === 'argument')) {
      expect(totalNeeded(d)).toBeLessThan(totalNeeded(flip(d, { quota: 'counter' })))
    }
  })

  it('the right shape survives one or two shortcuts, but not all three', () => {
    const table = (patch: Partial<Decisions>) => simulate({ ...best, ...patch })
    expect(table({ clarify: false }).finished).toBe(true)
    expect(table({ test: false }).finished).toBe(true)
    expect(table({ quota: 'counter' }).finished).toBe(true)
    expect(table({ test: false, quota: 'counter' }).minutesLeft).toBe(1)
    const all = table({ clarify: false, test: false, quota: 'counter' })
    expect(all.finished).toBe(false)
    expect(all.completedParts).toBe(3)
    expect(all.reworkMinutes).toBeGreaterThan(0)
  })

  it('rework shows up after the shortcut, not when it was taken', () => {
    const t = simulate({ ...best, clarify: false, test: false, quota: 'counter' })
    const rework = t.parts.map((p) => p.costs.filter((c) => c.kind === 'rework').length)
    expect(rework[0]).toBe(0)
    expect(rework[1]).toBe(2) // floats, and no test
    expect(rework[3]).toBe(2) // hidden state, and no test
  })
})

describe('timeline invariants, over all 48 combinations', () => {
  const all = allDecisions()

  it('enumerates every combination once', () => {
    expect(all).toHaveLength(48)
    expect(new Set(all.map((d) => JSON.stringify(d))).size).toBe(48)
  })

  it('a finished run never uses more than 45 minutes', () => {
    for (const d of all) {
      const t = simulate(d)
      expect(t.minutesUsed).toBeLessThanOrEqual(TOTAL_MINUTES)
      expect(t.minutesUsed + t.minutesLeft).toBe(TOTAL_MINUTES)
      if (t.finished) {
        expect(t.completedParts).toBe(4)
        expect(totalNeeded(d)).toBe(t.minutesUsed)
      } else {
        expect(t.minutesUsed).toBe(TOTAL_MINUTES)
        expect(t.minutesLeft).toBe(0)
        expect(totalNeeded(d)).toBeGreaterThan(TOTAL_MINUTES)
      }
    }
  })

  it('parts are contiguous, and nothing is reached after the clock runs out', () => {
    for (const d of all) {
      const { parts } = simulate(d)
      let clock = 0
      let alive = true
      for (const p of parts) {
        expect(p.reached).toBe(alive)
        if (!p.reached) {
          expect(p.spent).toBe(0)
          expect(p.completed).toBe(false)
          continue
        }
        expect(p.start).toBe(clock)
        expect(p.minutes).toBe(p.costs.reduce((sum, c) => sum + c.minutes, 0))
        expect(p.costs.every((c) => c.minutes > 0)).toBe(true)
        expect(p.spent).toBe(p.completed ? p.minutes : TOTAL_MINUTES - p.start)
        expect(p.spent).toBeGreaterThanOrEqual(0)
        clock += p.spent
        if (!p.completed) alive = false
      }
    }
  })

  it('is deterministic and does not mutate its input', () => {
    for (const d of all) {
      const frozen = structuredClone(d)
      expect(simulate(d)).toEqual(simulate(d))
      expect(d).toEqual(frozen)
    }
  })

  it('every run produces notes and a verdict, and the notes match the outcome', () => {
    for (const d of all) {
      const t = simulate(d)
      expect(t.notes.length).toBeGreaterThanOrEqual(4)
      expect(t.verdict.length).toBeGreaterThan(20)
      expect(t.notes.at(-1)!.good).toBe(t.finished)
      for (const note of t.notes) expect(note.text).not.toMatch(/—/)
    }
  })

  it('tests only break when there are tests', () => {
    for (const d of all) {
      for (const p of simulate(d).parts) {
        if (d.test) expect(p.testsBroken).not.toBeNull()
        else expect(p.testsBroken).toBeNull()
      }
    }
  })
})

describe('the canonical paths on the X-Ray', () => {
  it('differ only in shape', () => {
    for (const path of CANONICAL) {
      expect(path.decisions.clarify).toBe(true)
      expect(path.decisions.test).toBe(true)
      expect(path.decisions.quota).toBe('argument')
    }
  })

  it('finish exactly as the lab says', () => {
    const result = Object.fromEntries(
      CANONICAL.map((p) => [p.id, simulate(p.decisions).finished]),
    )
    expect(result).toEqual({ branches: false, reshape: true, table: true, classes: false })
  })
})

describe('diffs on the real solution', () => {
  it('counts kept, changed and added lines', () => {
    const d = diffLines('a\nb\nc', 'a\nB\nc\nd')
    expect(d).toEqual({ kept: 2, changed: 1, added: 1, addedLines: [2, 4] })
  })

  it('ignores blank lines and handles repeated lines as a multiset', () => {
    expect(diffLines('x\n\nx', 'x\nx\n\nx').addedLines).toEqual([4])
    expect(diffLines('', 'a\n\nb')).toEqual({ kept: 0, changed: 0, added: 2, addedLines: [1, 3] })
  })

  it('Part 1 of the solution is all new, and later parts mostly keep what was there', () => {
    const first = solutionAt(1)
    expect(first.diff.kept).toBe(0)
    expect(first.addedLines.length).toBe(first.diff.added)
    for (const part of [2, 3, 4] as const) {
      const { diff, addedLines, code } = solutionAt(part)
      const lines = code.split('\n')
      expect(addedLines.every((n) => n >= 1 && n <= lines.length)).toBe(true)
      expect(addedLines.every((n) => lines[n - 1]!.trim() !== '')).toBe(true)
      expect(addedLines.length).toBe(diff.changed + diff.added)
      if (part > 2) expect(diff.kept).toBeGreaterThan(diff.changed)
    }
  })

  it('the table shape reports the diff of the code it actually shows', () => {
    const t = simulate(best)
    for (const p of t.parts) expect(p.diff).toEqual(solutionAt(p.part).diff)
  })

  it('hiding the counter makes Part 4 touch more lines than keeping it pure', () => {
    const pure = simulate(best).parts[3]!.diff
    const hidden = simulate({ ...best, quota: 'counter' }).parts[3]!.diff
    expect(hidden.changed).toBeGreaterThan(pure.changed)
  })

  it('the hard-coded shape rewrites more than it keeps by Part 3', () => {
    const d = simulate({ ...best, shape: 'branches' }).parts[2]!.diff
    expect(d.changed).toBeGreaterThan(d.kept)
  })
})

describe('the code shown', () => {
  it('uses integer cents once the units are known, and floats before', () => {
    for (const shape of ['branches', 'table', 'classes'] as const) {
      expect(shapeSnippet(shape, true)).toMatch(/\b150\b/)
      expect(shapeSnippet(shape, true)).not.toMatch(/\d\.\d/)
      expect(shapeSnippet(shape, false)).toMatch(/1\.50/)
    }
  })

  it('the solution never uses a float literal', () => {
    for (const part of PARTS) expect(SOLUTION[part]).not.toMatch(/\d\.\d/)
  })

  it('has an excerpt for every twist of the shapes that fight the change', () => {
    for (const shape of ['branches', 'classes'] as const) {
      for (const part of [2, 3, 4] as const) {
        expect(EXCERPT[shape][part].split('\n').length).toBeGreaterThan(5)
      }
    }
    expect(QUOTA_SNIPPET.counter).toContain('USED[merchant] += 1')
    expect(QUOTA_SNIPPET.argument).toContain('used')
  })
})

describe('codeAt: the code on the path you chose', () => {
  it('shows a real, non-empty snippet for every part of every path', () => {
    for (const d of allDecisions()) {
      for (const part of PARTS) {
        const view = codeAt(d, part)
        const lines = view.code.split('\n')
        expect(lines.length).toBeGreaterThan(3)
        expect(view.addedLines.every((n) => n >= 1 && n <= lines.length)).toBe(true)
      }
    }
  })

  it('shows floats in Part 1 only when the candidate did not ask about units', () => {
    expect(codeAt({ ...best, clarify: false }, 1).code).toMatch(/0\.50/)
    expect(codeAt(best, 1).code).not.toMatch(/0\.50/)
  })

  it('shows the whole solution on the table shape and an excerpt on the others', () => {
    expect(codeAt(best, 3)).toEqual({ ...codeAt(best, 3), code: SOLUTION[3], excerpt: false })
    expect(codeAt({ ...best, shape: 'branches' }, 3).excerpt).toBe(true)
    expect(codeAt({ ...best, shape: 'classes' }, 4).excerpt).toBe(true)
    // Reshaped at Part 2: from then on it is the table solution.
    const reshaped: Decisions = { ...best, shape: 'branches', adapt: 'refactor' }
    expect(codeAt(reshaped, 2).code).toBe(SOLUTION[2])
    expect(codeAt(reshaped, 4).code).toBe(SOLUTION[4])
  })

  it('shows the hidden counter in Part 3 when that is what was chosen', () => {
    expect(codeAt({ ...best, quota: 'counter' }, 3).code).toContain('USED = Counter()')
    expect(codeAt(best, 3).code).not.toContain('USED = Counter()')
  })
})

describe('clockFace', () => {
  it('formats minutes as mm:ss', () => {
    expect(clockFace(45)).toBe('45:00')
    expect(clockFace(33.5)).toBe('33:30')
    expect(clockFace(0)).toBe('00:00')
    expect(clockFace(-2)).toBe('00:00')
    expect(clockFace(9.999999)).toBe('10:00')
  })
})
