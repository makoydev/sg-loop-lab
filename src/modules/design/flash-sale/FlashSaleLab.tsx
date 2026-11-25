import { useCallback, useMemo, useState } from 'react'
import { Brief } from '@/components/Brief'
import { HintLadder } from '@/components/HintLadder'
import { Takeaway } from '@/components/Takeaway'
import { Kicker } from '@/components/ui'
import type { ChangeNote } from './Controls'
import {
  DB_OPS,
  fmtCount,
  fmtInt,
  fmtMoney,
  FUNNEL_DESIGN,
  isSolved,
  MISSION_BUYERS,
  NAIVE_DESIGN,
  NO_FAULTS,
  peakBuyRps,
  simulate,
  STOCK,
  TARGETS,
  type Design,
  type Fault,
  type Scenario,
} from './logic'
import { Pushbacks } from './PushbackXRay'
import { Sandbox, type LastChange } from './Sandbox'

const MISSION: Scenario = { buyers: MISSION_BUYERS, faults: NO_FAULTS }

const GIVENS: [string, string][] = [
  ['On sale', `${fmtInt(STOCK)} phones at S$1 each`],
  [
    'The crowd',
    `about ${fmtCount(MISSION_BUYERS)} buyers, ${fmtCount(peakBuyRps(MISSION_BUYERS))} taps a second at the peak`,
  ],
  ['The spike', 'most of it over inside ten seconds'],
  ['The database', `${fmtInt(DB_OPS)} writes a second, and it will not grow for one night`],
  ['The budget', `${fmtMoney(TARGETS.budget)} a month, for a sale like this every night`],
]

const ALERTS: { title: string; body: string }[] = [
  {
    title: 'The stock invariant',
    body: 'Sold plus remaining must equal 5,000 at every moment. Page the instant it does not. Latency can be forgiven in the morning; phantom phones cannot.',
  },
  {
    title: 'Queue wait at each stage',
    body: 'Wait time moves seconds before the p99 does. By the time buyers feel it, a queue upstream has been growing for a while.',
  },
  {
    title: 'Admission stalled while stock remains',
    body: 'The gate closing is the system protecting itself. It should happen automatically, and a human should be told.',
  },
  {
    title: 'Queue lag, by age',
    body: 'Alert on the oldest unconfirmed order, not on depth. A deep queue that drains is healthy. An old one means confirmations are late.',
  },
]

export default function FlashSaleLab() {
  const [design, setDesign] = useState<Design>(NAIVE_DESIGN)
  const [buyers, setBuyers] = useState(MISSION_BUYERS)
  const [faults, setFaults] = useState<Record<Fault, boolean>>(NO_FAULTS)
  const [last, setLast] = useState<LastChange | null>(null)

  const scenario: Scenario = useMemo(() => ({ buyers, faults }), [buyers, faults])
  const run = useMemo(() => simulate(design, scenario), [design, scenario])
  const solved = isSolved(run)

  const onDesign = useCallback(
    (patch: Partial<Design>, note: ChangeNote) => {
      const changed = (Object.keys(patch) as (keyof Design)[]).some((k) => patch[k] !== design[k])
      if (!changed) return
      // A dragged slider is one change: keep the "before" from where the drag started.
      setLast((prev) => ({
        ...note,
        before: prev && note.key && prev.key === note.key ? prev.before : run.summary,
      }))
      setDesign({ ...design, ...patch })
    },
    [design, run],
  )
  const onBuyers = useCallback((next: number) => {
    setBuyers(next)
    setLast(null)
  }, [])
  const onFault = useCallback((fault: Fault, on: boolean) => {
    setFaults((prev) => ({ ...prev, [fault]: on }))
    setLast(null)
  }, [])
  const onReset = useCallback(() => {
    setDesign(NAIVE_DESIGN)
    setBuyers(MISSION_BUYERS)
    setFaults(NO_FAULTS)
    setLast(null)
  }, [])

  // The takeaway quotes the model, so its figures can never drift from it.
  const reference = useMemo(() => {
    const funnel = simulate(FUNNEL_DESIGN, MISSION).summary
    const brute = simulate({ ...FUNNEL_DESIGN, admission: 'none' }, MISSION).summary
    return { funnel, brute }
  }, [])
  const perOrder = (n: number | null) => (n === null ? 'none' : `S$${n.toFixed(3)}`)

  return (
    <div className="flex flex-col gap-8">
      <Brief
        tags={['System design round', '45 to 60 min', 'Regional tech · marketplaces']}
        aside={
          <div className="flex h-full flex-col justify-center gap-3 px-2 py-1">
            <Kicker>What you are working with</Kicker>
            <dl className="divide-y divide-rule border-y border-rule">
              {GIVENS.map(([term, detail]) => (
                <div key={term} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2">
                  <dt className="text-[13px] font-medium text-ink-3">{term}</dt>
                  <dd className="text-[13.5px] leading-snug text-ink">{detail}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[12.5px] leading-snug text-ink-3">
              Round numbers, chosen so the shape of the problem is easy to see. They are what this
              lab's model runs on, not measurements of any real system.
            </p>
          </div>
        }
      >
        <p>
          It is 11.11 on a Singapore marketplace. At midnight we put{' '}
          <strong>5,000 phones on sale at S$1</strong>, and about{' '}
          <strong>600,000 people</strong> tap Buy in the same few seconds.
        </p>
        <p>
          Design it so that nobody is sold a phone that does not exist, the buy path stays fast,
          the site stays up, and you can defend the bill. I am going to push on what it costs, and
          on how you would know it was failing.
        </p>
      </Brief>

      <HintLadder
        id="design/flash-sale"
        solved={solved}
        struggle={
          <Sandbox
            run={run}
            solved={solved}
            last={last}
            onDesign={onDesign}
            onBuyers={onBuyers}
            onFault={onFault}
            onReset={onReset}
          />
        }
        nudge={
          <>
            <p>
              Stop looking at the boxes and count the answers. There are <strong>5,000 rows</strong>{' '}
              to hand out. Whatever you build, about <strong>595,000</strong> of these requests are
              going to be told no.
            </p>
            <p>
              You do not get to choose that. You only get to choose <em>where</em> each of them
              hears it, and what it costs you to say it. Scrub to the moment the stock runs out and
              look at which box a rejected request has reached by the time it gets its answer.
            </p>
          </>
        }
        xray={<Pushbacks design={design} buyers={buyers} />}
        takeaway={
          <Takeaway
            headline="You cannot out-scale 600,000 people who all want the same 5,000 rows. You can only decide where they hear no."
            points={[
              {
                title: 'Draw the funnel before you draw the boxes',
                body: (
                  <p>
                    Name the scarce resource first, then make each stage see an order of magnitude
                    less than the one before it. The page comes from a CDN. A waiting room admits
                    only what the stack can take. One atomic step decides who gets a unit. A queue
                    lets the database be written at its own pace, and the database stays the
                    record that everything is reconciled against.
                  </p>
                ),
              },
              {
                title: 'Correctness comes from atomicity, not from capacity',
                body: (
                  <p>
                    The oversell is check-then-act: two requests read “one left” and both buy.
                    More pods make it worse, because more requests reach the gap at once.
                    Throttling shrinks the gap and never closes it. A row lock closes it and puts
                    every buyer in single file. One statement that checks and decrements together
                    closes it at full speed. And because a timeout is not a rollback, retries need
                    an idempotency key or they become second orders.
                  </p>
                ),
              },
              {
                title: 'The admission rate is a number you choose',
                body: (
                  <p>
                    Set it from the slowest stage behind the gate, and size everything else from
                    it. That is why twice the crowd costs this design nothing: the line gets
                    longer, and the service still sees the same {fmtInt(FUNNEL_DESIGN.admitRate)}{' '}
                    requests a second. A design sized to the crowd is only as good as the forecast.
                  </p>
                ),
              },
              {
                title: 'Defend the bill per order, and say how you would know',
                body: (
                  <p>
                    Quote cost per successful order, not the monthly total. Pre-warming is priced
                    by the peak that reaches the service, so admission control is also your cost
                    control. Reactive autoscaling cannot help: it takes about a minute and the
                    spike lasts ten seconds. Then name the alerts, before you are asked.
                  </p>
                ),
              },
            ]}
            facts={[
              { label: 'Requests at the edge', value: fmtCount(reference.funnel.arrivals) },
              { label: 'Reaching the service', value: fmtInt(reference.funnel.admitted) },
              {
                label: 'Pods, funnel / brute force',
                value: `${fmtInt(reference.funnel.pods)} / ${fmtInt(reference.brute.pods)}`,
              },
              { label: 'Per order, funnel', value: perOrder(reference.funnel.costPerOrder) },
              { label: 'Per order, brute force', value: perOrder(reference.brute.costPerOrder) },
            ]}
            traps={[
              'Listing load balancer, service, cache and database before saying what is scarce.',
              'Answering scale with “add autoscaling”. It reacts in a minute; the spike is over in ten seconds.',
              'Reaching for a distributed lock when one atomic statement decides the same thing.',
              'Treating a client timeout as if the order had been rolled back.',
            ]}
            sayIt="The scarce thing is 5,000 rows, so I will build a funnel: the page from a CDN, a waiting room that admits only what the stack can take, one atomic decrement to decide who gets a unit, and a queue so the database is written at its own pace. Then I will tell you what that costs per order, and the four alerts that tell me it is failing."
          >
            <Kicker>What you would alert on</Kicker>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ALERTS.map((alert) => (
                <div
                  key={alert.title}
                  className="rounded-xl border border-rule bg-paper-2/60 px-3.5 py-3"
                >
                  <div className="text-[13.5px] leading-tight font-semibold text-ink">
                    {alert.title}
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{alert.body}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-ink-3">
              The figures on this page are read from this lab's teaching model. Use them for the
              shape of the argument, and bring your own numbers to the interview.
            </p>
          </Takeaway>
        }
      />
    </div>
  )
}
