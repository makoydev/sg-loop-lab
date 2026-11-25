import {
  Check,
  Hourglass,
  Lock,
  LockOpen,
  Minus,
  RotateCcw,
  StepForward,
  TriangleAlert,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Film } from '@/components/Film'
import { SequenceTrace } from '@/components/SequenceTrace'
import { Button, Callout, Card, Chip, Kicker, Segmented } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  blockedReason,
  canStall,
  canStep,
  initialReadout,
  isTerminal,
  nextOp,
  outcome,
  programFor,
  STRATEGIES,
  STRATEGY_META,
  type Action,
  type OpId,
  type Replay,
  type State,
  type Strategy,
  type WorkerId,
} from './logic'
import { lanesFor, toTraceSteps } from './trace'

export type Broken = { naive: boolean; lock: boolean }

const WORKER_COLOR: Record<WorkerId, string> = {
  A: 'var(--color-ink)',
  B: 'var(--color-line-purple)',
}

const usesLock = (strategy: Strategy) => strategy === 'lock' || strategy === 'fencing'

/* ── one worker's lane ────────────────────────────────────────────────── */

function WorkerLane({
  id,
  state,
  executed,
  onAct,
}: {
  id: WorkerId
  state: State
  /** Steps this worker has actually run so far. */
  executed: OpId[]
  onAct: (action: Action) => void
}) {
  const me = state.workers[id]
  const program = programFor(state.strategy, { fenceReads: state.fenceReads })
  const op = nextOp(state, id)
  const blocked = blockedReason(state, id)
  const stepOk = canStep(state, id)
  const stallOk = canStall(state, id)
  const locked = usesLock(state.strategy)
  const color = WORKER_COLOR[id]
  const holds = state.store.lock?.holder === id
  const thinksItHolds = locked && me.token !== null && !me.done && !holds

  const locals: { name: string; value: number | null }[] = []
  if (locked) locals.push({ name: 'token', value: me.token })
  if (state.strategy === 'atomic') locals.push({ name: 'rows', value: me.rows })
  else locals.push({ name: 'stock', value: me.stock })

  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-rule bg-paper-2/40">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-rule px-4 py-2.5">
        <span className="size-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden />
        <span className="text-[14.5px] font-semibold text-ink">Worker {id}</span>
        <span className="text-[12.5px] text-ink-3">serving Buyer {id}</span>
        {me.result && (
          <Chip
            className="ml-auto"
            tone={me.result === 'confirmed' ? 'ok' : me.result === 'aborted' ? 'warn' : 'neutral'}
          >
            {me.result === 'confirmed'
              ? 'ORDER CONFIRMED'
              : me.result === 'aborted'
                ? 'ABORTED: stale token'
                : 'SOLD OUT'}
          </Chip>
        )}
      </div>

      <ol className="flex flex-col gap-0.5 px-2.5 py-2.5" aria-label={`Worker ${id} program`}>
        {program.map((step, i) => {
          const done = executed.includes(step.id)
          const isNext = !me.done && i === me.pc
          const skipped = !done && !isNext && (me.done || i < me.pc)
          return (
            <li
              key={step.id}
              className={cn(
                'grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2 rounded-lg px-2 py-1.5 transition-colors duration-200',
                isNext && 'bg-card shadow-card',
              )}
              aria-current={isNext ? 'step' : undefined}
            >
              <span
                className={cn(
                  'mt-0.5 flex size-[18px] items-center justify-center rounded-full border text-white transition-colors duration-200',
                  done && 'border-ink-3 bg-ink-3',
                  skipped && 'border-rule-2 text-ink-3',
                  !done && !isNext && !skipped && 'border-rule-2',
                )}
                style={isNext ? { backgroundColor: color, borderColor: color } : undefined}
                aria-hidden
              >
                {done && <Check size={11} strokeWidth={3} />}
                {isNext && <StepForward size={10} strokeWidth={3} />}
                {skipped && <Minus size={11} strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'kicker block',
                    isNext ? 'text-ink' : skipped ? 'text-ink-3/60' : 'text-ink-3',
                  )}
                >
                  {step.name}
                  {skipped && ' · skipped'}
                </span>
                <code
                  className={cn(
                    'mt-0.5 block text-[12px] leading-snug break-words',
                    isNext
                      ? 'text-ink'
                      : done
                        ? 'text-ink-3'
                        : skipped
                          ? 'text-ink-3/50 line-through'
                          : 'text-ink-2',
                  )}
                >
                  {step.code}
                </code>
              </span>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-rule px-4 py-2.5">
        <span className="kicker mr-1 text-ink-3">locals</span>
        {locals.map((local) => (
          <span
            key={local.value == null ? local.name : `${local.name}:${local.value}`}
            className={cn(
              'num rounded-md border px-2 py-0.5 text-[12px]',
              local.value == null
                ? 'border-rule text-ink-3/70'
                : 'animate-flash border-rule-2 bg-card text-ink',
            )}
            style={local.value == null ? undefined : { color }}
          >
            <span className="text-ink-3">{local.name} = </span>
            {local.value == null ? '?' : local.value}
          </span>
        ))}
        {thinksItHolds && (
          <Chip tone="warn" className="ml-auto">
            thinks it still holds the lock
          </Chip>
        )}
        {holds && (
          <Chip tone="ok" className="ml-auto">
            holds the lock
          </Chip>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t border-rule px-4 py-3">
        <Button
          variant="solid"
          onClick={() => onAct({ worker: id, kind: 'step' })}
          disabled={!stepOk}
          icon={<StepForward size={15} />}
          className="w-full"
          style={stepOk ? { backgroundColor: color } : undefined}
        >
          {me.done ? `Worker ${id} has finished` : op ? `Run ${id}: ${op.name}` : 'Run next step'}
        </Button>
        {locked && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAct({ worker: id, kind: 'stall' })}
            disabled={!stallOk}
            icon={<Hourglass size={14} />}
            className="w-full"
            title="Freeze this worker (a GC pause, a network stall) until its 10 second lock expires"
          >
            Stall {id} until its lock TTL expires
          </Button>
        )}
        <p className="min-h-[1.2em] text-[12px] leading-snug text-ink-3" aria-live="polite">
          {blocked ??
            (locked && me.stalled && !me.done
              ? `Worker ${id} resumed after the pause and carries on as if nothing happened.`
              : '')}
        </p>
      </div>
    </div>
  )
}

/* ── the shared store ─────────────────────────────────────────────────── */

function StorePanel({ state }: { state: State }) {
  const { store } = state
  const locked = usesLock(state.strategy)
  const oversold = store.orders > state.initialStock
  const expiredHolder = (['A', 'B'] as WorkerId[]).find((w) => {
    const worker = state.workers[w]
    return worker.stalled && !worker.done && store.lock?.holder !== w
  })

  return (
    <div className="flex flex-col rounded-xl border border-rule-2 bg-card shadow-card">
      <div className="border-b border-rule px-4 py-2.5">
        <Kicker>Shared store</Kicker>
      </div>
      <dl className="grid grid-cols-2 divide-x divide-rule border-b border-rule">
        <div className="px-4 py-3">
          <dt className="text-[12px] text-ink-3">stock</dt>
          <dd
            key={`stock-${store.stock}`}
            className="num mt-1 animate-flash rounded text-[34px] leading-none font-medium text-ink"
          >
            {store.stock}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-[12px] text-ink-3">orders confirmed</dt>
          <dd
            key={`orders-${store.orders}`}
            className={cn(
              'num mt-1 animate-flash rounded text-[34px] leading-none font-medium',
              oversold ? 'text-bad' : 'text-ink',
            )}
          >
            {store.orders}
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2 px-4 py-3 text-[12.5px] leading-snug text-ink-2">
        <p>
          The sale started with <span className="num text-ink">{state.initialStock}</span> unit.
        </p>
        {locked && (
          <p
            key={`lock-${store.lock?.token ?? 'free'}-${expiredHolder ?? ''}`}
            className="flex animate-flash items-start gap-2 rounded"
          >
            {store.lock ? (
              <Lock size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden />
            ) : (
              <LockOpen size={14} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
            )}
            <span>
              {store.lock ? (
                <>
                  Lock held by Worker {store.lock.holder}, token{' '}
                  <span className="num text-ink">{store.lock.token}</span>.
                </>
              ) : expiredHolder ? (
                <>
                  Lock <span className="font-semibold text-warn">expired</span>. It is free, whatever
                  Worker {expiredHolder} believes.
                </>
              ) : (
                'Lock is free.'
              )}
            </span>
          </p>
        )}
        {state.strategy === 'fencing' && (
          <p>
            Newest token storage has seen:{' '}
            <span key={store.newest} className="num animate-flash rounded px-1 text-ink">
              {store.newest === 0 ? 'none yet' : store.newest}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

/* ── the scheduler ────────────────────────────────────────────────────── */

export function Scheduler({
  strategy,
  onStrategy,
  run,
  onAct,
  onReset,
  broken,
  attempts,
}: {
  strategy: Strategy
  onStrategy: (strategy: Strategy) => void
  /** The user's schedule so far, replayed. */
  run: Replay
  onAct: (action: Action) => void
  onReset: () => void
  broken: Broken
  /** Completed schedules per strategy. */
  attempts: Record<Strategy, number>
}) {
  const state = run.states[run.states.length - 1]!
  const finished = isTerminal(state)
  const result = outcome(state)
  const steps = toTraceSteps(run.events)
  const executed = (worker: WorkerId) =>
    run.events.filter((e) => e.worker === worker && e.kind === 'step').map((e) => e.op as OpId)

  const tried = attempts[strategy]
  const paused = run.events.some((e) => e.kind === 'stall')
  const refused = state.workers.A.result === 'aborted' || state.workers.B.result === 'aborted'

  let verdict: { tone: 'bad' | 'ok'; title: string; body: string } | null = null
  if (finished && result.oversold) {
    verdict = {
      tone: 'bad',
      title: `Oversold: ${result.orders} orders confirmed for ${state.initialStock} unit.`,
      body:
        strategy === 'lock'
          ? 'The lock was held the whole time, as far as its holder knew. The stock row reads 0, and two buyers have a confirmation email.'
          : strategy === 'fencing'
            ? 'This should not be possible with fencing on reads and writes. If you see this, the lab has a bug.'
            : 'Both workers checked a value the other was about to change. The stock row reads 0, not -1, so nothing in the database looks wrong.',
    }
  } else if (finished) {
    let body: string
    if (strategy === 'naive') {
      body =
        'That order of steps happened to be safe. Reset and find one that is not: you choose who runs when.'
    } else if (strategy === 'lock') {
      body = paused
        ? 'That pause changed nothing: by the time it mattered, the stalled worker had nothing stale left to write. Reset and pick a different moment.'
        : 'With no pause the lock does its job. Reset and use your new power: a stall, at the right moment.'
    } else if (tried >= 2) {
      body = `That is ${tried} schedules without an oversell. You will not find one: the X-Ray lays out every schedule there is.`
    } else if (refused) {
      body =
        'Storage refused the worker with the stale token. In production it would retry, read stock 0, and tell its buyer the item is sold out. Reset and try to get past that.'
    } else {
      body =
        'Reset and try a different order of steps. See if any order at all can sell the unit twice.'
    }
    verdict = {
      tone: 'ok',
      title: `Correct this time: ${result.orders} order for ${state.initialStock} unit.`,
      body,
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-5 py-3.5">
        <div className="min-w-0">
          <Kicker>Your move</Kicker>
          <h3 className="mt-1 text-[19px] leading-tight font-[560]">
            You are the scheduler. Sell 2 units when only 1 is in stock.
          </h3>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Chip tone={broken.naive ? 'ok' : 'neutral'} dot={broken.naive}>
            {broken.naive ? 'check-then-act: oversold' : 'check-then-act: not broken yet'}
          </Chip>
          <Chip tone={broken.lock ? 'ok' : 'neutral'} dot={broken.lock}>
            {broken.lock ? 'TTL lock: oversold' : 'TTL lock: not broken yet'}
          </Chip>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-rule px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="kicker text-ink-3">the workers run</span>
          <Segmented
            label="Checkout strategy"
            value={strategy}
            onChange={onStrategy}
            options={STRATEGIES.map((s) => ({ value: s, label: STRATEGY_META[s].short }))}
          />
        </div>
        <p className="text-[13.5px] text-ink-2">
          <span className="font-semibold text-ink">{STRATEGY_META[strategy].name}.</span>{' '}
          {STRATEGY_META[strategy].blurb} Each button runs one step of one worker. You decide the
          order
          {usesLock(strategy) ? ', and you can freeze a lock holder until its lock expires.' : '.'}
        </p>
      </div>

      <div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_14.5rem_minmax(0,1fr)]">
        <WorkerLane id="A" state={state} executed={executed('A')} onAct={onAct} />
        <StorePanel state={state} />
        <WorkerLane id="B" state={state} executed={executed('B')} onAct={onAct} />
      </div>

      <AnimatePresence initial={false}>
        {verdict && (
          <motion.div
            key={`${strategy}-${run.events.length}`}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.7, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4">
              <Callout
                tone={verdict.tone}
                icon={verdict.tone === 'bad' ? <TriangleAlert size={18} /> : <Check size={18} />}
                title={verdict.title}
              >
                <p aria-live="polite">{verdict.body}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2.5"
                  onClick={onReset}
                  icon={<RotateCcw size={13} />}
                >
                  Reset and try another order
                </Button>
              </Callout>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-5 pb-5">
        <Film
          kicker="Recorder"
          title="Your schedule so far"
          scan={false}
          right={
            <Button
              surface="film"
              variant="outline"
              size="sm"
              onClick={onReset}
              disabled={run.events.length === 0}
              icon={<RotateCcw size={13} />}
            >
              Reset schedule
            </Button>
          }
        >
          {steps.length === 0 ? (
            <p className="py-6 text-center text-[13.5px] text-film-muted">
              Nothing has run yet. Press a worker's button above and its step is recorded here.
            </p>
          ) : (
            <div className="mx-auto max-w-[760px]">
              <SequenceTrace
                lanes={lanesFor(strategy)}
                steps={steps}
                index={steps.length - 1}
                initialState={initialReadout(strategy)}
              />
              <p className="mt-3 text-[13.5px] leading-snug text-film-text" aria-live="polite">
                {run.events[run.events.length - 1]!.detail}
              </p>
            </div>
          )}
        </Film>
      </div>
    </Card>
  )
}
