import { Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Brief } from '@/components/Brief'
import { CodePanel } from '@/components/CodePanel'
import { HintLadder } from '@/components/HintLadder'
import { Takeaway } from '@/components/Takeaway'
import { Callout, Kicker } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  codeFor,
  explore,
  isTerminal,
  outcome,
  replay,
  STRATEGY_META,
  type Action,
  type Schedule,
  type Strategy,
} from './logic'
import { RaceXRay, type LastRun } from './RaceXRay'
import { Scheduler, type Broken } from './Scheduler'

const NO_ATTEMPTS: Record<Strategy, number> = { naive: 0, atomic: 0, lock: 0, fencing: 0 }

const tally = (schedules: Schedule[]) =>
  `${schedules.filter((s) => s.outcome.oversold).length} of ${schedules.length}`

export default function RaceLab() {
  const [strategy, setStrategy] = useState<Strategy>('naive')
  const [actions, setActions] = useState<Action[]>([])
  const [broken, setBroken] = useState<Broken>({ naive: false, lock: false })
  const [attempts, setAttempts] = useState(NO_ATTEMPTS)
  const [lastRun, setLastRun] = useState<LastRun | null>(null)

  const run = useMemo(() => replay(strategy, actions), [strategy, actions])

  const act = (action: Action) => {
    const nextActions = [...actions, action]
    const final = replay(strategy, nextActions).states.at(-1)!
    setActions(nextActions)
    if (!isTerminal(final)) return
    setLastRun({ strategy, actions: nextActions })
    setAttempts((prev) => ({ ...prev, [strategy]: prev[strategy] + 1 }))
    if (outcome(final).oversold && (strategy === 'naive' || strategy === 'lock')) {
      setBroken((prev) => ({ ...prev, [strategy]: true }))
    }
  }

  const changeStrategy = (next: Strategy) => {
    setStrategy(next)
    setActions([])
  }

  // Every schedule of every strategy, counted once for the takeaway.
  const counts = useMemo(() => {
    const lock = explore('lock')
    return {
      naive: tally(explore('naive')),
      atomic: tally(explore('atomic')),
      lockCalm: tally(lock.filter((s) => s.stalls === 0)),
      lockPaused: tally(lock.filter((s) => s.stalls > 0)),
      fencing: tally(explore('fencing')),
      writeOnly: tally(explore('fencing', { fenceReads: false })),
    }
  }, [])

  return (
    <div className="flex flex-col gap-8">
      <Brief
        tags={['Coding round', 'Concurrency', 'Regional tech · marketplaces']}
        aside={
          <CodePanel
            surface="paper"
            lang="python"
            title="checkout.py · in production"
            code={codeFor('naive')}
          />
        }
      >
        <p>
          It is one minute into the 11.11 sale. The flash-deal phone has <strong>1 unit left</strong>
          , and two checkout workers pick up Buyer A and Buyer B at the same moment.
        </p>
        <p>
          Both buyers got an order confirmation. Here is the checkout code. Walk me through the
          exact sequence of events that sells one phone twice, then make it impossible.
        </p>
      </Brief>

      <HintLadder
        id="patterns/race"
        solved={broken.naive}
        struggle={
          <div className="flex flex-col gap-4">
            {broken.naive && (
              <Callout tone="ok" icon={<Sparkles size={18} />} title="You sold one phone twice.">
                <p>
                  Two more things worth doing before the X-Ray. Switch the workers to{' '}
                  <strong>{STRATEGY_META.lock.short}</strong> and oversell that too: you get a new
                  power, stalling a lock holder until its lock expires.
                  {broken.lock ? ' (Done.)' : ''} Then try{' '}
                  <strong>{STRATEGY_META.atomic.short}</strong> and{' '}
                  <strong>{STRATEGY_META.fencing.short}</strong>, where you should fail however you
                  order the steps.
                </p>
              </Callout>
            )}
            <Scheduler
              strategy={strategy}
              onStrategy={changeStrategy}
              run={run}
              onAct={act}
              onReset={() => setActions([])}
              broken={broken}
              attempts={attempts}
            />
          </div>
        }
        nudge={
          <>
            <p>
              Between line 2 and line 4 a worker is holding a private copy of the stock. Nothing in
              this code tells the other worker that.
            </p>
            <p>
              So what does <strong>Worker B</strong> see if it reads while Worker A is standing
              between its read and its write? You do not have to let A finish before B starts.
            </p>
          </>
        }
        xray={<RaceXRay initialStrategy={strategy} lastRun={lastRun} />}
        takeaway={
          <Takeaway
            headline="The bug is not a missing lock. It is the gap between checking and acting."
            points={[
              {
                title: 'Close the gap at the source of truth',
                body: (
                  <p>
                    Read, check, write is three steps, and another worker can run between any two of
                    them. Make it one step that the store itself evaluates: a conditional{' '}
                    <code className="ic">UPDATE … WHERE stock &gt; 0</code>, or an atomic decrement
                    with a floor in Redis. Then count the rows changed. The database decides who
                    got the unit, not the application.
                  </p>
                ),
              },
              {
                title: 'A lock with a TTL is a lease, not mutual exclusion',
                body: (
                  <p>
                    The TTL is there so a crashed holder cannot block the sale forever. The price is
                    that a holder which merely paused, for a garbage collection or a slow network
                    hop, wakes up after the lock has moved on and has no way to know. You cannot fix
                    that by tuning the TTL, only by making it rarer.
                  </p>
                ),
              },
              {
                title: 'Fencing makes the storage the judge',
                body: (
                  <p>
                    Hand out a token that only ever increases with each lock, send it on every
                    request, and have storage refuse anything older than the newest it has seen.
                    That includes the read: with only the write fenced, a stale write can land
                    first and the newer worker overwrites it from an old read. If the resource
                    cannot check a token, a lock cannot protect it.
                  </p>
                ),
              },
              {
                title: 'Then design the real flash sale',
                body: (
                  <p>
                    Pre-decrement stock atomically in Redis so the hot path never waits on a row
                    lock, put the order on a queue, write it to the database behind the queue, and
                    reconcile the two counts. Give payment retries an idempotency key. And alert on
                    orders against units sold, because a lost update leaves stock at exactly 0, not
                    below it.
                  </p>
                ),
              },
            ]}
            facts={[
              { label: 'Check-then-act oversells', value: `${counts.naive} schedules` },
              { label: 'Atomic update oversells', value: `${counts.atomic}` },
              { label: 'TTL lock, nobody pauses', value: `${counts.lockCalm}` },
              { label: 'TTL lock, one pause', value: `${counts.lockPaused}` },
              { label: 'Fenced reads and writes', value: `${counts.fencing}` },
              { label: 'Fenced writes only', value: `${counts.writeOnly}` },
            ]}
            traps={[
              'Saying “add a lock” and stopping. The follow-up is always: what if the holder pauses?',
              'Releasing with a bare DEL. If your lock expired, you just deleted someone else’s.',
              'Trusting that stock never went negative. Two stale writes both set it to 0.',
              'Describing the race in general terms instead of naming the interleaving, step by step.',
            ]}
            sayIt="This is a check-then-act race: both workers can read 1 before either writes. I'd remove the gap with a single conditional update and check the rows affected. If I need a distributed lock for something the database can't express, I'd treat it as a lease and have storage reject stale fencing tokens, because a paused holder cannot know its lease expired."
          >
            <Kicker>Four strategies, every schedule explored</Kicker>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ['naive', counts.naive, 'Any overlap between a read and the other write.'],
                  ['atomic', counts.atomic, 'No gap exists to schedule into.'],
                  ['lock', counts.lockPaused, 'Safe until a holder pauses past the TTL.'],
                  ['fencing', counts.fencing, 'Storage refuses the stale token.'],
                ] as [Strategy, string, string][]
              ).map(([s, count, note]) => {
                const bad = !count.startsWith('0 ')
                return (
                  <div key={s} className="rounded-xl border border-rule bg-paper-2/60 px-3.5 py-3">
                    <div className="text-[13px] font-medium text-ink-2">
                      {STRATEGY_META[s].short}
                    </div>
                    <div
                      className={cn(
                        'num mt-1 text-[22px] leading-none',
                        bad ? 'text-bad' : 'text-ok',
                      )}
                    >
                      {count}
                    </div>
                    <div className="mt-1.5 text-[12px] leading-snug text-ink-3">{note}</div>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-[12.5px] text-ink-3">
              Schedules that oversell, out of every schedule possible. For the lock strategies the
              count includes one pause past the TTL. It is a count of what can happen, not of how
              often it does.
            </p>
          </Takeaway>
        }
      />
    </div>
  )
}
