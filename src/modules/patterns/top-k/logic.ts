/*
 * Top-K with a min-heap of size K, simulated one observable step at a time.
 *
 * The heap is stored the way the interview answer stores it: a flat array where
 * the children of index i live at 2i + 1 and 2i + 2. Frames carry a snapshot of
 * that array plus what the algorithm is looking at, so the UI can draw the same
 * state as a tree, as an array, and as a highlighted line of code.
 */

export type Item = {
  /** Position in the input stream: unique, so the UI can follow an item as it moves. */
  id: number
  value: number
}

export type Status = 'pending' | 'current' | 'kept' | 'dropped' | 'evicted'

export type FrameKind =
  | 'arrive'
  | 'push'
  | 'gate'
  | 'drop'
  | 'replace'
  | 'compare'
  | 'swap'
  | 'settled'

export type Frame = {
  kind: FrameKind
  /** Index in the stream of the value being processed. */
  step: number
  /** 1-based line of `CODE` executing. */
  line: number
  note: string
  heap: Item[]
  /** Heap indices being compared in this frame. */
  compare: number[]
  /** Heap indices that just traded places. */
  swap: [number, number] | null
  /** Heap index of the value that is currently moving. */
  at: number | null
  /** Fate of every stream value so far. */
  status: Status[]
  comparisons: number
  swaps: number
  /** The root once the heap is full: the smallest value still on the board. */
  gate: number | null
}

export const CODE = `def add(self, x):
    if len(self.heap) < self.k:
        self.heap.append(x)
        self._sift_up(len(self.heap) - 1)
    elif x > self.heap[0]:
        self.heap[0] = x
        self._sift_down(0)
    # else: x cannot be in the top k. Drop it.

def _sift_down(self, i):
    h, n = self.heap, len(self.heap)
    while True:
        small = i
        for child in (2 * i + 1, 2 * i + 2):
            if child < n and h[child] < h[small]:
                small = child
        if small == i:
            return
        h[i], h[small] = h[small], h[i]
        i = small

def _sift_up(self, i):
    h = self.heap
    while i > 0:
        parent = (i - 1) // 2
        if h[parent] <= h[i]:
            return
        h[i], h[parent] = h[parent], h[i]
        i = parent`

export const parentOf = (i: number) => (i - 1) >> 1
export const childrenOf = (i: number, n: number) =>
  [2 * i + 1, 2 * i + 2].filter((c) => c < n)

/** Every parent is no larger than its children. */
export function isMinHeap(values: number[]): boolean {
  return violations(values).length === 0
}

/** Parent/child index pairs that break the heap property. */
export function violations(values: number[]): [number, number][] {
  const out: [number, number][] = []
  for (let i = 1; i < values.length; i++) {
    const p = parentOf(i)
    if (values[p]! > values[i]!) out.push([p, i])
  }
  return out
}

/**
 * Where the value at index `i` must go next while sinking: the index of its
 * smaller child if that child is smaller than it, otherwise `null` (in place).
 */
export function siftTarget(values: number[], i: number): number | null {
  let small = i
  for (const child of childrenOf(i, values.length)) {
    if (values[child]! < values[small]!) small = child
  }
  return small === i ? null : small
}

export type Simulation = {
  frames: Frame[]
  /** The K largest values, largest first. */
  top: number[]
  comparisons: number
  swaps: number
}

export function simulate(stream: number[], k: number): Simulation {
  const heap: Item[] = []
  const status: Status[] = stream.map(() => 'pending')
  const frames: Frame[] = []
  let comparisons = 0
  let swaps = 0

  const snap = (
    frame: Pick<Frame, 'kind' | 'step' | 'line' | 'note'> &
      Partial<Pick<Frame, 'compare' | 'swap' | 'at'>>,
  ) =>
    frames.push({
      compare: [],
      swap: null,
      at: null,
      ...frame,
      heap: heap.map((item) => ({ ...item })),
      status: [...status],
      comparisons,
      swaps,
      gate: heap.length >= k ? heap[0]!.value : null,
    })

  stream.forEach((value, step) => {
    status[step] = 'current'
    snap({
      kind: 'arrive',
      step,
      line: 1,
      note:
        heap.length < k
          ? `${value} arrives. The board still has room: ${heap.length} of ${k} kept.`
          : `${value} arrives. The only question: does it beat the root, ${heap[0]!.value}?`,
    })

    // Still filling: append, then let the new value rise.
    if (heap.length < k) {
      heap.push({ id: step, value })
      status[step] = 'kept'
      let i = heap.length - 1
      snap({
        kind: 'push',
        step,
        line: 3,
        at: i,
        note: `Room on the board: append ${value} at index ${i}.`,
      })
      while (i > 0) {
        const parent = parentOf(i)
        comparisons += 1
        if (heap[parent]!.value <= heap[i]!.value) {
          snap({
            kind: 'compare',
            step,
            line: 26,
            compare: [parent, i],
            at: i,
            note: `Its parent ${heap[parent]!.value} is not larger than ${value}, so nothing moves.`,
          })
          break
        }
        snap({
          kind: 'compare',
          step,
          line: 26,
          compare: [parent, i],
          at: i,
          note: `Its parent ${heap[parent]!.value} is larger than ${value}. The smaller one must be on top.`,
        })
        ;[heap[i], heap[parent]] = [heap[parent]!, heap[i]!]
        swaps += 1
        snap({
          kind: 'swap',
          step,
          line: 28,
          swap: [parent, i],
          at: parent,
          note: `Swap: ${value} rises to index ${parent}.`,
        })
        i = parent
      }
      snap({
        kind: 'settled',
        step,
        line: 4,
        at: i,
        note:
          heap.length === k
            ? `The board is full. From here on the root, ${heap[0]!.value}, is the gate every new value must beat.`
            : `${value} is in place. Smallest so far: ${heap[0]!.value}.`,
      })
      return
    }

    // Full: one comparison against the root decides everything.
    comparisons += 1
    if (value <= heap[0]!.value) {
      status[step] = 'dropped'
      snap({
        kind: 'drop',
        step,
        line: 8,
        compare: [0],
        note: `${value} does not beat ${heap[0]!.value}, so it cannot be in the top ${k}. One comparison, nothing written.`,
      })
      return
    }

    const evicted = heap[0]!
    snap({
      kind: 'gate',
      step,
      line: 5,
      compare: [0],
      note: `${value} beats the root ${evicted.value}. It belongs on the board, and ${evicted.value} is out.`,
    })
    status[evicted.id] = 'evicted'
    heap[0] = { id: step, value }
    status[step] = 'kept'
    snap({
      kind: 'replace',
      step,
      line: 6,
      at: 0,
      note: `${value} takes the root's slot. It is probably too large to stay on top, so it sinks.`,
    })

    let i = 0
    for (;;) {
      const kids = childrenOf(i, heap.length)
      if (kids.length === 0) break
      let small = i
      for (const child of kids) {
        comparisons += 1
        if (heap[child]!.value < heap[small]!.value) small = child
      }
      if (small === i) {
        snap({
          kind: 'compare',
          step,
          line: 17,
          compare: [i, ...kids],
          at: i,
          note: `Neither child is smaller than ${value}: it stops here.`,
        })
        break
      }
      snap({
        kind: 'compare',
        step,
        line: 15,
        compare: [i, ...kids],
        at: i,
        note:
          kids.length === 2
            ? `Children are ${heap[kids[0]!]!.value} and ${heap[kids[1]!]!.value}. The smaller, ${heap[small]!.value}, is below ${value} and must come up.`
            : `Its only child, ${heap[small]!.value}, is smaller than ${value} and must come up.`,
      })
      ;[heap[i], heap[small]] = [heap[small]!, heap[i]!]
      swaps += 1
      snap({
        kind: 'swap',
        step,
        line: 19,
        swap: [i, small],
        at: small,
        note: `Swap with the smaller child: ${heap[i]!.value} rises, ${value} sinks to index ${small}.`,
      })
      i = small
    }
    snap({
      kind: 'settled',
      step,
      line: 7,
      at: i,
      note: `${value} is in place. The gate has risen to ${heap[0]!.value}.`,
    })
  })

  return {
    frames,
    top: heap.map((item) => item.value).sort((a, b) => b - a),
    comparisons,
    swaps,
  }
}

/* ── streams for the X-Ray ────────────────────────────────────────────── */

export type StreamPreset = { id: string; name: string; hint: string; values: number[] }

export const STREAMS: StreamPreset[] = [
  {
    id: 'mixed',
    name: 'Mixed',
    hint: 'An ordinary stream',
    values: [42, 17, 63, 8, 29, 71, 35, 12, 88, 54, 21, 67, 39, 95, 46, 26],
  },
  {
    id: 'ascending',
    name: 'Ascending',
    hint: 'Worst case: every value is admitted',
    values: [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72, 78, 84, 90, 96],
  },
  {
    id: 'descending',
    name: 'Descending',
    hint: 'Best case: after K, everything is rejected in one comparison',
    values: [96, 90, 84, 78, 72, 66, 60, 54, 48, 42, 36, 30, 24, 18, 12, 6],
  },
  {
    id: 'ties',
    name: 'With ties',
    hint: 'Equal to the gate is not better than the gate',
    values: [40, 40, 25, 60, 40, 25, 60, 75, 40, 60, 25, 75, 40, 90, 60, 75],
  },
]

/* ── the hand-run challenge ───────────────────────────────────────────── */

export type Round = {
  id: string
  /** A valid min-heap of the values already on the board. */
  initial: number[]
  arrivals: number[]
}

export const ROUNDS: Round[] = [
  { id: 'a', initial: [12, 20, 35, 28, 24], arrivals: [9, 31, 12, 22, 50, 30] },
  { id: 'b', initial: [8, 15, 11, 40, 19], arrivals: [14, 5, 26, 16, 60, 13] },
]

/** Ground truth for a round: the K largest of everything seen, largest first. */
export function expectedTop(round: Round): number[] {
  return [...round.initial, ...round.arrivals]
    .sort((a, b) => b - a)
    .slice(0, round.initial.length)
}
