import type { FlowEdge, FlowNode } from '@/components/FlowDiagram'
import { fmtCount, fmtInt, fmtRate, type Run, type Tick } from './logic'

/*
 * Turns one moment of a simulated run into the architecture picture: which
 * boxes exist in this design, how loaded each one is, and how much traffic is
 * moving along each edge. Pure, so the diagram is always a function of the run.
 */

export const DIAGRAM_WIDTH = 900
export const DIAGRAM_HEIGHT = 300

/**
 * Requests per second → particle density. Traffic here spans 10/s to 600,000/s,
 * so the scale is logarithmic: every tenfold increase adds the same density.
 */
export function density(rps: number): number {
  if (rps < 1) return 0
  // Quantised to tenths, so the particle streams only re-time a few times per
  // run instead of on every step.
  const raw = Math.min(1, Math.max(0.14, Math.log10(rps + 1) / 5.2))
  return Math.max(0.1, Math.round(raw * 10) / 10)
}

export function buildDiagram(run: Run, tick: Tick): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const { design, scenario, summary } = run
  const cdn = design.page === 'cdn'
  const gate = design.admission === 'waitingroom'
  const redis = design.inventory === 'redis'
  const sync = design.orderWrite === 'sync'
  const slowPay = scenario.faults.pay
  const swarm = scenario.faults.bots
  const stockLabel = `stock ${tick.stock < 0 ? '−' : ''}${fmtInt(Math.abs(tick.stock))}`

  const nodes: FlowNode[] = [
    {
      id: 'users',
      label: 'Buyers',
      sub: fmtRate(tick.humanRps),
      x: 62,
      y: 150,
      w: 104,
      shape: 'pill',
    },
    {
      id: 'bots',
      label: 'Bots',
      sub: fmtRate(tick.botRps),
      x: 62,
      y: 246,
      w: 104,
      shape: 'pill',
      tone: swarm ? 'bad' : undefined,
    },
    {
      id: 'cdn',
      label: 'CDN',
      sub: cdn ? 'sale page' : 'not used',
      x: 215,
      y: 52,
      w: 116,
      off: !cdn,
    },
    {
      id: 'edge',
      label: gate ? 'Waiting room' : 'Edge',
      sub: gate
        ? tick.admissionPaused
          ? 'gate closed'
          : `${fmtCount(tick.waiting)} in line`
        : design.admission === 'ratelimit'
          ? 'per-user limit'
          : 'lets everyone in',
      x: 215,
      y: 150,
      w: 116,
      tone: gate ? (tick.admissionPaused ? 'warn' : 'trace') : undefined,
      badge: design.botDefence ? 'bot defence' : undefined,
    },
    {
      id: 'app',
      label: 'Order service',
      sub: `${fmtInt(summary.pods)} pods · ${fmtRate(tick.admittedRps)}`,
      x: 375,
      y: 150,
      w: 124,
      load: tick.appLoad,
      badge: tick.appQueue >= 1 ? `${fmtCount(tick.appQueue)} queued` : undefined,
    },
    {
      id: 'redis',
      label: 'Redis',
      sub: redis ? (tick.redisDown ? 'failing over' : stockLabel) : 'not used',
      x: 530,
      y: 52,
      w: 116,
      shape: 'store',
      off: !redis,
      load: redis ? tick.redisLoad : undefined,
      tone: redis && tick.redisDown ? 'bad' : undefined,
      badge: redis && tick.invQueue >= 1 ? `${fmtCount(tick.invQueue)} waiting` : undefined,
    },
    {
      id: 'mq',
      label: 'Queue',
      sub: sync ? 'not used' : `${fmtCount(tick.mqBacklog)} waiting`,
      x: 530,
      y: 150,
      w: 104,
      off: sync,
    },
    {
      id: 'worker',
      label: 'Worker',
      sub: sync ? 'not used' : tick.workerRps >= 1 ? fmtRate(tick.workerRps) : 'idle',
      x: 690,
      y: 150,
      w: 104,
      off: sync,
    },
    {
      id: 'db',
      label: 'Orders DB',
      sub: redis ? `${fmtCount(tick.orders)} orders` : stockLabel,
      x: 690,
      y: 248,
      w: 116,
      shape: 'store',
      load: tick.dbLoad,
      tone: tick.oversold > 0.5 ? 'bad' : undefined,
      badge:
        design.inventory === 'lock'
          ? 'row lock'
          : !redis && tick.invQueue >= 1
            ? `${fmtCount(tick.invQueue)} waiting`
            : sync && tick.writeQueue >= 1
              ? `${fmtCount(tick.writeQueue)} to write`
              : undefined,
    },
    {
      id: 'pay',
      label: 'Payments',
      sub: slowPay ? 'p99 3 s' : 'p99 250 ms',
      x: 838,
      y: 150,
      w: 100,
      tone: slowPay ? 'warn' : undefined,
      load: tick.payLoad,
    },
  ]

  const edges: FlowEdge[] = [
    {
      id: 'buy',
      from: 'users',
      to: 'edge',
      rate: density(tick.humanRps),
    },
    {
      id: 'bots',
      from: 'bots',
      to: 'edge',
      fromSide: 'r',
      toSide: 'b',
      rate: density(tick.botRps),
      tone: swarm ? 'bad' : 'warn',
    },
    {
      id: 'admit',
      from: 'edge',
      to: 'app',
      rate: density(tick.admittedRps),
      errRate: density(tick.appErrRps),
    },
  ]

  if (cdn) {
    edges.push({
      id: 'page-cdn',
      from: 'users',
      to: 'cdn',
      fromSide: 't',
      toSide: 'l',
      rate: density(tick.pageRps),
      tone: 'info',
      label: 'page',
    })
  } else {
    edges.push({
      id: 'page-origin',
      from: 'users',
      to: 'app',
      curve: -75,
      rate: density(tick.pageRps * (1 - tick.pageFail)),
      errRate: density(tick.pageRps * tick.pageFail),
      tone: 'info',
      label: 'page loads',
    })
  }

  if (redis) {
    edges.push({
      id: 'inv-redis',
      from: 'app',
      to: 'redis',
      fromSide: 't',
      toSide: 'l',
      rate: density(tick.decidedRps),
      errRate: density(tick.invErrRps),
    })
    edges.push({
      id: 'reconcile',
      from: 'redis',
      to: 'db',
      rate: tick.sold > 0 && !tick.redisDown ? 0.14 : 0,
      tone: 'neutral',
      dashed: true,
      label: 'reconcile',
    })
  }

  if (!redis || sync) {
    edges.push({
      id: 'app-db',
      from: 'app',
      to: 'db',
      fromSide: 'b',
      toSide: 'l',
      rate: density(tick.dbRequestOpsRps),
      errRate: density((redis ? 0 : tick.invErrRps) + tick.writeErrRps),
      label: design.inventory === 'lock' ? 'one at a time' : undefined,
    })
  }

  if (sync) {
    edges.push({
      id: 'app-pay',
      from: 'app',
      to: 'pay',
      curve: -70,
      rate: density(tick.syncWriteRps),
      tone: slowPay ? 'warn' : 'ok',
      label: 'charge, in the request',
    })
  } else {
    edges.push(
      { id: 'enqueue', from: 'app', to: 'mq', rate: density(tick.enqueueRps), tone: 'ok' },
      { id: 'mq-worker', from: 'mq', to: 'worker', rate: density(tick.workerRps), tone: 'ok' },
      { id: 'worker-db', from: 'worker', to: 'db', rate: density(tick.workerRps), tone: 'ok' },
      {
        id: 'worker-pay',
        from: 'worker',
        to: 'pay',
        rate: density(tick.workerRps),
        tone: slowPay ? 'warn' : 'ok',
      },
    )
  }

  return { nodes, edges }
}
