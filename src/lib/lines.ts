import type { CSSProperties } from 'react'

/*
 * The five labs, drawn as stations on one loop. `ladders` lists the hint-ladder
 * ids inside each lab so the nav can show how much of it has been worked through.
 */

export type LabId = 'calibrator' | 'patterns' | 'bugbash' | 'design' | 'translator'

export type LabMeta = {
  id: LabId
  /** Route path, e.g. `/patterns`. */
  path: string
  /** Station code shown on the line map. */
  code: string
  name: string
  /** One-word name for the line map. */
  short: string
  /** What interview round this lab rehearses. */
  round: string
  blurb: string
  color: string
  ladders: string[]
}

export const LABS: LabMeta[] = [
  {
    id: 'calibrator',
    path: '/',
    code: 'CL1',
    name: 'Loop Calibrator',
    short: 'Calibrate',
    round: 'Know your loop',
    blurb: 'See how the interview mix shifts across four kinds of Singapore employer.',
    color: 'var(--color-line-red)',
    ladders: [],
  },
  {
    id: 'patterns',
    path: '/patterns',
    code: 'PT2',
    name: 'Pattern & Concurrency Lab',
    short: 'Patterns',
    round: 'Coding rounds',
    blurb: 'Break a rate limiter, be a heap, schedule a race, survive a changed requirement.',
    color: 'var(--color-line-green)',
    ladders: ['patterns/rate-limiter', 'patterns/top-k', 'patterns/race', 'patterns/evolving'],
  },
  {
    id: 'bugbash',
    path: '/bugbash',
    code: 'BB3',
    name: 'AI-Assisted Bug Bash',
    short: 'Bug Bash',
    round: 'Code comprehension rounds',
    blurb: 'Review AI-written pull requests, flag what is wrong, and watch the trace prove it.',
    color: 'var(--color-line-purple)',
    ladders: ['bugbash/refunds', 'bugbash/agent', 'bugbash/cache'],
  },
  {
    id: 'design',
    path: '/design',
    code: 'SD4',
    name: 'System Design Sandbox',
    short: 'Design',
    round: 'System design rounds',
    blurb: 'Flip architecture choices and watch latency, cost, risk and governance respond.',
    color: 'var(--color-line-orange)',
    ladders: ['design/flash-sale', 'design/agent'],
  },
  {
    id: 'translator',
    path: '/translator',
    code: 'TL5',
    name: 'PMP + CPMAI Translator',
    short: 'Translate',
    round: 'Leadership & trade-off rounds',
    blurb: 'Turn delivery instincts into the language a senior engineering panel rewards.',
    color: 'var(--color-line-blue)',
    ladders: ['translator/opening', 'translator/mixer'],
  },
]

export const LAB_BY_ID: Record<LabId, LabMeta> = Object.fromEntries(
  LABS.map((lab) => [lab.id, lab]),
) as Record<LabId, LabMeta>

/** Inline style that sets the `--line` colour for everything inside a lab. */
export function lineStyle(color: string): CSSProperties {
  return { '--line': color } as CSSProperties
}

/** Props every lab page receives: the optional second route segment. */
export type LabPageProps = { sub?: string }
