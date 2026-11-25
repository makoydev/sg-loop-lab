import type { TraceLane, TraceStep } from '@/components/SequenceTrace'
import type { RaceEvent, Strategy } from './logic'

/** Sequence-diagram lanes: the two workers either side of the shared store. */
export function lanesFor(strategy: Strategy): TraceLane[] {
  const locked = strategy === 'lock' || strategy === 'fencing'
  return [
    { id: 'A', label: 'Worker A', sub: 'serving Buyer A', tone: 'trace' },
    {
      id: 'store',
      label: locked ? 'Store + lock service' : 'Inventory store',
      sub: locked ? 'stock row · lock key' : 'the stock row',
    },
    { id: 'B', label: 'Worker B', sub: 'serving Buyer B', tone: 'info' },
  ]
}

/** Race events as sequence-diagram steps. */
export function toTraceSteps(events: RaceEvent[]): TraceStep[] {
  return events.map((event) => ({
    from: event.worker,
    to: event.shared ? 'store' : undefined,
    label: event.label,
    detail: event.detail,
    tone: event.tone,
    dashed: event.kind === 'stall',
    state: event.changes,
  }))
}
