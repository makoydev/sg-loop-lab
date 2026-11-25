import type { Tone } from '@/lib/cn'
import { DT, REDIS_FAIL_AT, REDIS_FAIL_FOR, TICKS, type Run } from './logic'

/**
 * The moments of a run worth jumping to on the scrub bar: where stock ran out,
 * where something first saturated or oversold, and where a failure was injected.
 */
export function runMarks(run: Run): { index: number; tone: Tone }[] {
  const { summary, ticks, scenario } = run
  const byKey = new Map<string, { index: number; tone: Tone }>()
  const add = (seconds: number, tone: Tone) => {
    const index = Math.min(TICKS - 1, Math.max(0, Math.round(seconds / DT)))
    byKey.set(`${index}-${tone}`, { index, tone })
  }
  if (summary.soldOutAt !== null) add(summary.soldOutAt - DT, 'ok')
  if (summary.firstSaturation) add(summary.firstSaturation.t, 'bad')
  const oversoldAt = ticks.findIndex((tick) => tick.oversold > 0.5)
  if (oversoldAt >= 0) add(oversoldAt * DT, 'bad')
  if (scenario.faults.redis) {
    add(REDIS_FAIL_AT, 'info')
    add(REDIS_FAIL_AT + REDIS_FAIL_FOR, 'info')
  }
  return [...byKey.values()]
}
