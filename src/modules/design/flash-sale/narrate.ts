import type { Tone } from '@/lib/cn'
import { DT, fmtCount, fmtInt, fmtRate, type Run, type Tick } from './logic'

/*
 * One sentence about what is happening at a given moment of a run, picked by
 * priority: an outage beats a correctness failure beats saturation beats the
 * ordinary business of selling. This is the caption under the diagram.
 */

export type Narration = { tone: Tone; text: string }

export function narrate(run: Run, tick: Tick): Narration {
  const { design } = run
  const gate = design.admission === 'waitingroom'

  if (tick.redisDown && design.inventory === 'redis') {
    return gate
      ? {
          tone: 'warn',
          text: `Redis is failing over. The gate is shut and ${fmtCount(tick.waiting)} people are holding their place in line.`,
        }
      : {
          tone: 'bad',
          text: `Redis is failing over. ${fmtRate(tick.invErrRps)} requests are reaching a dead counter and failing.`,
        }
  }

  if (tick.oversold > 0.5) {
    return {
      tone: 'bad',
      text: `The stock counter reads −${fmtInt(tick.oversold)}. That many people have been sold a phone that does not exist.`,
    }
  }

  if (tick.appLoad >= 1) {
    const over = tick.appLoad >= 10 ? `${Math.round(tick.appLoad)} times` : `${tick.appLoad.toFixed(1)} times`
    return {
      tone: 'bad',
      text:
        tick.appErrRps >= 1
          ? `The order service is being asked for ${over} what it can do. It is shedding ${fmtRate(tick.appErrRps)}.`
          : `The order service is being asked for ${over} what it can do. Requests are queueing.`,
    }
  }

  if (tick.dbLoad >= 1) {
    return design.inventory === 'lock'
      ? {
          tone: 'bad',
          text: `Every buyer is waiting for the same row lock. ${fmtCount(tick.invQueue)} are in the queue for it.`,
        }
      : {
          tone: 'bad',
          text: `The primary database is saturated. ${fmtCount(tick.invQueue + tick.writeQueue)} requests are waiting on it.`,
        }
  }

  if (tick.stock <= 1e-9) {
    if (gate) {
      return tick.soldOutRps >= 1
        ? {
            tone: 'ok',
            text: `Sold out. ${fmtCount(tick.soldOutRps * DT)} people in line have just been told so, at the edge.`,
          }
        : {
            tone: 'ok',
            text: 'Sold out. The edge is turning everyone away, and nothing behind it is doing any work.',
          }
    }
    return tick.admittedRps >= 1
      ? {
          tone: 'warn',
          text: `Sold out, and ${fmtRate(tick.admittedRps)} requests are still travelling to the order service to hear it.`,
        }
      : { tone: 'ok', text: 'Sold out. The crowd has gone home.' }
  }

  if (tick.winnersRps >= 1) {
    return {
      tone: 'trace',
      text: `Units are going at ${fmtRate(tick.winnersRps)}. ${fmtInt(tick.stock)} left.`,
    }
  }

  if (gate && tick.waiting >= 1) {
    return {
      tone: 'trace',
      text: `${fmtCount(tick.waiting)} people are in line at the edge. ${fmtInt(tick.stock)} units left.`,
    }
  }

  return { tone: 'neutral', text: `Nothing is selling right now. ${fmtInt(tick.stock)} units left.` }
}
