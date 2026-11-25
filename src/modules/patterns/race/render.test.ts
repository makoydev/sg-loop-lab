import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseSchedule, replay, SHOWCASE, STRATEGIES, type Strategy } from './logic'
import RaceLab from './RaceLab'
import { RaceXRay } from './RaceXRay'
import { Scheduler } from './Scheduler'

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

const NO_ATTEMPTS: Record<Strategy, number> = { naive: 0, atomic: 0, lock: 0, fencing: 0 }

function scheduler(strategy: Strategy, schedule: string, attempts = NO_ATTEMPTS): string {
  return render(
    createElement(Scheduler, {
      strategy,
      onStrategy: () => {},
      run: replay(strategy, parseSchedule(schedule)),
      onAct: () => {},
      onReset: () => {},
      broken: { naive: false, lock: false },
      attempts,
    }),
  )
}

describe('RaceLab renders', () => {
  it('the whole lab, in its starting state', () => {
    const html = render(createElement(RaceLab))
    expect(html).toContain('You are the scheduler')
    expect(html).toContain('Nothing has run yet')
    expect(html).toContain('checkout.py')
  })
})

describe('Scheduler renders every kind of state', () => {
  it('a fresh schedule for each strategy', () => {
    for (const strategy of STRATEGIES) {
      const html = scheduler(strategy, '')
      expect(html).toContain('Run A: ')
      expect(html).toContain('Run B: ')
    }
  })

  it('an oversold ending on check-then-act', () => {
    const html = scheduler('naive', 'A B A B A B')
    expect(html).toContain('Oversold: 2 orders confirmed for 1 unit.')
    expect(html).toContain('ORDER CONFIRMED')
    expect(html).toContain('Worker A has finished')
  })

  it('a correct ending on check-then-act, and on the atomic update', () => {
    expect(scheduler('naive', 'A A A B B')).toContain('Correct this time')
    expect(scheduler('naive', 'A A A B B')).toContain('SOLD OUT')
    const atomic = scheduler('atomic', 'A B A B', { ...NO_ATTEMPTS, atomic: 3 })
    expect(atomic).toContain('That is 3 schedules without an oversell')
  })

  it('a lock holder that has been stalled past its TTL', () => {
    const html = scheduler('lock', 'A A A!')
    expect(html).toContain('thinks it still holds the lock')
    expect(html).toContain('expired')
    // B is no longer blocked: the lock is free.
    expect(html).not.toContain('Waiting: Worker A holds the lock')
  })

  it('a worker blocked on the lock', () => {
    const html = scheduler('lock', 'A')
    expect(html).toContain('Waiting: Worker A holds the lock')
    expect(html).toContain('holds the lock')
  })

  it('tells a harmless pause apart from no pause at all', () => {
    expect(scheduler('lock', 'A A A A A B B B B')).toContain('With no pause the lock does its job')
    // Stalled after its write: the other worker reads 0, so nothing goes wrong.
    expect(scheduler('lock', 'A A A A A! B B B B A')).toContain('That pause changed nothing')
  })

  it('the TTL lock oversold, and the fenced lock refusing the stale worker', () => {
    expect(scheduler('lock', 'A A A A! B B B B B A A')).toContain('Oversold')
    const fenced = scheduler('fencing', 'A A A A! B B B B B A A')
    expect(fenced).toContain('ABORTED: stale token')
    expect(fenced).toContain('Correct this time: 1 order for 1 unit.')
    expect(fenced).toContain('Storage refused the worker with the stale token')
    expect(fenced).not.toContain('Oversold')
  })
})

describe('RaceXRay renders every strategy', () => {
  const expected: Record<Strategy, string> = {
    naive: '18 of 20 schedules oversell.',
    atomic: '0 of 6 schedules oversell.',
    lock: '300 of 398 schedules oversell.',
    fencing: '0 of 350 schedules oversell, pauses included.',
  }

  it.each(STRATEGIES)('%s', (strategy) => {
    const html = render(
      createElement(RaceXRay, { initialStrategy: strategy, lastRun: null }),
    )
    expect(html).toContain(expected[strategy])
    expect(html).toContain('checkout.py')
  })

  it('marks the schedule the user ran', () => {
    const html = render(
      createElement(RaceXRay, {
        initialStrategy: 'naive',
        lastRun: { strategy: 'naive', actions: SHOWCASE.naive },
      }),
    )
    expect(html).toContain('the one you ran')
  })
})
