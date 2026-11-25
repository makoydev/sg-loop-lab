import { describe, expect, it } from 'vitest'
import {
  CODE,
  expectedTop,
  isMinHeap,
  ROUNDS,
  siftTarget,
  simulate,
  STREAMS,
  violations,
} from './logic'

/** Small deterministic generator, so the property tests are reproducible. */
function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const topBySorting = (xs: number[], k: number) => [...xs].sort((a, b) => b - a).slice(0, k)

describe('simulate', () => {
  it('agrees with sorting on 300 generated streams', () => {
    const rand = lcg(7)
    for (let run = 0; run < 300; run++) {
      const n = 1 + Math.floor(rand() * 30)
      const k = 1 + Math.floor(rand() * 7)
      const stream = Array.from({ length: n }, () => Math.floor(rand() * 40))
      expect(simulate(stream, k).top).toEqual(topBySorting(stream, k))
    }
  })

  it('keeps the heap property at every settled frame, and never holds more than K', () => {
    for (const preset of STREAMS) {
      for (const k of [3, 5, 7]) {
        const { frames } = simulate(preset.values, k)
        for (const f of frames) {
          expect(f.heap.length).toBeLessThanOrEqual(k)
          if (f.kind === 'settled' || f.kind === 'drop' || f.kind === 'arrive') {
            expect(isMinHeap(f.heap.map((x) => x.value))).toBe(true)
          }
        }
      }
    }
  })

  it('best case: once full, a descending stream costs exactly one comparison per value', () => {
    const k = 5
    const desc = STREAMS.find((s) => s.id === 'descending')!.values
    const fill = simulate(desc.slice(0, k), k)
    const all = simulate(desc, k)
    expect(all.comparisons - fill.comparisons).toBe(desc.length - k)
    expect(all.swaps).toBe(fill.swaps)
    expect(all.frames.filter((f) => f.kind === 'drop')).toHaveLength(desc.length - k)
  })

  it('worst case: an ascending stream admits every value', () => {
    const k = 5
    const asc = STREAMS.find((s) => s.id === 'ascending')!.values
    const { frames } = simulate(asc, k)
    expect(frames.filter((f) => f.kind === 'drop')).toHaveLength(0)
    expect(frames.filter((f) => f.kind === 'replace')).toHaveLength(asc.length - k)
  })

  it('a value equal to the gate is dropped', () => {
    const { frames, top } = simulate([5, 5, 5, 5], 2)
    expect(top).toEqual([5, 5])
    expect(frames.filter((f) => f.kind === 'drop')).toHaveLength(2)
  })

  it('accounts for every stream value exactly once', () => {
    for (const preset of STREAMS) {
      const k = 5
      const last = simulate(preset.values, k).frames.at(-1)!
      expect(last.status.every((s) => s === 'kept' || s === 'dropped' || s === 'evicted')).toBe(true)
      expect(last.status.filter((s) => s === 'kept')).toHaveLength(k)
    }
  })

  it('the gate never falls', () => {
    for (const preset of STREAMS) {
      const gates = simulate(preset.values, 5)
        .frames.filter((f) => f.kind === 'settled' && f.gate != null)
        .map((f) => f.gate!)
      for (let i = 1; i < gates.length; i++) expect(gates[i]).toBeGreaterThanOrEqual(gates[i - 1]!)
    }
  })

  it('every frame points at a real line of the reference code', () => {
    const lines = CODE.split('\n').length
    for (const f of simulate(STREAMS[0]!.values, 5).frames) {
      expect(f.line).toBeGreaterThanOrEqual(1)
      expect(f.line).toBeLessThanOrEqual(lines)
    }
  })
})

describe('heap helpers', () => {
  it('siftTarget picks the smaller child, or null when in place', () => {
    expect(siftTarget([31, 20, 35, 28, 24], 0)).toBe(1)
    expect(siftTarget([20, 31, 35, 28, 24], 1)).toBe(4)
    expect(siftTarget([22, 24, 35, 28, 31], 0)).toBeNull()
    expect(siftTarget([20, 24, 35, 28, 31], 2)).toBeNull() // no children
  })

  it('violations names the broken parent/child edges', () => {
    expect(violations([35, 20, 31, 28, 24])).toEqual([
      [0, 1],
      [0, 2],
    ])
    expect(isMinHeap([12, 20, 35, 28, 24])).toBe(true)
  })
})

describe('challenge rounds', () => {
  it('start from a valid heap', () => {
    for (const round of ROUNDS) expect(isMinHeap(round.initial)).toBe(true)
  })

  it('following the rules by hand reaches the true top K', () => {
    for (const round of ROUNDS) {
      const heap = [...round.initial]
      for (const x of round.arrivals) {
        if (x <= heap[0]!) continue
        heap[0] = x
        let i = 0
        for (let t = siftTarget(heap, i); t != null; t = siftTarget(heap, i)) {
          ;[heap[i], heap[t]] = [heap[t]!, heap[i]!]
          i = t
        }
        expect(isMinHeap(heap)).toBe(true)
      }
      expect([...heap].sort((a, b) => b - a)).toEqual(expectedTop(round))
    }
  })

  it('each round includes a drop, a one-swap sink and a two-swap sink', () => {
    for (const round of ROUNDS) {
      const heap = [...round.initial]
      const swapsPer: number[] = []
      let drops = 0
      for (const x of round.arrivals) {
        if (x <= heap[0]!) {
          drops += 1
          continue
        }
        heap[0] = x
        let i = 0
        let swaps = 0
        for (let t = siftTarget(heap, i); t != null; t = siftTarget(heap, i)) {
          ;[heap[i], heap[t]] = [heap[t]!, heap[i]!]
          i = t
          swaps += 1
        }
        swapsPer.push(swaps)
      }
      expect(drops).toBeGreaterThanOrEqual(1)
      expect(swapsPer).toContain(1)
      expect(swapsPer).toContain(2)
    }
  })
})
