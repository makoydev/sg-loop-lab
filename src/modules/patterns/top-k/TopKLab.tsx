import { ArrowDown, Ban, Check, DoorOpen, RotateCcw } from 'lucide-react'
import { useMemo, useReducer, useState } from 'react'
import { Brief } from '@/components/Brief'
import { CodePanel } from '@/components/CodePanel'
import { Film, FilmPanel, FilmStat } from '@/components/Film'
import { HintLadder } from '@/components/HintLadder'
import { Scrubber } from '@/components/Scrubber'
import { Takeaway } from '@/components/Takeaway'
import { Button, Card, Chip, Kicker, Segmented } from '@/components/ui'
import { cn, FILM_TONE, type Tone } from '@/lib/cn'
import { usePlayback } from '@/lib/usePlayback'
import { HeapArray, HeapTree } from './HeapTree'
import {
  childrenOf,
  CODE,
  expectedTop,
  ROUNDS,
  siftTarget,
  simulate,
  STREAMS,
  type Frame,
  type Item,
  type Round,
} from './logic'

const NAIVE = `class Board:
    def add(self, amount):
        self.seen.append(amount)      # keeps all 50 million

    def top(self, k=5):
        return sorted(self.seen, reverse=True)[:k]   # sorts them all, every refresh`

/* ── Struggle: be the heap ────────────────────────────────────────────── */

type Fate = 'pending' | 'dropped' | 'kept'

type Play = {
  roundIdx: number
  items: Item[]
  nextId: number
  /** Index of the arrival being handled. */
  arrival: number
  phase: 'decide' | 'sift' | 'done'
  /** Heap index of the value that is sinking. */
  pos: number
  slips: number
  swaps: number
  fates: Fate[]
  feedback: { tone: Tone; text: string } | null
  badEdge: [number, number] | null
}

type Move =
  | { type: 'drop' }
  | { type: 'enter' }
  | { type: 'swap'; index: number }
  | { type: 'place' }
  | { type: 'restart' }

const roundAt = (i: number): Round => ROUNDS[i % ROUNDS.length]!

function startPlay(roundIdx: number): Play {
  const round = roundAt(roundIdx)
  return {
    roundIdx,
    items: round.initial.map((value, id) => ({ id, value })),
    nextId: round.initial.length,
    arrival: 0,
    phase: 'decide',
    pos: 0,
    slips: 0,
    swaps: 0,
    fates: round.arrivals.map(() => 'pending'),
    feedback: null,
    badEdge: null,
  }
}

function play(state: Play, move: Move): Play {
  if (move.type === 'restart') return startPlay(state.roundIdx + 1)
  const round = roundAt(state.roundIdx)
  const x = round.arrivals[state.arrival]
  const values = state.items.map((item) => item.value)
  const root = values[0]!

  const slip = (text: string, badEdge: [number, number] | null = null): Play => ({
    ...state,
    slips: state.slips + 1,
    badEdge,
    feedback: { tone: 'bad', text },
  })
  const advance = (next: Play): Play => {
    const arrival = next.arrival + 1
    return { ...next, arrival, phase: arrival >= round.arrivals.length ? 'done' : 'decide' }
  }
  const withFate = (fate: Fate) => state.fates.map((f, i) => (i === state.arrival ? fate : f))

  if (state.phase === 'decide' && x != null) {
    if (move.type === 'drop') {
      if (x > root) {
        return slip(
          `${x} is larger than ${root}, the smallest value you are keeping. Dropping it would leave ${root} on a board it no longer deserves.`,
        )
      }
      return advance({
        ...state,
        fates: withFate('dropped'),
        badEdge: null,
        feedback: {
          tone: 'ok',
          text: `Right. ${x} cannot beat ${root}, and one look at the root told you so.`,
        },
      })
    }
    if (move.type === 'enter') {
      if (x <= root) {
        return slip(
          `${x} does not beat ${root}. Letting it in would push out a value that is larger than it.`,
        )
      }
      return {
        ...state,
        items: [{ id: state.nextId, value: x }, ...state.items.slice(1)],
        nextId: state.nextId + 1,
        fates: withFate('kept'),
        phase: 'sift',
        pos: 0,
        badEdge: null,
        feedback: {
          tone: 'ok',
          text: `${x} takes the root's slot and ${root} leaves the board. Now repair the heap: where does ${x} go?`,
        },
      }
    }
    return state
  }

  if (state.phase === 'sift') {
    const pos = state.pos
    const here = values[pos]!
    const target = siftTarget(values, pos)

    if (move.type === 'place') {
      if (target != null) {
        return slip(
          `${values[target]} sits below ${here} but is smaller. The heap is broken on that edge.`,
          [pos, target],
        )
      }
      return advance({
        ...state,
        badEdge: null,
        feedback: {
          tone: 'ok',
          text: `In place: nothing below ${here} is smaller than it. The root is now ${values[0]}.`,
        },
      })
    }

    if (move.type === 'swap') {
      const kids = childrenOf(pos, values.length)
      if (!kids.includes(move.index)) return state
      const picked = values[move.index]!
      if (target == null) {
        return slip(
          `${picked} is larger than ${here}. Swapping would put the larger value on top.`,
        )
      }
      if (move.index !== target) {
        return slip(
          `If ${picked} came up, it would sit above ${values[target]}, which is smaller. Always promote the smaller child.`,
          [pos, target],
        )
      }
      const items = [...state.items]
      ;[items[pos], items[target]] = [items[target]!, items[pos]!]
      const next: Play = { ...state, items, swaps: state.swaps + 1, pos: target, badEdge: null }
      if (childrenOf(target, items.length).length === 0) {
        return advance({
          ...next,
          feedback: {
            tone: 'ok',
            text: `Swapped. ${here} has no children left to compare with, so it is in place. The root is now ${items[0]!.value}.`,
          },
        })
      }
      return {
        ...next,
        feedback: { tone: 'ok', text: `Swapped. Does ${here} sink further, or is it in place?` },
      }
    }
  }

  return state
}

function Challenge({ state, dispatch }: { state: Play; dispatch: (move: Move) => void }) {
  const round = roundAt(state.roundIdx)
  const k = round.initial.length
  const x = round.arrivals[state.arrival]
  const done = state.phase === 'done'
  const sifting = state.phase === 'sift'
  const clean = state.slips <= 1
  const finalTop = [...state.items.map((i) => i.value)].sort((a, b) => b - a)
  const correct = done && finalTop.join() === expectedTop(round).join()
  const admitted = state.fates.filter((f) => f === 'kept').length

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-5 py-3.5">
        <div className="min-w-0">
          <Kicker>Your move</Kicker>
          <h3 className="mt-1 text-[19px] leading-tight font-[560]">
            Be the heap: keep the {k} largest amounts on the board
          </h3>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Chip>
            arrival {Math.min(state.arrival + 1, round.arrivals.length)} of {round.arrivals.length}
          </Chip>
          <Chip tone={state.slips === 0 ? 'neutral' : state.slips === 1 ? 'warn' : 'bad'}>
            {state.slips} {state.slips === 1 ? 'slip' : 'slips'}
          </Chip>
        </div>
      </div>

      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        {/* the stream */}
        <div className="flex flex-col gap-4">
          <div>
            <Kicker>{done ? 'Stream finished' : sifting ? 'Now sinking' : 'Next amount'}</Kicker>
            <div
              className={cn(
                'num mt-2 flex h-[88px] items-center justify-center rounded-xl border-2 text-[44px] leading-none font-medium transition-colors duration-200',
                done
                  ? 'border-rule bg-paper-2 text-ink-3'
                  : sifting
                    ? 'border-line bg-line/10 text-line'
                    : 'border-ink bg-card text-ink',
              )}
            >
              {done ? <Check size={34} /> : x}
            </div>
          </div>
          <div>
            <Kicker>The stream</Kicker>
            <ol className="mt-2 flex flex-wrap gap-1.5">
              {round.arrivals.map((value, i) => {
                const fate = state.fates[i]!
                const current = i === state.arrival && !done
                return (
                  <li
                    key={i}
                    title={fate === 'pending' ? 'Not yet arrived' : fate}
                    className={cn(
                      'num flex h-8 min-w-9 items-center justify-center gap-1 rounded-md border px-1.5 text-[13px] transition-colors duration-200',
                      current
                        ? 'border-ink bg-ink text-paper'
                        : fate === 'kept'
                          ? 'border-ok/40 bg-ok-wash text-ok'
                          : fate === 'dropped'
                            ? 'border-rule bg-paper-2 text-ink-3 line-through'
                            : 'border-rule-2 bg-card text-ink-2',
                    )}
                  >
                    {value}
                  </li>
                )
              })}
            </ol>
            <p className="mt-2 text-[12px] leading-snug text-ink-3">
              Green was admitted, struck through was turned away at the gate.
            </p>
          </div>
        </div>

        {/* the heap */}
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-rule bg-paper-2/40 px-4 pt-7 pb-6">
            <HeapTree
              items={state.items}
              capacity={k}
              surface="paper"
              at={sifting ? state.pos : null}
              badEdge={state.badEdge}
              clickable={sifting ? childrenOf(state.pos, state.items.length) : []}
              onNodeClick={(index) => dispatch({ type: 'swap', index })}
              rootLabel="smallest kept"
            />
          </div>
          <HeapArray
            items={state.items}
            capacity={k}
            surface="paper"
            at={sifting ? state.pos : null}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-rule bg-paper-2/50 px-5 py-3.5">
        <p
          className={cn(
            'min-w-0 flex-1 basis-72 text-[14px] leading-snug font-medium',
            done
              ? clean && correct
                ? 'text-ok'
                : 'text-ink'
              : state.feedback?.tone === 'bad'
                ? 'text-bad'
                : state.feedback?.tone === 'ok'
                  ? 'text-ok'
                  : 'text-ink-2',
          )}
          aria-live="polite"
        >
          {done
            ? `Board: ${finalTop.join(', ')}. ${correct ? 'Correct.' : 'That is not the true top.'} ${admitted} of ${round.arrivals.length} arrivals were admitted, with ${state.swaps} swaps in total and ${state.slips} ${state.slips === 1 ? 'slip' : 'slips'}.${clean ? '' : ' Run another round to do it cleanly.'}`
            : (state.feedback?.text ??
              `${x} arrives. Does it make the top ${k}? You may look at any value, but notice which one you actually need.`)}
        </p>
        <div className="flex flex-wrap gap-2">
          {state.phase === 'decide' && (
            <>
              <Button
                variant="outline"
                onClick={() => dispatch({ type: 'drop' })}
                icon={<Ban size={15} />}
              >
                Turn it away
              </Button>
              <Button onClick={() => dispatch({ type: 'enter' })} icon={<DoorOpen size={15} />}>
                Let it in
              </Button>
            </>
          )}
          {sifting && (
            <>
              <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
                <ArrowDown size={14} /> click the child to swap with, or
              </span>
              <Button onClick={() => dispatch({ type: 'place' })} icon={<Check size={15} />}>
                It is in place
              </Button>
            </>
          )}
          {done && (
            <Button
              variant="outline"
              onClick={() => dispatch({ type: 'restart' })}
              icon={<RotateCcw size={15} />}
            >
              Run another round
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

/* ── X-Ray ────────────────────────────────────────────────────────────── */

const CHART_W = 900
const CHART_H = 150
const CHART_PAD = 22
const CHART_TOP = 20
const CHART_BASE = 124

function StreamChart({ values, frame }: { values: number[]; frame: Frame }) {
  const max = Math.max(...values) * 1.08
  const slot = (CHART_W - CHART_PAD * 2) / values.length
  const barW = Math.min(34, slot * 0.62)
  const y = (v: number) => CHART_BASE - (v / max) * (CHART_BASE - CHART_TOP)
  const gateY = frame.gate != null ? y(frame.gate) : CHART_BASE

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      className="block w-full"
      role="img"
      aria-label={`Stream of ${values.length} values. ${frame.gate != null ? `The gate is at ${frame.gate}.` : 'The board is still filling.'}`}
    >
      <line
        x1={CHART_PAD}
        x2={CHART_W - CHART_PAD}
        y1={CHART_BASE}
        y2={CHART_BASE}
        stroke="var(--color-film-rule)"
        strokeWidth={1.5}
      />
      {values.map((v, i) => {
        const status = frame.status[i]!
        const cx = CHART_PAD + slot * (i + 0.5)
        const color =
          status === 'current'
            ? FILM_TONE.trace
            : status === 'kept'
              ? FILM_TONE.ok
              : status === 'evicted'
                ? FILM_TONE.warn
                : status === 'dropped'
                  ? FILM_TONE.neutral
                  : 'var(--color-film-rule)'
        const faded = status === 'dropped' || status === 'evicted'
        return (
          <g key={i}>
            <rect
              x={cx - barW / 2}
              y={y(v)}
              width={barW}
              height={CHART_BASE - y(v)}
              rx={3}
              fill={color}
              opacity={status === 'pending' ? 0.55 : faded ? 0.42 : 1}
              style={{ transition: 'fill 0.25s, opacity 0.25s' }}
            />
            <text
              x={cx}
              y={y(v) - 5}
              textAnchor="middle"
              fontSize={10.5}
              fontFamily="var(--font-mono)"
              fill={status === 'pending' ? 'var(--color-film-muted)' : color}
              opacity={faded ? 0.7 : 1}
            >
              {v}
            </text>
            {status === 'current' && (
              <path
                d={`M${cx - 5},${CHART_BASE + 7} h10 l-5,7 z`}
                fill={FILM_TONE.trace}
                transform={`rotate(180 ${cx} ${CHART_BASE + 10.5})`}
              />
            )}
          </g>
        )
      })}

      {/* the gate: the smallest value still on the board */}
      <g
        style={{
          transform: `translateY(${gateY}px)`,
          transition: 'transform 0.45s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.3s',
          opacity: frame.gate != null ? 1 : 0,
        }}
      >
        <line
          x1={CHART_PAD}
          x2={CHART_W - CHART_PAD}
          y1={0}
          y2={0}
          stroke="#fff"
          strokeWidth={1.4}
          strokeDasharray="5 4"
        />
        <rect x={CHART_W - CHART_PAD - 74} y={-17} width={74} height={15} rx={3} fill="#fff" />
        <text
          x={CHART_W - CHART_PAD - 37}
          y={-6}
          textAnchor="middle"
          fontSize={10.5}
          fontWeight={600}
          fontFamily="var(--font-mono)"
          fill="var(--color-film)"
        >
          gate = {frame.gate ?? ''}
        </text>
      </g>
    </svg>
  )
}

const KIND_TONE: Record<Frame['kind'], Tone> = {
  arrive: 'trace',
  push: 'ok',
  gate: 'ok',
  replace: 'ok',
  drop: 'neutral',
  compare: 'warn',
  swap: 'info',
  settled: 'ok',
}

function XRay() {
  const [k, setK] = useState<'3' | '5' | '7'>('5')
  const [streamId, setStreamId] = useState('mixed')
  const stream = (STREAMS.find((s) => s.id === streamId) ?? STREAMS[0]!).values
  const size = Number(k)

  const sim = useMemo(() => simulate(stream, size), [stream, size])
  const playback = usePlayback(sim.frames.length, {
    stepMs: 1000,
    resetKey: `${k}|${streamId}`,
  })
  const frame = sim.frames[playback.index]!

  const marks = useMemo(() => {
    const out: { index: number; tone: Tone }[] = []
    sim.frames.forEach((f, index) => {
      if (f.kind === 'drop') out.push({ index, tone: 'neutral' })
      else if (f.kind === 'replace') out.push({ index, tone: 'ok' })
    })
    return out
  }, [sim])

  const processed = frame.status.filter((s) => s !== 'pending' && s !== 'current').length
  const dropped = frame.status.filter((s) => s === 'dropped').length

  return (
    <Film
      title="A min-heap of size K, one step at a time"
      footer={
        <Scrubber
          playback={playback}
          marks={marks}
          caption={
            <span className="flex items-start gap-2.5">
              <Chip surface="film" tone={KIND_TONE[frame.kind]} className="mt-px shrink-0">
                {frame.kind}
              </Chip>
              <span>{frame.note}</span>
            </span>
          }
        />
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="kicker text-film-muted">K</span>
          <Segmented
            surface="film"
            size="sm"
            label="Board size K"
            value={k}
            onChange={setK}
            options={[
              { value: '3', label: '3' },
              { value: '5', label: '5' },
              { value: '7', label: '7' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="kicker mr-1 text-film-muted">stream</span>
          {STREAMS.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.hint}
              onClick={() => setStreamId(s.id)}
              aria-pressed={streamId === s.id}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors duration-150',
                streamId === s.id
                  ? 'border-trace bg-trace/15 text-trace'
                  : 'border-film-rule text-film-muted hover:border-film-muted hover:text-film-text',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-3 text-[13.5px] text-film-muted">
        The dashed line is the gate: the smallest value still on the board. Watch it rise. Anything
        that arrives under it is rejected with a single comparison.
      </p>
      <StreamChart values={stream} frame={frame} />

      <div className="mt-2 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        <div className="flex flex-col gap-4">
          <FilmPanel title={`the heap · ${frame.heap.length} of ${size} slots`}>
            <div className="px-2 pt-6 pb-5">
              <HeapTree
                items={frame.heap}
                capacity={size}
                surface="film"
                compare={frame.compare}
                at={frame.at}
                height={size === 3 ? 170 : 226}
              />
            </div>
            <HeapArray
              items={frame.heap}
              capacity={size}
              surface="film"
              compare={frame.compare}
              at={frame.at}
              className="border-t border-film-rule/70 pt-3"
            />
          </FilmPanel>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-film-rule bg-film-2/80 p-3 sm:grid-cols-4">
            <FilmStat label="comparisons" value={frame.comparisons} />
            <FilmStat label="swaps" value={frame.swaps} tone="info" />
            <FilmStat
              label="turned away"
              value={`${dropped}/${processed}`}
              tone="neutral"
              sub="one comparison each"
            />
            <FilmStat
              label="memory"
              value={`${frame.heap.length}`}
              tone="ok"
              sub={`values, of ${stream.length} seen`}
            />
          </div>
        </div>
        <CodePanel code={CODE} lang="python" title="top_k.py" activeLines={[frame.line]} />
      </div>
    </Film>
  )
}

/* ── the lab ──────────────────────────────────────────────────────────── */

export default function TopKLab() {
  const [state, dispatch] = useReducer(play, 0, startPlay)
  const round = roundAt(state.roundIdx)
  const solved =
    state.phase === 'done' &&
    state.slips <= 1 &&
    [...state.items.map((i) => i.value)].sort((a, b) => b - a).join() ===
      expectedTop(round).join()

  return (
    <div className="flex flex-col gap-8">
      <Brief
        tags={['Coding round', '30 min', 'Everywhere']}
        aside={
          <CodePanel
            surface="paper"
            lang="python"
            title="board.py · what is running today"
            code={NAIVE}
          />
        }
      >
        <p>
          Fraud operations wants a live board: <strong>the 5 largest transactions seen today</strong>
          . About 50 million amounts flow past, the board must be right at every moment, and the
          service has a few megabytes to spare.
        </p>
        <p>
          Keeping everything and sorting it is what we do now, and it is falling over. What do you
          keep, and what exactly do you do when the next amount arrives?
        </p>
      </Brief>

      <HintLadder
        id="patterns/top-k"
        solved={solved}
        struggle={<Challenge state={state} dispatch={dispatch} />}
        nudge={
          <>
            <p>
              You never need the kept values in order. You need exactly one fact about them:{' '}
              <strong>which one is the smallest</strong>. That is the only value a newcomer has to
              beat.
            </p>
            <p>
              And when a newcomer takes the top slot and has to sink, ask what would end up sitting
              above what if you swapped it with the <em>larger</em> of its two children.
            </p>
          </>
        }
        xray={<XRay />}
        takeaway={
          <Takeaway
            headline="Top-K is a gate, not a sort. Keep K values, and know only which of them is the smallest."
            points={[
              {
                title: 'Say the inversion out loud',
                body: (
                  <p>
                    To keep the K <em>largest</em> you need instant access to the <em>smallest</em>{' '}
                    of them, so it is a min-heap. Candidates who reach for a max-heap end up storing
                    everything. Interviewers listen for this sentence.
                  </p>
                ),
              },
              {
                title: 'Most of the stream costs one comparison',
                body: (
                  <p>
                    Every value is compared with the root once. Only a value that beats the gate
                    pays the log K repair. So the bound is N log K, the common case is close to N,
                    and memory stays at K no matter how long the stream runs. Ascending input is the
                    worst case, because everything is admitted.
                  </p>
                ),
              },
              {
                title: 'Know when the heap is the wrong tool',
                body: (
                  <p>
                    If you hold all the data and need the answer once, quickselect is linear on
                    average and a plain sort is fine when K is close to N. The heap wins when the
                    data is a stream, when memory is bounded, or when the board must be correct at
                    every moment.
                  </p>
                ),
              },
              {
                title: 'Be careful scaling it out',
                body: (
                  <p>
                    For the K largest values, each shard keeps its own top K and you merge: exact.
                    For the K most frequent keys it is not that simple. A key that is fourth on
                    every shard can be first overall, and local lists will miss it. Partition by key
                    so each key is counted in one place, or use a sketch and say it is approximate.
                  </p>
                ),
              },
            ]}
            facts={[
              { label: 'Time, worst case', value: 'O(N log K)' },
              { label: 'Time, friendly input', value: '≈ O(N)' },
              { label: 'Memory', value: 'O(K)' },
              { label: 'Children of index i', value: '2i + 1, 2i + 2' },
              { label: 'Parent of index i', value: '(i − 1) // 2' },
            ]}
            traps={[
              'A max-heap of everything: correct, and O(N) memory.',
              'Re-sorting the K kept values on every insert.',
              'Swapping with the larger child while sinking. It breaks the heap one level down.',
              'Not deciding what a tie with the gate means before you code it.',
            ]}
            sayIt="I'll keep a min-heap of size K. Its root is the weakest value still on the board, so each new item costs one comparison to reject and log K to admit. That is N log K time and K memory, and it never needs the whole stream."
          />
        }
      />
    </div>
  )
}
