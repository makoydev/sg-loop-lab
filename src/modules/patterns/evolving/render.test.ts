import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import EvolvingLab from './EvolvingLab'
import { EvolvingXRay } from './EvolvingXRay'
import { captionFor, LESSON } from './copy'
import { allDecisions, CANONICAL, PARTS, simulate, type Decisions } from './logic'
import { EndScreen, Report, Simulation } from './Simulation'

/*
 * Render smoke tests: every view of the lab renders to HTML without throwing,
 * and says what it should. They run in Node, with no browser.
 */

/** Render to HTML and fail on the usual signs of a broken template. */
function render(element: ReactElement): string {
  const html = renderToString(element)
  expect(html).not.toMatch(/undefined|NaN|\[object Object\]/)
  return html
}

const best: Decisions = {
  shape: 'table',
  clarify: true,
  test: true,
  adapt: 'patch',
  quota: 'argument',
}

describe('EvolvingLab renders', () => {
  it('the whole lab, in its starting state', () => {
    const html = render(createElement(EvolvingLab))
    expect(html).toContain('four parts and one clock')
    expect(html).toContain('Start the clock')
    expect(html).toContain('45:00')
  })

  it('the simulation on its own', () => {
    const html = render(createElement(Simulation, { onEnd: () => {} }))
    expect(html).toContain('Before you type')
    expect(html).toContain('The shape of the code')
    // Until the candidate asks, the snippets assume float dollars.
    expect(html).toContain('0.50')
  })
})

describe('Report renders for every part of every path', () => {
  it('all 48 paths, all reached parts', () => {
    for (const decisions of allDecisions()) {
      const timeline = simulate(decisions)
      for (const result of timeline.parts.filter((p) => p.reached)) {
        const html = render(createElement(Report, { decisions, result }))
        expect(html).toContain('Where the minutes went')
        expect(html).toContain(result.completed ? 'done in' : 'out of time')
      }
    }
  })

  it('names the rework and the time-out when a path runs out', () => {
    const decisions: Decisions = { ...best, clarify: false, test: false, quota: 'counter' }
    const result = simulate(decisions).parts[3]!
    const html = render(createElement(Report, { decisions, result }))
    expect(html).toContain('min of rework')
    expect(html).toContain('The clock ran out')
    expect(html).toContain('short')
  })
})

describe('EndScreen renders', () => {
  it('a finished round', () => {
    const html = render(
      createElement(EndScreen, { timeline: simulate(best), onReset: () => {} }),
    )
    expect(html).toContain('10:00')
    expect(html).toContain('Reads as senior')
  })

  it('an unfinished round for each losing shape', () => {
    for (const shape of ['branches', 'classes'] as const) {
      const html = render(
        createElement(EndScreen, { timeline: simulate({ ...best, shape }), onReset: () => {} }),
      )
      expect(html).toContain('Ran out in')
      expect(html).toContain('Part 4')
    }
  })
})

describe('EvolvingXRay renders', () => {
  it('without a previous run', () => {
    const html = render(createElement(EvolvingXRay, { lastRun: null }))
    expect(html).toContain('Data table from the start')
    expect(html).not.toContain('Your last run')
    expect(html).toContain('fees.py')
  })

  it('with the user’s run as an extra row', () => {
    const html = render(
      createElement(EvolvingXRay, { lastRun: { ...best, shape: 'classes' } }),
    )
    expect(html).toContain('Your last run')
  })

})

describe('the X-Ray copy', () => {
  const byId = Object.fromEntries(CANONICAL.map((p) => [p.id, simulate(p.decisions)]))

  it('has a lesson and a caption for every part, with real numbers in them', () => {
    for (const part of PARTS) {
      const caption = captionFor(part, byId)
      expect(caption).toMatch(new RegExp(`^Part ${part}, `))
      expect(caption).not.toMatch(/undefined|NaN|—/)
      expect(caption).toMatch(/\d/)
      expect(LESSON[part].title.length).toBeGreaterThan(10)
      expect(LESSON[part].body).not.toMatch(/undefined|NaN|—/)
    }
  })

  it('quotes the model, not remembered numbers', () => {
    expect(captionFor(1, byId)).toContain('Hard-coding is 4 minutes of typing and the table is 7')
    expect(captionFor(2, byId)).toContain('Reshaping them into a table takes 12')
    expect(captionFor(4, byId)).toContain('The branches need 16 with 11 left')
    expect(captionFor(4, byId)).toContain('The class hierarchy needs 11 with 3 left')
  })
})
