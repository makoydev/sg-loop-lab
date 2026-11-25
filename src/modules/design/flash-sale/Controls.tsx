import { RotateCcw } from 'lucide-react'
import { memo, type ReactNode } from 'react'
import { FilmPanel } from '@/components/Film'
import { Button, Segmented, Slider, Toggle } from '@/components/ui'
import { cn } from '@/lib/cn'
import {
  AUTOSCALE_LAG,
  BASE_PODS,
  fmtCount,
  fmtInt,
  fmtMoney,
  MISSION_BUYERS,
  REDIS_FAIL_AT,
  REDIS_FAIL_FOR,
  type Admission,
  type Capacity,
  type CapacityPlan,
  type CostLine,
  type Design,
  type Fault,
  type Inventory,
  type OrderWrite,
  type PageMode,
  type Scenario,
} from './logic'

/*
 * The design panel. Every control is one architectural decision; each choice
 * carries a one-line description of its mechanism (never a verdict), which the
 * sandbox shows back to the user next to what the change did to the numbers.
 */

/** What changed, in words, for the "your last change" readout. */
export type ChangeNote = {
  what: string
  how: string
  /** Consecutive changes with the same key (a dragged slider) count as one change. */
  key?: string
}

const PAGE: Record<PageMode, ChangeNote> = {
  origin: {
    what: 'Sale page from origin',
    how: 'The order service renders the sale page itself, for every refresh, on the same pods that take orders.',
  },
  cdn: {
    what: 'Sale page from a CDN',
    how: 'A static shell is served from the edge, with stock status cached for a second. Refreshes never reach your pods.',
  },
}

const ADMISSION: Record<Admission, ChangeNote> = {
  none: {
    what: 'No admission control',
    how: 'Every tap on Buy goes straight through to the order service.',
  },
  ratelimit: {
    what: 'Per-user rate limit',
    how: 'Each account may send one buy request every two seconds. Anything faster is rejected at the edge.',
  },
  waitingroom: {
    what: 'Virtual waiting room',
    how: 'Taps wait in line at the edge. A fixed number per second are let through, and once stock is gone everyone still waiting is told so right there.',
  },
}

const INVENTORY: Record<Inventory, ChangeNote & { code: string }> = {
  rw: {
    what: 'Read, then write',
    code: 'SELECT stock … then UPDATE',
    how: 'The service reads the stock, checks it is above zero, then writes the decrement. Two steps, with time in between.',
  },
  lock: {
    what: 'Row lock',
    code: 'SELECT … FOR UPDATE',
    how: 'Each transaction locks the stock row, reads it, decrements it and writes the order before letting go. One buyer at a time.',
  },
  atomic: {
    what: 'Atomic update',
    code: 'UPDATE … WHERE stock > 0',
    how: 'One statement checks and decrements together. The database says whether a row changed, and that is the answer.',
  },
  redis: {
    what: 'Redis pre-decrement',
    code: 'DECR in Lua, reconcile to DB',
    how: 'A script decrements a counter in memory and refuses at zero. The database stays the record: it is reconciled from confirmed orders.',
  },
}

const WRITE: Record<OrderWrite, ChangeNote> = {
  sync: {
    what: 'Order written in the request',
    how: 'The service writes the order and charges the card before it answers the buyer.',
  },
  queue: {
    what: 'Order written by a worker',
    how: 'The buyer hears "order accepted" as soon as a unit is held. The order goes on a queue; a worker writes it and charges the card at its own pace.',
  },
}

const CAPACITY: Record<Capacity, ChangeNote> = {
  fixed: {
    what: 'Fixed fleet',
    how: `${BASE_PODS} pods, the fleet that serves a normal day.`,
  },
  prewarm: {
    what: 'Pre-warmed fleet',
    how: 'Pods are started before midnight, sized 40% above the peak that is expected to reach the service, and held for three hours.',
  },
  reactive: {
    what: 'Reactive autoscaling',
    how: `The fleet starts at ${BASE_PODS} pods. Autoscaling sees the load, decides, and has new pods taking traffic about ${AUTOSCALE_LAG} seconds later.`,
  },
}

const TOGGLES = {
  botDefence: {
    on: {
      what: 'Bot defence on',
      how: 'Device attestation at the edge and one place in line per verified account.',
    },
    off: { what: 'Bot defence off', how: 'Every request is treated as a person.' },
  },
  idempotency: {
    on: {
      what: 'Idempotency key on create-order',
      how: 'The client sends the same key when it retries. The server returns the first result instead of creating a second order.',
    },
    off: {
      what: 'No idempotency key',
      how: 'A retry is indistinguishable from a new order.',
    },
  },
}

const FAULTS: Record<Fault, { label: string; hint: string }> = {
  bots: { label: 'Bot swarm', hint: 'Five bot requests for every human one' },
  redis: {
    label: 'Redis failover',
    hint: `Primary lost at ${REDIS_FAIL_AT} s, back ${REDIS_FAIL_FOR} s later`,
  },
  pay: { label: 'Payments slow', hint: 'Provider p99 goes from 250 ms to 3 s' },
}

function Field({
  label,
  cost,
  children,
}: {
  label: string
  /** What this choice adds to the bill, already formatted. */
  cost?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <span className="text-[13px] font-medium text-film-text">{label}</span>
        {cost != null && <span className="num text-[11px] text-film-muted">{cost}</span>}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function RadioList<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; title: string; code: string }[]
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col gap-1">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors duration-150',
              active
                ? 'border-trace/70 bg-trace/10'
                : 'border-film-rule hover:border-film-muted hover:bg-film-3/60',
            )}
          >
            <span
              className={cn(
                'size-3 shrink-0 rounded-full border-2 transition-colors',
                active ? 'border-trace bg-trace' : 'border-film-muted',
              )}
              aria-hidden
            />
            <span className="min-w-0">
              <span
                className={cn(
                  'block text-[12.5px] leading-tight font-medium',
                  active ? 'text-film-text' : 'text-film-muted',
                )}
              >
                {opt.title}
              </span>
              <span className="num block truncate text-[10.5px] leading-snug text-film-muted">
                {opt.code}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export const Controls = memo(function Controls({
  design,
  scenario,
  plan,
  costLines,
  onDesign,
  onBuyers,
  onFault,
  onReset,
}: {
  design: Design
  scenario: Scenario
  plan: CapacityPlan
  costLines: CostLine[]
  /** Apply a design change, with a note describing it. */
  onDesign: (patch: Partial<Design>, note: ChangeNote) => void
  onBuyers: (buyers: number) => void
  onFault: (fault: Fault, on: boolean) => void
  onReset: () => void
}) {
  const monthly = (id: string) => costLines.find((line) => line.id === id)?.monthly
  const perMonth = (id: string, otherwise: string) => {
    const amount = monthly(id)
    return amount == null ? otherwise : `${fmtMoney(amount)}/mo`
  }
  const gate = design.admission === 'waitingroom'
  const anyFault = scenario.faults.bots || scenario.faults.redis || scenario.faults.pay

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <FilmPanel title="At the edge">
        <Field label="Sale page" cost={perMonth('cdn', 'on your pods')}>
          <Segmented
            surface="film"
            size="sm"
            full
            label="Where the sale page is served from"
            value={design.page}
            onChange={(page) => onDesign({ page }, PAGE[page])}
            options={[
              { value: 'origin', label: 'Origin' },
              { value: 'cdn', label: 'CDN' },
            ]}
          />
        </Field>
        <Field
          label="Admission"
          cost={
            design.admission === 'none'
              ? 'no extra cost'
              : perMonth(gate ? 'waitingroom' : 'ratelimit', '')
          }
        >
          <Segmented
            surface="film"
            size="sm"
            full
            label="Admission control"
            value={design.admission}
            onChange={(admission) => onDesign({ admission }, ADMISSION[admission])}
            options={[
              { value: 'none', label: 'None' },
              { value: 'ratelimit', label: 'Rate limit' },
              { value: 'waitingroom', label: 'Waiting room' },
            ]}
          />
          {gate && (
            <Slider
              surface="film"
              className="px-0.5! pt-2.5! pb-0!"
              label="Let through"
              value={design.admitRate}
              min={500}
              max={8000}
              step={500}
              valueLabel={`${fmtInt(design.admitRate)}/s`}
              onChange={(admitRate) =>
                onDesign(
                  { admitRate },
                  {
                    key: 'admitRate',
                    what: `Waiting room lets ${fmtInt(admitRate)} through a second`,
                    how: 'The admission rate is a number you choose. Everything behind the gate is sized from it, and nothing behind the gate ever sees more.',
                  },
                )
              }
            />
          )}
        </Field>
        <Toggle
          surface="film"
          className="px-0.5!"
          checked={design.botDefence}
          onChange={(botDefence) =>
            onDesign({ botDefence }, botDefence ? TOGGLES.botDefence.on : TOGGLES.botDefence.off)
          }
          label="Bot defence"
          badge={
            <span className="num text-[11px] text-film-muted">
              {perMonth('botdefence', 'S$1,800/mo')}
            </span>
          }
        />
      </FilmPanel>

      <FilmPanel title="Behind it">
        <Field label="Inventory" cost={perMonth('redis', 'in the database')}>
          <RadioList
            label="How a unit is claimed"
            value={design.inventory}
            onChange={(inventory) => onDesign({ inventory }, INVENTORY[inventory])}
            options={(Object.keys(INVENTORY) as Inventory[]).map((value) => ({
              value,
              title: INVENTORY[value].what,
              code: INVENTORY[value].code,
            }))}
          />
        </Field>
        <Field label="Order write" cost={perMonth('queue', 'in the request')}>
          <Segmented
            surface="film"
            size="sm"
            full
            label="When the order is written"
            value={design.orderWrite}
            onChange={(orderWrite) => onDesign({ orderWrite }, WRITE[orderWrite])}
            options={[
              { value: 'sync', label: 'In the request' },
              { value: 'queue', label: 'Queue + worker' },
            ]}
          />
        </Field>
        <Toggle
          surface="film"
          className="px-0.5!"
          checked={design.idempotency}
          onChange={(idempotency) =>
            onDesign({ idempotency }, idempotency ? TOGGLES.idempotency.on : TOGGLES.idempotency.off)
          }
          label="Idempotency key"
          badge={
            <span className="num text-[11px] text-film-muted">
              {perMonth('idempotency', 'S$60/mo')}
            </span>
          }
        />
        <Field
          label="Capacity"
          cost={
            design.capacity === 'fixed'
              ? `${BASE_PODS} pods`
              : design.capacity === 'prewarm'
                ? `${fmtInt(plan.duringSale)} pods · ${perMonth('prewarm', 'S$0/mo')}`
                : `${BASE_PODS} now, ${fmtInt(plan.eventually)} later`
          }
        >
          <Segmented
            surface="film"
            size="sm"
            full
            label="How the order service is sized"
            value={design.capacity}
            onChange={(capacity) => onDesign({ capacity }, CAPACITY[capacity])}
            options={[
              { value: 'fixed', label: 'Fixed' },
              { value: 'prewarm', label: 'Pre-warmed' },
              { value: 'reactive', label: 'Autoscale' },
            ]}
          />
        </Field>
      </FilmPanel>

      <FilmPanel
        title="Tonight"
        right={
          anyFault ? <span className="kicker text-f-warn">fault injected</span> : undefined
        }
      >
        <Slider
          surface="film"
          className="px-0.5! pt-0.5!"
          label="Buyers at midnight"
          value={scenario.buyers}
          min={50_000}
          max={1_000_000}
          step={50_000}
          valueLabel={fmtCount(scenario.buyers)}
          onChange={onBuyers}
        />
        {scenario.buyers < MISSION_BUYERS && (
          <p className="px-0.5 pb-1 text-[11.5px] leading-snug text-f-warn">
            The mission is judged at {fmtCount(MISSION_BUYERS)} buyers or more.
          </p>
        )}
        <div className="mt-1 flex flex-col">
          {(Object.keys(FAULTS) as Fault[]).map((fault) => (
            <Toggle
              key={fault}
              surface="film"
              className="px-0.5! py-1.5!"
              checked={scenario.faults[fault]}
              onChange={(on) => onFault(fault, on)}
              label={FAULTS[fault].label}
              hint={FAULTS[fault].hint}
            />
          ))}
        </div>
      </FilmPanel>

      <Button
        surface="film"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={onReset}
        icon={<RotateCcw size={14} />}
      >
        Back to the Tuesday design
      </Button>
    </div>
  )
})
