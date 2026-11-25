import { Eraser, Undo2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { Brief } from '@/components/Brief'
import { CodePanel } from '@/components/CodePanel'
import { Film, FilmPanel } from '@/components/Film'
import { HintLadder } from '@/components/HintLadder'
import { Scrubber } from '@/components/Scrubber'
import { Takeaway } from '@/components/Takeaway'
import { Button, Card, Chip, Kicker, Segmented } from '@/components/ui'
import { clamp, cn, type Tone } from '@/lib/cn'
import { usePlayback } from '@/lib/usePlayback'
import {
  ALGO_META,
  codeFor,
  decide,
  DEFAULT_CONFIG,
  fmt,
  PRESETS,
  simulate,
  stateSize,
  worstAllowedSpan,
  worstSpan,
  type Algo,
  type Config,
  type Frame,
} from './logic'
import { Timeline, type WindowOverlay } from './Timeline'

const CFG = DEFAULT_CONFIG
const DURATION = 30
const MAX_REQUESTS = 14
const TARGET = CFG.limit * 2
const ALGOS: Algo[] = ['fixed', 'log', 'counter', 'bucket']

/* ── Struggle: break the shipped limiter ──────────────────────────────── */

function BurstMeter({ best }: { best: number }) {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {Array.from({ length: TARGET }, (_, i) => {
        const filled = i < best
        const over = i >= CFG.limit
        return (
          <span key={i} className="flex items-center gap-1">
            {i === CFG.limit && <span className="mx-1 h-6 w-px bg-ink-3" />}
            <span
              className={cn(
                'h-4 w-2.5 rounded-sm border transition-colors duration-200',
                filled
                  ? over
                    ? 'border-bad bg-bad'
                    : 'border-ink-2 bg-ink-2'
                  : 'border-rule-2 bg-transparent',
              )}
            />
          </span>
        )
      })}
    </div>
  )
}

function Challenge({
  requests,
  onToggle,
  onUndo,
  onClear,
}: {
  requests: number[]
  onToggle: (t: number) => void
  onUndo: () => void
  onClear: () => void
}) {
  const decisions = useMemo(() => decide('fixed', requests, CFG), [requests])
  const span = useMemo(
    () =>
      worstSpan(
        requests.filter((_, i) => decisions[i]),
        CFG.window,
      ),
    [requests, decisions],
  )
  const best = span?.count ?? 0
  const rejected = decisions.filter((d) => !d).length
  const left = MAX_REQUESTS - requests.length

  let status: { tone: Tone; text: string }
  if (best >= TARGET) {
    status = {
      tone: 'bad',
      text: `${best} accepted within ${fmt(span!.last - span!.start, 1)} seconds. Twice the limit, and the limiter never noticed.`,
    }
  } else if (best > CFG.limit) {
    status = {
      tone: 'warn',
      text: `${best} accepted in one 10-second span. The limit is ${CFG.limit}, so it is leaking. Can you make it ${TARGET}?`,
    }
  } else if (requests.length === 0) {
    status = { tone: 'neutral', text: 'No requests yet. Click the timeline to send one.' }
  } else {
    status = {
      tone: 'neutral',
      text: `Densest 10-second span so far: ${best} accepted. The limit is holding.`,
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-5 py-3.5">
        <div className="min-w-0">
          <Kicker>Your move</Kicker>
          <h3 className="mt-1 text-[19px] leading-tight font-[560]">
            Get {TARGET} requests accepted inside one 10-second span
          </h3>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Chip>limit {CFG.limit} / 10s</Chip>
          <Chip tone={left === 0 ? 'warn' : 'neutral'}>{left} requests left</Chip>
          {rejected > 0 && <Chip tone="bad">{rejected} rejected</Chip>}
        </div>
      </div>

      <div className="px-3 pt-4 sm:px-5">
        <p className="px-2 text-[13.5px] text-ink-3">
          Click to place a request, click it again to remove it. The limiter you were shown judges
          each one: green is accepted, red is a 429. Keyboard: focus the timeline, then ← → and
          Enter.
        </p>
        <Timeline
          surface="paper"
          duration={DURATION}
          window={CFG.window}
          requests={requests}
          decisions={decisions}
          onToggle={onToggle}
          maxRequests={MAX_REQUESTS}
          span={span}
          limit={CFG.limit}
          className="mt-1"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-rule bg-paper-2/50 px-5 py-3.5">
        <BurstMeter best={best} />
        <p
          className={cn(
            'min-w-0 flex-1 text-[14px] font-medium',
            status.tone === 'bad' && 'text-bad',
            status.tone === 'warn' && 'text-warn',
            status.tone === 'neutral' && 'text-ink-2',
          )}
          aria-live="polite"
        >
          {status.text}
        </p>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onUndo}
            disabled={requests.length === 0}
            icon={<Undo2 size={14} />}
          >
            Undo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={requests.length === 0}
            icon={<Eraser size={14} />}
          >
            Clear
          </Button>
        </div>
      </div>
    </Card>
  )
}

/* ── X-Ray: what each limiter remembers ───────────────────────────────── */

function Pips({ filled, total, tone = 'trace' }: { filled: number; total: number; tone?: Tone }) {
  const color = tone === 'bad' ? 'var(--color-f-bad)' : 'var(--color-trace)'
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="h-7 w-5 rounded-[5px] border transition-colors duration-200"
          style={{
            borderColor: i < filled ? color : 'var(--color-film-rule)',
            backgroundColor: i < filled ? color : 'transparent',
          }}
        />
      ))}
    </div>
  )
}

function StateView({ algo, frame, cfg }: { algo: Algo; frame: Frame; cfg: Config }) {
  if (algo === 'fixed') {
    const count = frame.count ?? 0
    const start = frame.windowStart ?? 0
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <Pips filled={count} total={cfg.limit} tone={count >= cfg.limit ? 'bad' : 'trace'} />
          <div className="num text-right text-[13px] text-film-muted">
            count ={' '}
            <span className="text-[20px] text-film-text">{count}</span> / {cfg.limit}
          </div>
        </div>
        <p className="text-[12.5px] leading-snug text-film-muted">
          All it remembers: one number, for the window from{' '}
          <span className="num text-film-text">{start}s</span> to{' '}
          <span className="num text-film-text">{start + cfg.window}s</span>.
          {frame.phase === 'roll' && (
            <span className="text-f-warn"> The reset just threw the previous window away.</span>
          )}
        </p>
      </div>
    )
  }

  if (algo === 'log') {
    const log = frame.log ?? []
    return (
      <div className="flex flex-col gap-3">
        <div className="flex min-h-9 flex-wrap items-center gap-1.5">
          <span className="num text-[11px] text-film-muted">oldest →</span>
          <AnimatePresence mode="popLayout" initial={false}>
            {log.map((ts) => (
              <motion.span
                key={ts}
                layout
                initial={{ opacity: 0, x: 24, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -28, scale: 0.7 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                className="num rounded-md border border-trace/50 bg-trace/10 px-2 py-1 text-[12.5px] text-trace"
              >
                {fmt(ts)}s
              </motion.span>
            ))}
          </AnimatePresence>
          {Array.from({ length: Math.max(0, cfg.limit - log.length) }, (_, i) => (
            <span
              key={`empty-${i}`}
              className="num rounded-md border border-dashed border-film-rule px-2 py-1 text-[12.5px] text-film-muted/50"
            >
              free
            </span>
          ))}
        </div>
        <p className="text-[12.5px] leading-snug text-film-muted">
          The invariant: the log holds exactly the accepted requests from the last{' '}
          <span className="num text-film-text">{cfg.window}s</span>.{' '}
          <span className="num text-film-text">{log.length}</span> of {cfg.limit} slots used.
        </p>
      </div>
    )
  }

  if (algo === 'counter') {
    const prev = frame.prev ?? 0
    const overlap = frame.overlap ?? 0
    const curr = frame.count ?? 0
    const estimate = frame.estimate ?? 0
    const over = estimate >= cfg.limit
    return (
      <div className="flex flex-col gap-3">
        <div className="num flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[14px] text-film-muted">
          <span>
            prev <span className="text-[19px] text-f-info">{prev}</span>
          </span>
          <span>×</span>
          <span>
            overlap <span className="text-[19px] text-f-info">{fmt(overlap)}</span>
          </span>
          <span>+</span>
          <span>
            curr <span className="text-[19px] text-trace">{curr}</span>
          </span>
          <span>=</span>
          <span className={cn('text-[22px]', over ? 'text-f-bad' : 'text-film-text')}>
            {fmt(estimate)}
          </span>
        </div>
        <div className="relative h-2 rounded-full bg-film-3">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-300"
            style={{
              width: `${clamp((estimate / (cfg.limit * 1.4)) * 100, 0, 100)}%`,
              backgroundColor: over ? 'var(--color-f-bad)' : 'var(--color-trace)',
            }}
          />
          <div
            className="absolute -top-1 h-4 w-px bg-film-text"
            style={{ left: `${(1 / 1.4) * 100}%` }}
          />
        </div>
        <p className="text-[12.5px] leading-snug text-film-muted">
          It pretends the previous window's requests were spread evenly. When they were bunched at
          the end, the estimate is too low.
        </p>
      </div>
    )
  }

  const tokens = frame.tokens ?? 0
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex gap-1.5">
          {Array.from({ length: cfg.limit }, (_, i) => {
            const fill = clamp(tokens - i, 0, 1)
            return (
              <span
                key={i}
                className="relative h-9 w-6 overflow-hidden rounded-md border border-film-rule"
              >
                <span
                  className="absolute inset-x-0 bottom-0 bg-trace transition-[height] duration-300"
                  style={{ height: `${fill * 100}%`, opacity: fill >= 1 ? 1 : 0.55 }}
                />
              </span>
            )
          })}
        </div>
        <div className="num text-right text-[13px] text-film-muted">
          tokens = <span className="text-[20px] text-film-text">{fmt(tokens)}</span>
        </div>
      </div>
      <p className="text-[12.5px] leading-snug text-film-muted">
        Capacity <span className="num text-film-text">{cfg.limit}</span> sets the burst it will
        absorb. Refill at{' '}
        <span className="num text-film-text">{fmt(cfg.limit / cfg.window)}/s</span> sets the
        sustained rate. There is no window at all.
      </p>
    </div>
  )
}

function XRay({ attempt }: { attempt: number[] }) {
  const [algo, setAlgo] = useState<Algo>('fixed')
  const [streamId, setStreamId] = useState(attempt.length > 0 ? 'mine' : 'burst')
  const [closed, setClosed] = useState(false)

  const cfg: Config = useMemo(() => ({ ...CFG, closedBoundary: closed }), [closed])
  const requests =
    streamId === 'mine' && attempt.length > 0
      ? attempt
      : (PRESETS.find((p) => p.id === streamId) ?? PRESETS[0]!).requests

  const sim = useMemo(() => simulate(algo, requests, cfg), [algo, requests, cfg])
  const playback = usePlayback(sim.frames.length, {
    stepMs: 1150,
    resetKey: `${algo}|${closed}|${requests.join(',')}`,
  })
  const frame = sim.frames[playback.index]!

  const comparison = useMemo(
    () =>
      ALGOS.map((a) => ({
        algo: a,
        worst: worstAllowedSpan(a, requests, cfg)?.count ?? 0,
      })),
    [requests, cfg],
  )
  const scaleMax = Math.max(TARGET, ...comparison.map((c) => c.worst))

  const spanSoFar = useMemo(
    () =>
      worstSpan(
        requests.filter((_, i) => frame.decisions[i] === true),
        cfg.window,
      ),
    [requests, frame, cfg.window],
  )

  let overlay: WindowOverlay | null = null
  if (algo === 'fixed') {
    overlay = {
      kind: 'fixed',
      start: frame.windowStart ?? 0,
      label: `count ${frame.count ?? 0}/${cfg.limit}`,
    }
  } else if (algo === 'log') {
    overlay = { kind: 'sliding', to: frame.t, label: `last ${cfg.window}s` }
  } else if (algo === 'counter') {
    overlay = {
      kind: 'weighted',
      start: frame.windowStart ?? 0,
      overlap: frame.overlap ?? 0,
      label: `estimate ${fmt(frame.estimate ?? 0)}`,
    }
  }

  const marks = useMemo(() => {
    const out: { index: number; tone: Tone }[] = []
    sim.frames.forEach((f, index) => {
      if (f.phase === 'reject') out.push({ index, tone: 'bad' })
      else if (f.phase === 'roll' || f.phase === 'evict') out.push({ index, tone: 'warn' })
    })
    return out
  }, [sim])

  const phaseTone: Tone =
    frame.phase === 'allow'
      ? 'ok'
      : frame.phase === 'reject'
        ? 'bad'
        : frame.phase === 'roll' || frame.phase === 'evict'
          ? 'warn'
          : 'trace'

  const streams = [
    ...(attempt.length > 0
      ? [{ id: 'mine', name: 'Your attempt', hint: 'What you placed in the challenge' }]
      : []),
    ...PRESETS,
  ]

  return (
    <Film
      title="What each limiter remembers when a request arrives"
      footer={
        <Scrubber
          playback={playback}
          marks={marks}
          caption={
            <span className="flex items-start gap-2.5">
              <Chip surface="film" tone={phaseTone} className="mt-px shrink-0">
                {frame.phase}
              </Chip>
              <span>{frame.note}</span>
            </span>
          }
        />
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          surface="film"
          label="Rate limiting algorithm"
          value={algo}
          onChange={setAlgo}
          options={ALGOS.map((a) => ({ value: a, label: ALGO_META[a].short }))}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="kicker mr-1 text-film-muted">stream</span>
          {streams.map((s) => (
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
        <span className="font-semibold text-film-text">{ALGO_META[algo].name}.</span>{' '}
        {ALGO_META[algo].verdict}
      </p>

      <Timeline
        surface="film"
        duration={DURATION}
        window={cfg.window}
        requests={requests}
        decisions={frame.decisions}
        activeIndex={frame.req}
        playhead={frame.t}
        overlay={overlay}
        span={spanSoFar}
        limit={cfg.limit}
        className="mt-2"
      />

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)]">
        <div className="flex flex-col gap-4">
          <FilmPanel
            title={`state per key · ${stateSize(algo, cfg)}`}
            right={
              algo === 'log' ? (
                <Segmented
                  surface="film"
                  size="sm"
                  label="Eviction comparison at the window edge"
                  value={closed ? 'lt' : 'le'}
                  onChange={(v) => setClosed(v === 'lt')}
                  options={[
                    { value: 'le', label: 'ts <= cutoff', title: 'Half-open window: correct' },
                    { value: 'lt', label: 'ts < cutoff', title: 'The off-by-one' },
                  ]}
                />
              ) : undefined
            }
          >
            <StateView algo={algo} frame={frame} cfg={cfg} />
          </FilmPanel>

          <FilmPanel title="same stream, four limiters · most accepted in any 10s">
            <div className="flex flex-col gap-2">
              {comparison.map((c) => {
                const active = c.algo === algo
                const over = c.worst > cfg.limit
                return (
                  <button
                    key={c.algo}
                    type="button"
                    onClick={() => setAlgo(c.algo)}
                    aria-pressed={active}
                    className={cn(
                      'group grid grid-cols-[7.5rem_minmax(0,1fr)_2rem] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors',
                      active ? 'bg-film-3' : 'hover:bg-film-3/60',
                    )}
                  >
                    <span
                      className={cn(
                        'text-[12.5px] font-medium',
                        active ? 'text-film-text' : 'text-film-muted group-hover:text-film-text',
                      )}
                    >
                      {ALGO_META[c.algo].short}
                    </span>
                    <span className="relative h-2.5 rounded-full bg-film-3">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out"
                        style={{
                          width: `${(c.worst / scaleMax) * 100}%`,
                          backgroundColor: over ? 'var(--color-f-bad)' : 'var(--color-f-ok)',
                        }}
                      />
                      <span
                        className="absolute -top-1 h-[18px] w-px bg-film-text/80"
                        style={{ left: `${(cfg.limit / scaleMax) * 100}%` }}
                      />
                    </span>
                    <span
                      className={cn('num text-right text-[14px]', over ? 'text-f-bad' : 'text-f-ok')}
                    >
                      {c.worst}
                    </span>
                  </button>
                )
              })}
              <p className="px-2 pt-1 text-[11.5px] text-film-muted">
                The white tick is the limit of {cfg.limit}. Click a row to x-ray that limiter on
                this stream.
              </p>
            </div>
          </FilmPanel>
        </div>

        <CodePanel
          code={codeFor(algo, cfg)}
          lang="python"
          title={`${algo === 'bucket' ? 'token_bucket' : algo === 'log' ? 'sliding_log' : algo === 'counter' ? 'sliding_counter' : 'fixed_window'}.py`}
          activeLines={[frame.line]}
        />
      </div>
    </Film>
  )
}

/* ── the lab ──────────────────────────────────────────────────────────── */

export default function RateLimiterLab() {
  const [requests, setRequests] = useState<number[]>([])
  const [order, setOrder] = useState<number[]>([])

  const toggle = (t: number) => {
    if (requests.includes(t)) {
      setRequests(requests.filter((x) => x !== t))
      setOrder(order.filter((x) => x !== t))
    } else if (requests.length < MAX_REQUESTS) {
      setRequests([...requests, t].sort((a, b) => a - b))
      setOrder([...order, t])
    }
  }
  const undo = () => {
    const last = order[order.length - 1]
    if (last == null) return
    setRequests(requests.filter((x) => x !== last))
    setOrder(order.slice(0, -1))
  }
  const clear = () => {
    setRequests([])
    setOrder([])
  }

  const solved = useMemo(() => {
    const decisions = decide('fixed', requests, CFG)
    const span = worstSpan(
      requests.filter((_, i) => decisions[i]),
      CFG.window,
    )
    return (span?.count ?? 0) >= TARGET
  }, [requests])

  const burst = PRESETS[0]!.requests

  return (
    <div className="flex flex-col gap-8">
      <Brief
        tags={['Coding round', '45 min', 'Regional tech · fintech']}
        aside={
          <CodePanel
            surface="paper"
            lang="python"
            title="limiter.py · shipped last sprint"
            code={codeFor('fixed', CFG)}
          />
        }
      >
        <p>
          Our public API allows <strong>5 requests per 10 seconds</strong> per key. A teammate
          shipped this limiter.
        </p>
        <p>
          Last night one partner sent a burst that stayed inside the limit on every dashboard, and
          still knocked over the service behind it. Show me how that is possible. Then fix it.
        </p>
      </Brief>

      <HintLadder
        id="patterns/rate-limiter"
        solved={solved}
        struggle={
          <Challenge requests={requests} onToggle={toggle} onUndo={undo} onClear={clear} />
        }
        nudge={
          <>
            <p>
              Read line 2 of the limiter. The counter belongs to <code className="ic">now // 10</code>
              , not to the caller's last ten seconds.
            </p>
            <p>
              So what does it remember about a request at <strong>t = 9.9</strong> when the next one
              arrives at <strong>t = 10.0</strong>? Where on the timeline would you stand to take
              advantage of that?
            </p>
          </>
        }
        xray={<XRay attempt={requests} />}
        takeaway={
          <Takeaway
            headline="A rate limit is a promise about every window, not only the ones your clock happens to draw."
            points={[
              {
                title: 'Name the invariant before the data structure',
                body: (
                  <p>
                    “At most N accepted requests in any trailing W seconds.” The fixed window keeps
                    a weaker promise, N per calendar bucket, which is why a burst across the
                    boundary gets 2N through. Stating the invariant first is what lets you judge
                    every alternative against it.
                  </p>
                ),
              },
              {
                title: 'Price the fix in memory per key',
                body: (
                  <p>
                    The sliding log is exact and costs one timestamp per accepted request. The
                    sliding counter costs two integers and is usually within a few percent, but it
                    errs in both directions: one too many after a bunched burst, and an unfair
                    rejection for a client pacing itself exactly at the limit. Say which error your
                    product can live with.
                  </p>
                ),
              },
              {
                title: 'Ask which question the business is asking',
                body: (
                  <p>
                    A token bucket does not enforce “N per window” at all. It enforces a burst size
                    and a sustained rate, as two separate knobs. Protecting a fragile downstream
                    wants a small burst; being friendly to batchy clients wants a large one. That is
                    a product decision, so ask.
                  </p>
                ),
              },
              {
                title: 'Then, and only then, distribute it',
                body: (
                  <p>
                    Across many API servers the check and the increment must be one atomic step in
                    the shared store (a Lua script or a single conditional command), or two servers
                    will both read 4 and both allow. Use the store's clock rather than each
                    server's, and decide in advance whether you fail open or closed when the store
                    is down.
                  </p>
                ),
              },
            ]}
            facts={[
              { label: 'Time per request', value: 'O(1) amortised' },
              { label: 'Sliding log, per key', value: 'O(limit)' },
              { label: 'Counter / bucket, per key', value: 'O(1)' },
              { label: '1,000/min × 10M keys, log', value: '≈ 80 GB' },
              { label: 'Same, sliding counter', value: '≈ 0.2 GB' },
            ]}
            traps={[
              'Reaching for Redis before the single-node invariant is right.',
              'Not asking whether rejected requests should count against the limit.',
              'Comparing with < where <= is needed: the window quietly becomes W plus one tick.',
            ]}
            sayIt="I'll start from the invariant: the limiter must hold for any trailing window, not just aligned ones. The log gives me that exactly; if memory per key matters at our scale I'd trade to the two-counter approximation and tell you which way it errs."
          >
            <Kicker>The boundary burst, judged four ways</Kicker>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {ALGOS.map((a) => {
                const worst = worstAllowedSpan(a, burst, CFG)?.count ?? 0
                const over = worst > CFG.limit
                return (
                  <div key={a} className="rounded-xl border border-rule bg-paper-2/60 px-3.5 py-3">
                    <div className="text-[13px] font-medium text-ink-2">{ALGO_META[a].short}</div>
                    <div className={cn('num mt-1 text-[26px] leading-none', over ? 'text-bad' : 'text-ok')}>
                      {worst}
                      <span className="text-[13px] text-ink-3"> / {CFG.limit}</span>
                    </div>
                    <div className="mt-1.5 text-[12px] leading-snug text-ink-3">
                      {ALGO_META[a].verdict}
                    </div>
                  </div>
                )
              })}
            </div>
          </Takeaway>
        }
      />
    </div>
  )
}
