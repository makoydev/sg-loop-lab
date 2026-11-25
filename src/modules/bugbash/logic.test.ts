import { describe, expect, it } from 'vitest'
import { PULL_REQUESTS } from './data'
import { lineOf, parseDiff, span, src } from './data/locate'
import {
  bugsAt,
  describeLocation,
  diagnoseFlag,
  explainFalseAlarm,
  flagKey,
  isCleanReview,
  lineText,
  scoreReview,
  toggleFlag,
  validatePr,
  type Flag,
} from './logic'
import type { Bug, PullRequest } from './types'

const pr = (id: string): PullRequest => PULL_REQUESTS.find((p) => p.id === id)!
const refunds = pr('refunds')
const agent = pr('agent')
const cache = pr('cache')

/** A flag on the first line of a bug's first location. */
const hit = (bug: Bug, diagnosis: string | null = bug.category): Flag => ({
  fileId: bug.locations[0]!.fileId,
  line: bug.locations[0]!.lines[0],
  diagnosis,
})

/** A line of `p` that belongs to no bug and is not blank. */
const cleanLine = (p: PullRequest): Flag => {
  for (const file of p.files) {
    const lines = file.code.split('\n')
    for (let n = 1; n <= lines.length; n++) {
      if (lines[n - 1]!.trim() !== '' && bugsAt(p, file.id, n).length === 0) {
        return { fileId: file.id, line: n, diagnosis: null }
      }
    }
  }
  throw new Error('no clean line')
}

describe('authoring helpers', () => {
  const code = src(`
alpha
  beta
alpha gamma
delta
`)

  it('strips the framing newlines of a template literal', () => {
    expect(code.split('\n')).toHaveLength(4)
  })

  it('finds a unique line and refuses a missing or ambiguous snippet', () => {
    expect(lineOf(code, 'beta')).toBe(2)
    expect(() => lineOf(code, 'omega')).toThrow(/not found/)
    expect(() => lineOf(code, 'alpha')).toThrow(/ambiguous/)
  })

  it('builds inclusive ranges, with optional padding', () => {
    expect(span(code, 'beta')).toEqual([2, 2])
    expect(span(code, 'beta', 'delta')).toEqual([2, 4])
    expect(span(code, 'beta', 'gamma', 1)).toEqual([2, 4])
    expect(() => span(code, 'delta', 'beta')).toThrow(/ends before/)
  })

  it('parses a diff hunk into code and add/remove markers', () => {
    const diff = parseDiff(`
  keep()
-   old()
+   fresh()
+
`)
    expect(diff.code).toBe('keep()\n  old()\n  fresh()\n')
    expect(diff.tones).toEqual({ 2: 'del', 3: 'add', 4: 'add' })
  })
})

describe('scenario data is internally consistent', () => {
  it('has three pull requests with the routed ids and ladder ids', () => {
    expect(PULL_REQUESTS.map((p) => p.id)).toEqual(['refunds', 'agent', 'cache'])
    expect(PULL_REQUESTS.map((p) => p.ladderId)).toEqual([
      'bugbash/refunds',
      'bugbash/agent',
      'bugbash/cache',
    ])
  })

  for (const p of PULL_REQUESTS) {
    it(`${p.id}: every location, trace, fix and prompt checks out`, () => {
      expect(validatePr(p)).toEqual([])
    })

    it(`${p.id}: three bugs, each with all three prompt kinds and distinct diagnoses`, () => {
      expect(p.bugs).toHaveLength(3)
      expect(new Set(p.bugs.map((b) => b.category)).size).toBe(3)
      expect(p.flagBudget).toBe(p.bugs.length + 2)
      for (const bug of p.bugs) expect(bug.prompts).toHaveLength(3)
    })

    it(`${p.id}: the scoped prompt is a smaller diff and a lighter review than the rewrite`, () => {
      for (const bug of p.bugs) {
        const scoped = bug.prompts.find((x) => x.kind === 'scoped')!.outcome
        const delegate = bug.prompts.find((x) => x.kind === 'delegate')!.outcome
        expect(scoped.added + scoped.removed).toBeLessThan(delegate.added + delegate.removed)
        expect(scoped.reviewMinutes).toBeLessThan(delegate.reviewMinutes)
        expect(scoped.reviewMinutes).toBeLessThanOrEqual(10)
        // The delegated rewrite is always the most expensive thing to review.
        for (const other of bug.prompts) {
          expect(other.outcome.reviewMinutes).toBeLessThanOrEqual(delegate.reviewMinutes)
        }
      }
    })

    it(`${p.id}: the fixed run always ends better than the broken one`, () => {
      for (const bug of p.bugs) {
        expect(bug.trace.broken.at(-1)!.tone).toBe('bad')
        expect(bug.trace.fixed.at(-1)!.tone).toBe('ok')
      }
    })
  }

  it('keeps the code free of giveaway words', () => {
    for (const p of PULL_REQUESTS) {
      for (const file of p.files) {
        expect(file.code).not.toMatch(/\b(bug|todo|fixme|hack|xxx|race|leak|inject)/i)
      }
    }
  })

  it('unescapes template literals inside the embedded code', () => {
    const handler = refunds.files.find((f) => f.id === 'handler')!.code
    expect(handler).toContain('const cacheKey = `refund:${req.merchantId}:${key}`')
    expect(cache.files[0]!.code).toContain('return `${lat},${lng}`')
    expect(agent.files.find((f) => f.id === 'agent')!.code).toContain('"\\n\\n".join(')
    for (const p of PULL_REQUESTS) {
      for (const file of p.files) expect(file.code).not.toContain('\\$')
    }
  })
})

describe('the claims the traces make are true', () => {
  it('19.99 × 100 floors to 1998 in IEEE-754', () => {
    expect(19.99 * 100).toBe(1998.9999999999998)
    expect(Math.floor(19.99 * 100)).toBe(1998)
    expect(Math.floor(12.5 * 100)).toBe(1250)
  })

  it('about one two-decimal amount in twenty is floored a cent short', () => {
    let short = 0
    for (let cents = 1; cents <= 9_999; cents++) {
      if (Math.floor((cents / 100) * 100) !== cents) short++
    }
    const share = short / 9_999
    expect(share).toBeGreaterThan(0.04)
    expect(share).toBeLessThan(0.07)
  })

  it('the heap model in the cache scenario adds up', () => {
    const perPod = 9_000 / 30
    const secondsToFill = (1.5 * 1_000_000) / perPod // 1.5 GB at about 1 KB an entry
    expect(perPod).toBe(300)
    expect(Math.round(secondsToFill / 60)).toBe(83)
  })
})

describe('scoreReview', () => {
  it('scores an empty review as everything missed', () => {
    const r = scoreReview(refunds, [])
    expect(r.found).toBe(0)
    expect(r.missed).toBe(3)
    expect(r.allFound).toBe(false)
    expect(r.falseAlarms).toEqual([])
  })

  it('credits a correctly diagnosed flag on any line of any location', () => {
    for (const p of PULL_REQUESTS) {
      for (const bug of p.bugs) {
        for (const loc of bug.locations) {
          for (let line = loc.lines[0]; line <= loc.lines[1]; line++) {
            const r = scoreReview(p, [{ fileId: loc.fileId, line, diagnosis: bug.category }])
            const finding = r.findings.find((f) => f.bug.id === bug.id)!
            expect(finding.status).toBe('diagnosed')
            expect(r.falseAlarms).toEqual([])
          }
        }
      }
    }
  })

  it('a perfect review finds and diagnoses everything', () => {
    for (const p of PULL_REQUESTS) {
      const r = scoreReview(p, p.bugs.map((b) => hit(b)))
      expect(r.allFound).toBe(true)
      expect(r.diagnosed).toBe(3)
      expect(isCleanReview(r, 0)).toBe(true)
    }
  })

  it('right line with the wrong or no diagnosis is spotted, not diagnosed', () => {
    const [race] = refunds.bugs
    expect(scoreReview(refunds, [hit(race!, 'Resource leak')]).findings[0]!.status).toBe('spotted')
    expect(scoreReview(refunds, [hit(race!, null)]).findings[0]!.status).toBe('spotted')
  })

  it('a flag on a line that belongs to no bug is a false alarm with a reason', () => {
    const r = scoreReview(refunds, [cleanLine(refunds)])
    expect(r.found).toBe(0)
    expect(r.falseAlarms).toHaveLength(1)
    expect(r.falseAlarms[0]!.why.length).toBeGreaterThan(20)
  })

  it('several flags on one bug count once and are not false alarms', () => {
    const [race] = refunds.bugs
    const [a, b] = race!.locations[0]!.lines
    const flags: Flag[] = [
      { fileId: 'handler', line: a, diagnosis: 'Race condition' },
      { fileId: 'handler', line: b, diagnosis: null },
    ]
    const r = scoreReview(refunds, flags)
    expect(r.found).toBe(1)
    expect(r.findings[0]!.status).toBe('diagnosed')
    expect(r.falseAlarms).toEqual([])
  })

  it('a later correct diagnosis upgrades a bug from spotted to diagnosed', () => {
    const [race] = refunds.bugs
    const [a, b] = race!.locations[0]!.lines
    const r = scoreReview(refunds, [
      { fileId: 'handler', line: a, diagnosis: 'Swallowed error' },
      { fileId: 'handler', line: b, diagnosis: 'Race condition' },
    ])
    expect(r.findings[0]!.status).toBe('diagnosed')
    expect(r.findings[0]!.flag!.line).toBe(b)
  })

  describe('overlapping locations', () => {
    const injection = agent.bugs.find((b) => b.id === 'agent-injection')!
    const retry = agent.bugs.find((b) => b.id === 'agent-retry')!
    const file = agent.files.find((f) => f.id === 'agent')!
    const shared = lineOf(file.code, 'return payments.refund(')

    it('the refund call belongs to both the injection path and the retry loop', () => {
      expect(bugsAt(agent, 'agent', shared).map((b) => b.id)).toEqual([injection.id, retry.id])
    })

    it('credits the bug the diagnosis names', () => {
      const asRetry = scoreReview(agent, [
        { fileId: 'agent', line: shared, diagnosis: retry.category },
      ])
      expect(asRetry.findings.find((f) => f.bug.id === retry.id)!.status).toBe('diagnosed')
      expect(asRetry.findings.find((f) => f.bug.id === injection.id)!.status).toBe('missed')

      const asInjection = scoreReview(agent, [
        { fileId: 'agent', line: shared, diagnosis: injection.category },
      ])
      expect(asInjection.findings.find((f) => f.bug.id === injection.id)!.status).toBe('diagnosed')
      expect(asInjection.findings.find((f) => f.bug.id === retry.id)!.status).toBe('missed')
    })

    it('an unnamed flag goes to the first bug on that line that is still open', () => {
      const r = scoreReview(agent, [
        hit(injection),
        { fileId: 'agent', line: shared, diagnosis: null },
      ])
      expect(r.findings.find((f) => f.bug.id === injection.id)!.status).toBe('diagnosed')
      expect(r.findings.find((f) => f.bug.id === retry.id)!.status).toBe('spotted')
    })

    it('one line can never earn two findings', () => {
      const r = scoreReview(agent, [{ fileId: 'agent', line: shared, diagnosis: null }])
      expect(r.found).toBe(1)
    })
  })

  it('isCleanReview needs everything found and at most one false alarm overall', () => {
    const all = scoreReview(cache, cache.bugs.map((b) => hit(b)))
    expect(isCleanReview(all, 1)).toBe(true)
    expect(isCleanReview(all, 2)).toBe(false)
    const partial = scoreReview(cache, [hit(cache.bugs[0]!)])
    expect(isCleanReview(partial, 0)).toBe(false)
  })
})

describe('false alarms are explained', () => {
  it('uses the decoy reason when the line is a known red herring', () => {
    for (const p of PULL_REQUESTS) {
      for (const decoy of p.decoys) {
        const why = explainFalseAlarm(p, {
          fileId: decoy.fileId,
          line: decoy.lines[0],
          diagnosis: null,
        })
        expect(why).toBe(decoy.why)
      }
    }
  })

  it('falls back to a generic reason elsewhere', () => {
    const why = explainFalseAlarm(refunds, { fileId: 'handler', line: 1, diagnosis: null })
    expect(why).toMatch(/Nothing on this line/)
  })

  it('covers most reviewable lines with a bug or a specific reason', () => {
    for (const p of PULL_REQUESTS) {
      let reviewable = 0
      let covered = 0
      for (const file of p.files) {
        file.code.split('\n').forEach((text, i) => {
          const t = text.trim()
          const trivial =
            t === '' ||
            /^[\])}]+[,;]?$/.test(t) ||
            t.startsWith('import ') ||
            t.startsWith('from ') ||
            t.startsWith('/**') ||
            t.startsWith('@')
          if (trivial) return
          reviewable++
          const line = i + 1
          const isDecoy = p.decoys.some(
            (d) => d.fileId === file.id && line >= d.lines[0] && line <= d.lines[1],
          )
          if (isDecoy || bugsAt(p, file.id, line).length > 0) covered++
        })
      }
      expect(covered / reviewable).toBeGreaterThan(0.7)
    }
  })
})

describe('flag bookkeeping', () => {
  it('adds, removes and respects the budget', () => {
    let flags: Flag[] = []
    flags = toggleFlag(flags, 'handler', 10, 2)
    flags = toggleFlag(flags, 'handler', 11, 2)
    expect(flags.map(flagKey)).toEqual(['handler:10', 'handler:11'])
    expect(toggleFlag(flags, 'handler', 12, 2)).toBe(flags)
    flags = toggleFlag(flags, 'handler', 10, 2)
    expect(flags.map(flagKey)).toEqual(['handler:11'])
  })

  it('sets a diagnosis on one flag only', () => {
    const flags = toggleFlag(toggleFlag([], 'a', 1, 5), 'a', 2, 5)
    const next = diagnoseFlag(flags, 'a:2', 'Race condition')
    expect(next.map((f) => f.diagnosis)).toEqual([null, 'Race condition'])
  })

  it('reads line text and describes locations in words', () => {
    expect(lineText(refunds, 'money', 1)).toContain('Minor units')
    expect(lineText(refunds, 'money', 999)).toBe('')
    const option = refunds.bugs.find((b) => b.id === 'refunds-option')!
    expect(describeLocation(refunds, option)).toMatch(/^handler\.ts, lines \d+ and \d+$/)
    expect(describeLocation(cache, cache.bugs[0]!)).toMatch(/^nearbyCache\.ts, lines \d+ to \d+$/)
    // several ranges in one file are listed in line order, and files are kept apart
    const injection = agent.bugs.find((b) => b.id === 'agent-injection')!
    const where = describeLocation(agent, injection)
    expect(where).toMatch(/^agent\.py, lines \d+ to \d+, \d+ to \d+, \d+ to \d+ and \d+ to \d+$/)
    const starts = [...where.matchAll(/(\d+) to/g)].map((m) => Number(m[1]))
    expect(starts).toEqual([...starts].sort((a, b) => a - b))
    const float = refunds.bugs.find((b) => b.id === 'refunds-float')!
    expect(describeLocation(refunds, float)).toMatch(/^money\.ts, lines \d+ to \d+ · handler\.ts, lines \d+ and \d+$/)
  })
})
