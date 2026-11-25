import { describe, expect, it } from 'vitest'
import { CPMAI_PHASES, IMDA } from '@/lib/facts'
import { CPMAI_MOVES, PHRASES } from './content/map'
import { QUESTIONS, strongest } from './content/mixer'
import { CV_ORDER, LINE_INFO, OPENING_LINES, REFERENCE_ORDER } from './content/opening'
import {
  countWords,
  levelPosition,
  lineEffect,
  OPENING_BUDGET_SECONDS,
  parseMarked,
  readLevel,
  readOpening,
  seededOrder,
  SEGMENT_ORDER,
  sides,
  SIGNAL_CODES,
  SIGNAL_ORDER,
  SIGNALS,
  speakingSeconds,
  tally,
  type Annotated,
  type VariantKind,
} from './logic'

/* ── helpers ──────────────────────────────────────────────────────────── */

/** Every span sits where it claims to, and no markup leaked into the text. */
function expectWellFormed(a: Annotated, where: string) {
  expect(a.text, where).not.toMatch(/[{}]/)
  expect(a.text.trim().length, where).toBeGreaterThan(0)
  for (const span of a.spans) {
    expect(a.text.slice(span.start, span.end), `${where}: "${span.text}"`).toBe(span.text)
    expect(a.text.includes(span.text), `${where}: "${span.text}"`).toBe(true)
  }
  expect(a.pieces.map((p) => p.text).join(''), where).toBe(a.text)
}

const engineering = (a: Annotated) => sides(tally([a])).engineering
const delivery = (a: Annotated) => sides(tally([a])).delivery

/** All ordered selections (any length, no repeats) of `ids`. */
function* orderedSubsets(ids: string[], prefix: string[] = []): Generator<string[]> {
  yield prefix
  for (const id of ids) {
    if (!prefix.includes(id)) yield* orderedSubsets(ids, [...prefix, id])
  }
}

/* ── signal anatomy ───────────────────────────────────────────────────── */

describe('parseMarked', () => {
  it('leaves unmarked text alone', () => {
    const a = parseMarked('Nothing to see here.')
    expect(a.text).toBe('Nothing to see here.')
    expect(a.spans).toEqual([])
    expect(a.pieces).toEqual([{ text: 'Nothing to see here.' }])
  })

  it('strips the markup and records each span with its offsets', () => {
    const a = parseMarked('{d:I said no} to {n:5% of merchants}, behind a {m:flag}.')
    expect(a.text).toBe('I said no to 5% of merchants, behind a flag.')
    expect(a.spans.map((s) => [s.kind, s.text])).toEqual([
      ['decision', 'I said no'],
      ['number', '5% of merchants'],
      ['mechanism', 'flag'],
    ])
    for (const s of a.spans) expect(a.text.slice(s.start, s.end)).toBe(s.text)
  })

  it('keeps an unknown code as plain text and records no span', () => {
    const a = parseMarked('A {z:mystery} word.')
    expect(a.text).toBe('A mystery word.')
    expect(a.spans).toEqual([])
  })

  it('has a code, a label and a mark for every signal kind', () => {
    expect(new Set(Object.values(SIGNAL_CODES))).toEqual(new Set(SIGNAL_ORDER))
    for (const kind of SIGNAL_ORDER) expect(SIGNALS[kind].label.length).toBeGreaterThan(0)
  })

  it('tallies spans by kind and by side', () => {
    const t = tally([
      parseMarked('{s:ledger} {m:flag} {m:canary} {n:9 days}'),
      parseMarked('{p:risk register} {b:synergy} {c:PMP}'),
    ])
    expect(t.mechanism).toBe(2)
    expect(t.process).toBe(1)
    expect(sides(t)).toEqual({ engineering: 4, credential: 1, delivery: 2 })
  })
})

describe('speaking time', () => {
  it('counts words and converts to seconds at 150 words a minute', () => {
    expect(countWords('  about 40,000 requests a second  ')).toBe(5)
    expect(speakingSeconds(150)).toBe(60)
    expect(speakingSeconds(225)).toBe(OPENING_BUDGET_SECONDS)
  })
})

/* ── the opening ──────────────────────────────────────────────────────── */

describe('readOpening', () => {
  const read = (order: string[]) => readOpening(order, LINE_INFO)

  it('says nothing about an empty opening', () => {
    expect(read([]).band).toBe('empty')
  })

  it('the CV order (certificates first) reads as a project manager, and runs long', () => {
    const r = read(CV_ORDER)
    expect(r.band).toBe('pm')
    expect(r.withinBudget).toBe(false)
    expect(r.notes[0]!.tone).toBe('bad')
    expect(r.notes[0]!.text).toMatch(/certificate/i)
  })

  it('proof first, credentials late: engineer who can lead, inside 90 seconds', () => {
    const r = read(REFERENCE_ORDER)
    expect(r.band).toBe('lead')
    expect(r.withinBudget).toBe(true)
    expect(r.seconds).toBeLessThanOrEqual(OPENING_BUDGET_SECONDS)
    expect(r.proofsBeforeCredential).toBe(3)
    expect(r.notes[0]!.tone).toBe('ok')
  })

  it('leaving the certifications out is a wasted differentiator: engineer, not more', () => {
    const r = read(['systems', 'incident', 'tradeoff', 'delivery', 'next'])
    expect(r.band).toBe('engineer')
    expect(r.proofsBeforeCredential).toBeNull()
    expect(r.notes.some((n) => /differentiator/.test(n.text))).toBe(true)
  })

  it('a credential after a single proof is too early for the top band', () => {
    const r = read(['systems', 'pmp', 'cpmai', 'incident', 'tradeoff', 'next'])
    expect(r.band).toBe('engineer')
    expect(r.proofsBeforeCredential).toBe(1)
  })

  it('all eight lines in the best order still run past the budget', () => {
    const r = read(['systems', 'incident', 'tradeoff', 'delivery', 'pmp', 'cpmai', 'stakeholders', 'next'])
    expect(r.withinBudget).toBe(false)
    expect(r.band).not.toBe('lead')
    expect(r.notes.some((n) => /90 seconds/.test(n.text))).toBe(true)
  })

  it('replayed line by line, the impression only reaches the top when a credential lands on proof', () => {
    const scores = REFERENCE_ORDER.map((_, i) => read(REFERENCE_ORDER.slice(0, i + 1)))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!.score).toBeGreaterThanOrEqual(scores[i - 1]!.score)
    }
    const firstLead = scores.findIndex((s) => s.band === 'lead')
    expect(REFERENCE_ORDER[firstLead]).toBe('pmp')
    expect(scores[0]!.band).toBe('engineer')
  })

  it('holds its rules for every possible selection and order of the eight lines', () => {
    const ids = OPENING_LINES.map((l) => l.id)
    let checked = 0
    let leads = 0
    for (const order of orderedSubsets(ids)) {
      const r = read(order)
      checked += 1
      expect(r.score).toBeGreaterThanOrEqual(0)
      expect(r.score).toBeLessThanOrEqual(100)
      if (order.length === 0) continue
      const firstRole = LINE_INFO[order[0]!]!.role
      if (firstRole === 'credential' || firstRole === 'process') {
        expect(r.score).toBeLessThan(60)
      }
      if (r.band === 'lead') {
        leads += 1
        expect(firstRole).toBe('proof')
        expect(r.withinBudget).toBe(true)
        expect(r.proofs).toBeGreaterThanOrEqual(2)
        expect(r.proofsBeforeCredential).not.toBeNull()
        expect(r.proofsBeforeCredential!).toBeGreaterThanOrEqual(2)
      }
    }
    expect(checked).toBe(109601)
    expect(leads).toBeGreaterThan(0)
  })
})

describe('lineEffect', () => {
  const effect = (order: string[], i: number) => lineEffect(order, i, LINE_INFO)

  it('a certificate as the first line is the worst possible start', () => {
    expect(effect(CV_ORDER, 0).tone).toBe('bad')
  })

  it('good material after a bad first line reads as background', () => {
    const i = CV_ORDER.indexOf('systems')
    expect(effect(CV_ORDER, i).tone).toBe('warn')
  })

  it('the same certificate after two proofs is a bonus', () => {
    const i = REFERENCE_ORDER.indexOf('pmp')
    expect(effect(REFERENCE_ORDER, i).tone).toBe('ok')
    expect(effect(['systems', 'pmp'], 1).tone).toBe('warn')
  })

  it('the ask belongs at the end', () => {
    expect(effect(REFERENCE_ORDER, REFERENCE_ORDER.length - 1).tone).toBe('ok')
    expect(effect(['next', 'systems'], 0).tone).toBe('warn')
  })
})

/* ── the answer mixer ─────────────────────────────────────────────────── */

describe('readLevel', () => {
  const kinds: VariantKind[] = ['pm', 'mid', 'buzz', 'senior']

  it('four senior parts read as staff-track', () => {
    const r = readLevel(['senior', 'senior', 'senior', 'senior'])
    expect(r.level).toBe('staff')
    expect(r.complete).toBe(true)
    expect(r.position).toBeGreaterThan(66.7)
  })

  it('one weak part drops the answer to senior, two drop it to mid-level', () => {
    expect(readLevel(['senior', 'senior', 'senior', 'mid']).level).toBe('senior')
    expect(readLevel(['senior', 'pm', 'senior', 'senior']).level).toBe('senior')
    expect(readLevel(['senior', 'senior', 'mid', 'mid']).level).toBe('mid')
    expect(readLevel(['senior', 'pm', 'senior', 'pm']).level).toBe('mid')
  })

  it('names the failure: process nouns, or altitude without mechanism', () => {
    expect(readLevel(['pm', 'pm', 'pm', 'pm']).headline).toMatch(/project manager/)
    expect(readLevel(['buzz', 'buzz', 'senior', 'mid']).headline).toMatch(/mechanism/)
    expect(readLevel(['mid', 'mid', 'mid', 'mid']).headline).toMatch(/Mid-level/)
  })

  it('is provisional until all four parts are chosen', () => {
    const r = readLevel(['senior', null, 'senior', null])
    expect(r.complete).toBe(false)
    expect(r.chosen).toBe(2)
    expect(r.headline).toMatch(/Provisional/)
    expect(readLevel([null, null, null, null]).chosen).toBe(0)
  })

  it('across all 256 combinations, staff-track means exactly: four senior parts', () => {
    let staff = 0
    for (const a of kinds)
      for (const b of kinds)
        for (const c of kinds)
          for (const d of kinds) {
            const r = readLevel([a, b, c, d])
            const allSenior = [a, b, c, d].every((k) => k === 'senior')
            expect(r.level === 'staff').toBe(allSenior)
            if (r.level === 'staff') staff += 1
          }
    expect(staff).toBe(1)
  })

  it('places the needle in the zone that matches the level, and never moves it backwards', () => {
    let last = -1
    for (let v = 0; v <= 1.0001; v += 0.01) {
      const p = levelPosition(v)
      expect(p).toBeGreaterThanOrEqual(last)
      last = p
    }
    expect(levelPosition(0.5)).toBeLessThan(33.4)
    expect(levelPosition(0.8)).toBeGreaterThan(33.4)
    expect(levelPosition(0.875)).toBeLessThan(66.6)
    expect(levelPosition(1)).toBeGreaterThan(66.6)
  })
})

describe('seededOrder', () => {
  it('is a stable permutation for a given seed', () => {
    const items = ['a', 'b', 'c', 'd']
    const one = seededOrder(items, 'seed-1')
    expect(seededOrder(items, 'seed-1')).toEqual(one)
    expect([...one].sort()).toEqual(items)
    expect(items).toEqual(['a', 'b', 'c', 'd'])
  })

  it('produces different orders for different seeds', () => {
    const items = ['a', 'b', 'c', 'd']
    const orders = new Set(
      Array.from({ length: 24 }, (_, i) => seededOrder(items, `seed-${i}`).join('')),
    )
    expect(orders.size).toBeGreaterThan(6)
  })
})

/* ── content: the opening ─────────────────────────────────────────────── */

describe('opening lines', () => {
  it('has eight uniquely identified, well-formed lines covering every role', () => {
    expect(OPENING_LINES).toHaveLength(8)
    expect(new Set(OPENING_LINES.map((l) => l.id)).size).toBe(8)
    expect(new Set(OPENING_LINES.map((l) => l.role))).toEqual(
      new Set(['proof', 'lead', 'credential', 'process', 'close']),
    )
    for (const l of OPENING_LINES) {
      expectWellFormed(l, l.id)
      expect(l.words).toBe(countWords(l.text))
    }
  })

  it('both preset orders use real line ids, once each', () => {
    const ids = new Set(OPENING_LINES.map((l) => l.id))
    for (const order of [CV_ORDER, REFERENCE_ORDER]) {
      expect(new Set(order).size).toBe(order.length)
      for (const id of order) expect(ids.has(id), id).toBe(true)
    }
    expect(CV_ORDER).toHaveLength(8)
  })

  it('proof lines carry a number and something built; the process line carries neither', () => {
    for (const l of OPENING_LINES) {
      const t = tally([l])
      if (l.role === 'proof') {
        expect(t.number, l.id).toBeGreaterThanOrEqual(1)
        expect(t.system + t.mechanism, l.id).toBeGreaterThanOrEqual(1)
        expect(delivery(l), l.id).toBe(0)
      }
      if (l.role === 'process') {
        expect(engineering(l), l.id).toBe(0)
        expect(t.process, l.id).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('each credential is translated into a mechanism in the same breath', () => {
    for (const l of OPENING_LINES.filter((x) => x.role === 'credential')) {
      const t = tally([l])
      expect(t.credential, l.id).toBe(1)
      expect(t.mechanism, l.id).toBeGreaterThanOrEqual(2)
    }
  })
})

/* ── content: the answer mixer ────────────────────────────────────────── */

describe('mixer questions', () => {
  const allVariants = QUESTIONS.flatMap((q) => q.segments.flatMap((s) => s.variants))

  it('has at least four questions with unique ids', () => {
    expect(QUESTIONS.length).toBeGreaterThanOrEqual(4)
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length)
    expect(new Set(allVariants.map((v) => v.id)).size).toBe(allVariants.length)
    for (const q of QUESTIONS) {
      expect(q.question.length, q.id).toBeGreaterThan(10)
      expect(q.probing.length, q.id).toBeGreaterThan(10)
      expect(q.short.length, q.id).toBeGreaterThan(2)
    }
  })

  it('every question has the four segments, and every segment exactly one variant per voice', () => {
    for (const q of QUESTIONS) {
      expect(q.segments.map((s) => s.id)).toEqual(SEGMENT_ORDER)
      for (const s of q.segments) {
        expect(s.variants, `${q.id}.${s.id}`).toHaveLength(4)
        expect(s.variants.map((v) => v.kind).sort(), `${q.id}.${s.id}`).toEqual(
          ['buzz', 'mid', 'pm', 'senior'],
        )
        expect(s.variants.filter((v) => v.kind === 'senior'), `${q.id}.${s.id}`).toHaveLength(1)
        expect(strongest(s).kind).toBe('senior')
        expect(s.why.length, `${q.id}.${s.id}`).toBeGreaterThan(20)
      }
    }
  })

  it('every annotated span occurs in its text, and every variant has an interviewer note', () => {
    for (const v of allVariants) {
      expectWellFormed(v, v.id)
      expect(v.note.length, v.id).toBeGreaterThan(8)
    }
  })

  it('each voice contains what it claims to', () => {
    for (const v of allVariants) {
      const t = tally([v])
      if (v.kind === 'senior') {
        expect(engineering(v), v.id).toBeGreaterThanOrEqual(3)
        expect(delivery(v), v.id).toBe(0)
      }
      if (v.kind === 'pm') {
        expect(t.process, v.id).toBeGreaterThanOrEqual(2)
        expect(t.buzz, v.id).toBe(0)
        expect(t.decision + t.mechanism + t.tradeoff, v.id).toBe(0)
      }
      if (v.kind === 'buzz') {
        expect(t.buzz, v.id).toBeGreaterThanOrEqual(2)
        expect(engineering(v), v.id).toBe(0)
      }
      if (v.kind === 'mid') {
        expect(delivery(v), v.id).toBe(0)
        expect(engineering(v), v.id).toBeLessThanOrEqual(2)
        expect(t.decision + t.tradeoff, v.id).toBe(0)
      }
    }
  })

  it('a full senior answer has a decision, a mechanism, a number and a trade-off', () => {
    for (const q of QUESTIONS) {
      const t = tally(q.segments.map(strongest))
      expect(t.decision, q.id).toBeGreaterThanOrEqual(1)
      expect(t.mechanism, q.id).toBeGreaterThanOrEqual(1)
      expect(t.number, q.id).toBeGreaterThanOrEqual(1)
      expect(t.tradeoff, q.id).toBeGreaterThanOrEqual(1)
    }
  })

  it('a full senior answer fits in about two minutes', () => {
    for (const q of QUESTIONS) {
      const words = q.segments.reduce((sum, s) => sum + countWords(strongest(s).text), 0)
      expect(speakingSeconds(words), q.id).toBeLessThanOrEqual(125)
    }
  })

  it('length is not a tell: the senior variant is not reliably the longest', () => {
    let seniorLongest = 0
    let segments = 0
    for (const q of QUESTIONS) {
      for (const s of q.segments) {
        segments += 1
        const senior = countWords(strongest(s).text)
        const others = s.variants.filter((v) => v.kind !== 'senior').map((v) => countWords(v.text))
        const longestOther = Math.max(...others)
        expect(senior / longestOther, `${q.id}.${s.id}`).toBeLessThanOrEqual(1.35)
        expect(Math.min(...others) / senior, `${q.id}.${s.id}`).toBeGreaterThanOrEqual(0.55)
        if (senior > longestOther) seniorLongest += 1
      }
    }
    expect(seniorLongest).toBeLessThanOrEqual(Math.floor(segments / 2))
  })

  it('the senior variant does not sit in a guessable position', () => {
    const positions = QUESTIONS.flatMap((q) =>
      q.segments.map((s) => s.variants.findIndex((v) => v.kind === 'senior')),
    )
    expect(new Set(positions).size).toBe(4)
    const counts = [0, 1, 2, 3].map((p) => positions.filter((x) => x === p).length)
    expect(Math.max(...counts)).toBeLessThanOrEqual(Math.ceil(positions.length * 0.4))
    for (const q of QUESTIONS) {
      const own = q.segments.map((s) => s.variants.findIndex((v) => v.kind === 'senior'))
      expect(new Set(own).size, q.id).toBeGreaterThan(1)
    }
  })

  it('the Singapore angle quotes the framework from the shared facts', () => {
    const q = QUESTIONS.find((x) => x.id === 'agent-date')!
    expect(q.angle?.body).toContain(IMDA.name)
    expect(q.angle?.body).toContain(IMDA.dimensions[0]!.title)
    expect(q.angle?.body).toMatch(/voluntary/)
  })
})

/* ── content: the translation map ─────────────────────────────────────── */

describe('translation map', () => {
  it('has a dozen uniquely identified phrases', () => {
    expect(PHRASES).toHaveLength(12)
    expect(new Set(PHRASES.map((p) => p.id)).size).toBe(12)
    expect(new Set(PHRASES.map((p) => p.pm)).size).toBe(12)
  })

  it('the line to say is made of engineering signals; the line to avoid is made of process nouns', () => {
    for (const p of PHRASES) {
      expectWellFormed(p.say, `${p.id}.say`)
      expectWellFormed(p.not, `${p.id}.not`)
      expect(engineering(p.say), p.id).toBeGreaterThanOrEqual(2)
      expect(delivery(p.say), p.id).toBe(0)
      expect(tally([p.not]).process, p.id).toBeGreaterThanOrEqual(1)
      expect(engineering(p.not), p.id).toBe(0)
      expect(p.mechanism.length, p.id).toBeGreaterThan(40)
    }
  })

  it('has a move for every CPMAI phase, and no others', () => {
    const ids = CPMAI_PHASES.map((p) => p.id)
    expect(Object.keys(CPMAI_MOVES).sort()).toEqual([...ids].sort())
    for (const id of ids) {
      const m = CPMAI_MOVES[id]
      expect(m.move.length, id).toBeGreaterThan(20)
      expect(m.ask, id).toMatch(/\?/)
      expect(m.sounds.length, id).toBeGreaterThan(40)
    }
  })

  it('marks exactly the two data phases, and both come before any model', () => {
    const dataPhases = CPMAI_PHASES.filter((p) => CPMAI_MOVES[p.id].data)
    expect(dataPhases.map((p) => p.title)).toEqual(['Data Understanding', 'Data Preparation'])
    const firstModel = CPMAI_PHASES.find((p) => p.title.startsWith('Model'))!
    for (const p of dataPhases) expect(p.n).toBeLessThan(firstModel.n)
  })
})
