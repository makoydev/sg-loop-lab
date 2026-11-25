import { describe, expect, it } from 'vitest'
import { LABS } from '@/lib/lines'
import { allocateHours, ARCHETYPES, ROUNDS, type RoundId } from './data'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('archetypes', () => {
  it('each archetype weights every round and sums to 100', () => {
    for (const a of ARCHETYPES) {
      expect(Object.keys(a.weights).sort()).toEqual(ROUNDS.map((r) => r.id).sort())
      expect(sum(Object.values(a.weights))).toBe(100)
    }
  })

  it('every link points at a lab that exists', () => {
    const roots = new Set(LABS.map((l) => l.path))
    const paths = [
      ...ROUNDS.map((r) => r.path),
      ...ARCHETYPES.flatMap((a) => a.startWith.map((s) => s.path)),
    ]
    for (const path of paths) {
      const root = `/${path.split('/')[1]}`
      expect(roots.has(root), path).toBe(true)
    }
  })
})

describe('allocateHours', () => {
  it('always adds up to the budget, in half-hour steps', () => {
    for (const a of ARCHETYPES) {
      for (let hours = 2; hours <= 24; hours += 0.5) {
        const parts = Object.values(allocateHours(a.weights, hours))
        expect(sum(parts)).toBeCloseTo(hours, 9)
        for (const p of parts) expect(Number.isInteger(p * 2)).toBe(true)
      }
    }
  })

  it('gives more time to heavier rounds', () => {
    const regional = ARCHETYPES.find((a) => a.id === 'regional')!
    const split = allocateHours(regional.weights, 10)
    const ids = Object.keys(split) as RoundId[]
    for (const x of ids) {
      for (const y of ids) {
        if (regional.weights[x] > regional.weights[y]) {
          expect(split[x]).toBeGreaterThanOrEqual(split[y])
        }
      }
    }
  })
})
