import {
  HIDDEN_STATE_REWORK,
  TOTAL_MINUTES,
  type PartNumber,
  type Timeline,
} from './logic'

/*
 * The words on the X-Ray. Every number is read from the model, so the copy
 * cannot drift from what the bars show.
 */

/** What each part is teaching, beside the solution as it grows. */
export const LESSON: Record<PartNumber, { title: string; body: string }> = {
  1: {
    title: 'The fastest Part 1 is not the cheapest round',
    body: 'Hard-coding wins Part 1 by three minutes. The question that matters is what the next change will have to touch. In the table, a change to a fee is a change to data. Look at the first line: once the units are known, money is integer cents everywhere.',
  },
  2: {
    title: 'The twist changed the data, not the control flow',
    body: 'Each fee became a list of bands, and the function gained one loop that every currency shares. In the branches the same tier check is written once per currency, which is where the next bug will live. 0.8% of S$1,234.56 is S$9.87648; integer maths with a stated rounding rule gives S$9.88 every time.',
  },
  3: {
    title: 'Pass state in, and the function has no memory to go stale',
    body: `The number of payouts already used arrives as an argument. The function can be asked about any merchant in any month, and a test needs no setup. The alternative, a counter hidden in the module, works today and costs ${HIDDEN_STATE_REWORK} minutes of unpicking in Part 4.`,
  },
  4: {
    title: 'Re-computing last month is a loop, because of Part 3',
    body: 'Schedules became a dated list, and statement() walks the payouts with a fresh counter. Nothing had to be unpicked. The hard-coded and class-based versions would both still be editing when the 45 minutes end.',
  },
}

/**
 * One paragraph on how `part` went for the canonical paths. `byId` maps the
 * ids in `CANONICAL` to their simulated timelines.
 */
export function captionFor(part: PartNumber, byId: Record<string, Timeline>): string {
  const at = (id: string) => byId[id]!.parts[part - 1]!
  const typing = (id: string) => at(id).costs.find((c) => c.kind === 'build')?.minutes ?? 0
  const needs = (id: string) => at(id).minutes
  const left = (id: string) => TOTAL_MINUTES - at(id).start
  if (part === 1) {
    return `Part 1, flat fees. Hard-coding is ${typing('branches')} minutes of typing and the table is ${typing('table')}. The class hierarchy is ${typing('classes')}: a third of the interview, spent before any requirement asked for it.`
  }
  if (part === 2) {
    return `Part 2, tiers. In the table each fee becomes a list of bands: ${needs('table')} minutes. Patching the branches takes ${needs('branches')} and writes the tier check three times. Reshaping them into a table takes ${needs('reshape')}, the most expensive move on the board and the last expensive one.`
  }
  if (part === 3) {
    return `Part 3, overrides and free payouts. The table adds one dictionary and a guard: ${needs('table')} minutes. The branches need a merchant check around every currency: ${needs('branches')}. The class hierarchy finds its interface has no room for a merchant: ${needs('classes')}.`
  }
  return `Part 4, effective dates. A dated list and a loop: ${needs('table')} minutes on both table paths. The branches need ${needs('branches')} with ${left('branches')} left on the clock. The class hierarchy needs ${needs('classes')} with ${left('classes')} left.`
}
