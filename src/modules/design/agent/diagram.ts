import type { FlowEdge, FlowNode } from '@/components/FlowDiagram'
import type { Tone } from '@/lib/cn'
import { money, pct, type ControlId, type Design, type Evaluation, type Outcome } from './logic'

/*
 * The pipeline as a picture: a pure function from the design (and what the
 * model computed from it) to nodes and edges. Parts that are switched off are
 * drawn ghosted; traffic density follows the share of work on each path.
 */

export const DIAGRAM = { width: 960, height: 334 } as const

const NODE_W = 116
const NODE_H = 50

/** Which box on the diagram a control lives in. */
const NODE_OF: Partial<Record<ControlId, string>> = {
  identity: 'agent',
  tools: 'agent',
  cap: 'policy',
  policyCheck: 'policy',
  approval: 'reviewers',
  reviewers: 'reviewers',
  guardrails: 'guard',
  idempotency: 'payments',
  breaker: 'payments',
  audit: 'audit',
  disclosure: 'customer',
  escalation: 'desk',
  retrieval: 'retriever',
  chunking: 'retriever',
  freshness: 'index',
  permissions: 'index',
  cache: 'cache',
  routing: 'router',
  fallback: 'router',
}

export function buildDiagram(
  d: Design,
  e: Evaluation,
  /** Outcome of the incident being inspected: its controls light up. */
  focus?: Outcome,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const o = e.oversight
  const hit = e.metrics.cacheHitRate
  const main = 0.62
  const miss = main * (1 - hit)
  const refunds = 0.36
  const reviewed = d.approval === 'none' ? 0 : o.reviewedShare
  const auto = 1 - reviewed
  const advisory = d.approval !== 'none' && !d.policyCheck

  const node = (n: Omit<FlowNode, 'w' | 'h'>): FlowNode => ({ w: NODE_W, h: NODE_H, ...n })

  const nodes: FlowNode[] = [
    node({
      id: 'customer',
      label: 'Customer',
      sub: d.disclosure ? 'told: AI agent' : 'not told',
      x: 68,
      y: 56,
      shape: 'pill',
      tone: d.disclosure ? undefined : 'warn',
    }),
    node({
      id: 'guard',
      label: 'Guardrails',
      sub: d.guardrails ? 'input + output' : 'off',
      x: 228,
      y: 56,
      off: !d.guardrails,
    }),
    node({
      id: 'cache',
      label: 'Cache',
      sub: d.cache === 'on' ? 'shared, 24h TTL' : d.cache === 'scoped' ? 'per user, purged' : 'off',
      x: 388,
      y: 56,
      shape: 'store',
      off: d.cache === 'off',
      tone: d.cache === 'on' ? 'bad' : d.cache === 'scoped' ? 'ok' : undefined,
      badge: hit > 0 ? `hit ${pct(hit)}` : undefined,
    }),
    node({
      id: 'retriever',
      label: 'Retriever',
      sub: d.retrieval === 'hybrid' ? 'hybrid + rerank' : 'vector only',
      x: 548,
      y: 56,
      badge: d.chunking === 'structure' ? 'structured chunks' : 'fixed chunks',
    }),
    node({
      id: 'router',
      label: 'Model router',
      sub: d.routing === 'cascade' ? 'small → large' : 'large model',
      x: 708,
      y: 56,
      tone: d.fallback === 'none' ? 'warn' : undefined,
      badge:
        d.fallback === 'secondary'
          ? '+ provider B'
          : d.fallback === 'degrade'
            ? '+ degrade mode'
            : 'no fallback',
    }),
    node({
      id: 'agent',
      label: 'Agent',
      sub: d.identity === 'scoped' ? 'own identity' : 'shared account',
      x: 872,
      y: 56,
      tone: d.identity === 'scoped' ? 'ok' : 'bad',
      badge: d.tools === 'broad' ? 'broad tools' : 'refund tool only',
    }),
    node({
      id: 'docs',
      label: 'Doc store',
      sub: '40,000 docs',
      x: 388,
      y: 170,
      shape: 'store',
      badge: d.freshness === 'event' ? 'synced in 5 min' : 'synced nightly',
    }),
    node({
      id: 'index',
      label: 'Index',
      sub:
        d.permissions === 'pre'
          ? 'ACL in query'
          : d.permissions === 'post'
            ? 'ACL after fetch'
            : 'no ACL filter',
      x: 548,
      y: 170,
      shape: 'store',
      tone: d.permissions === 'pre' ? 'ok' : d.permissions === 'post' ? 'warn' : 'bad',
    }),
    node({
      id: 'reviewers',
      label: 'Reviewers',
      sub:
        d.approval === 'none'
          ? 'no checkpoint'
          : o.stalled
            ? 'nobody on shift'
            : `${d.reviewers} on shift`,
      x: 708,
      y: 170,
      shape: 'pill',
      off: d.approval === 'none',
      load: d.approval === 'none' || o.stalled ? undefined : Math.min(o.load, 1.5),
      tone:
        d.approval === 'none'
          ? undefined
          : o.stalled || o.rubberStamping
            ? 'bad'
            : advisory
              ? 'warn'
              : undefined,
      badge:
        d.approval === 'none'
          ? undefined
          : advisory
            ? 'model decides to ask'
            : d.approval === 'all'
              ? 'every refund'
              : `over ${money(d.cap)}`,
    }),
    node({
      id: 'policy',
      label: 'Policy check',
      sub: d.policyCheck ? `cap ${money(d.cap)}` : 'off: prompt only',
      x: 872,
      y: 170,
      off: !d.policyCheck,
      tone: d.policyCheck ? 'ok' : undefined,
    }),
    node({
      id: 'desk',
      label: 'Human desk',
      sub: d.escalation ? 'escalation path' : 'not offered',
      x: 68,
      y: 282,
      shape: 'pill',
      off: !d.escalation,
    }),
    node({
      id: 'audit',
      label: 'Audit trail',
      sub: d.audit === 'trace' ? 'append-only' : d.audit === 'logs' ? 'app logs' : 'none',
      x: 708,
      y: 282,
      shape: 'store',
      off: d.audit === 'none',
      tone: d.audit === 'trace' ? 'ok' : d.audit === 'logs' ? 'warn' : undefined,
    }),
    node({
      id: 'payments',
      label: 'Payments tool',
      sub: d.idempotency ? 'idempotent' : 'no idempotency',
      x: 872,
      y: 282,
      tone: d.idempotency ? undefined : 'warn',
      badge: d.breaker ? '+ breaker' : undefined,
    }),
  ]

  const paid: Tone = d.policyCheck ? 'ok' : 'bad'
  const edges: FlowEdge[] = [
    { id: 'ask', from: 'customer', to: 'guard', rate: main },
    { id: 'guard-cache', from: 'guard', to: 'cache', rate: main },
    {
      id: 'cache-retriever',
      from: 'cache',
      to: 'retriever',
      rate: miss,
    },
    { id: 'retriever-router', from: 'retriever', to: 'router', rate: miss },
    { id: 'router-agent', from: 'router', to: 'agent', rate: miss },
    {
      id: 'retriever-index',
      from: 'retriever',
      to: 'index',
      rate: miss * 0.8,
      tone: d.permissions === 'none' ? 'warn' : 'trace',
    },
    {
      id: 'docs-index',
      from: 'docs',
      to: 'index',
      rate: d.freshness === 'event' ? 0.5 : 0.12,
      tone: d.freshness === 'event' ? 'ok' : 'warn',
      dashed: d.freshness === 'nightly',
    },
    {
      id: 'agent-policy',
      from: 'agent',
      to: 'policy',
      rate: refunds,
      tone: d.policyCheck ? 'trace' : 'bad',
      label: 'refund call',
    },
    {
      id: 'policy-payments',
      from: 'policy',
      to: 'payments',
      rate: refunds * auto,
      tone: paid,
      label: auto > 0 ? `auto ${pct(auto)}` : undefined,
    },
    {
      id: 'policy-reviewers',
      from: 'policy',
      to: 'reviewers',
      rate: reviewed > 0 ? Math.max(0.16, refunds * reviewed) : 0,
      tone: advisory ? 'warn' : 'info',
      dashed: advisory,
      off: d.approval === 'none',
    },
    {
      id: 'reviewers-payments',
      from: 'reviewers',
      to: 'payments',
      fromSide: 'b',
      toSide: 'l',
      rate: reviewed > 0 && !o.stalled ? Math.max(0.16, refunds * reviewed) : 0,
      tone: o.rubberStamping ? 'bad' : 'ok',
      off: d.approval === 'none',
      curve: -26,
    },
    {
      id: 'payments-audit',
      from: 'payments',
      to: 'audit',
      rate: d.audit === 'none' ? 0 : 0.3,
      tone: d.audit === 'trace' ? 'ok' : 'warn',
      off: d.audit === 'none',
    },
    {
      id: 'reviewers-audit',
      from: 'reviewers',
      to: 'audit',
      rate: d.audit === 'trace' && reviewed > 0 && !o.stalled ? 0.2 : 0,
      tone: 'ok',
      off: d.audit !== 'trace' || d.approval === 'none',
    },
    {
      id: 'escalate',
      from: 'customer',
      to: 'desk',
      rate: d.escalation ? 0.16 : 0,
      tone: 'info',
      dashed: true,
      off: !d.escalation,
    },
  ]

  if (focus) {
    const mark = (controls: ControlId[], tone: Tone, badge: string) => {
      for (const control of controls) {
        const id = NODE_OF[control]
        const n = nodes.find((candidate) => candidate.id === id)
        if (!n) continue
        n.tone = tone
        n.badge = badge
        // A missing control is the point of the picture: do not ghost it.
        if (tone === 'bad') n.off = false
      }
    }
    mark(focus.stoppedBy, 'ok', 'held here')
    mark(focus.missing, 'bad', 'the gap')
  }

  return { nodes, edges }
}
