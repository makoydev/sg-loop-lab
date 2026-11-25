import type { ReactNode } from 'react'
import { Chip, Segmented, Slider, Toggle } from '@/components/ui'
import { cn } from '@/lib/cn'
import { IMDA, type ImdaDimensionId } from '@/lib/facts'
import {
  BOUNDS,
  CAP_STOPS,
  fmtDuration,
  metrics,
  money,
  pct,
  shareAtOrBelow,
  type ControlId,
  type Design,
  type Evaluation,
} from './logic'

/*
 * The control panel. Every design choice is one field; the panel groups the
 * fields under the four IMDA dimensions (titles read from `facts.ts`) plus a
 * fifth group for retrieval and serving. `ControlField` is exported so the
 * incident replay can show just the controls that matter to one incident.
 */

export type PanelGroup = ImdaDimensionId | 'rag'

const GROUP_FIELDS: Record<PanelGroup, ControlId[]> = {
  bound: ['identity', 'cap', 'tools'],
  accountable: ['approval', 'reviewers'],
  technical: ['policyCheck', 'guardrails', 'idempotency', 'audit', 'breaker', 'rollout'],
  enduser: ['disclosure', 'escalation'],
  rag: ['retrieval', 'chunking', 'freshness', 'permissions', 'cache', 'routing', 'fallback'],
}

type ToggleId = 'guardrails' | 'policyCheck' | 'idempotency' | 'breaker' | 'disclosure' | 'escalation'

const TOGGLES: Record<ToggleId, { label: string; hint: string }> = {
  policyCheck: {
    label: 'Deterministic policy check',
    hint: 'Code outside the model validates each refund against the order record, enforces the cap and routes approvals.',
  },
  guardrails: {
    label: 'Input and output guardrails',
    hint: 'Classifiers that scan messages and answers. Useful, probabilistic, and blind to what they are not shown.',
  },
  idempotency: {
    label: 'Idempotency keys on tool calls',
    hint: 'Each tool call carries a key, so a retry returns the first result instead of paying twice.',
  },
  breaker: {
    label: 'Circuit breaker on the refund tool',
    hint: 'Halts the tool and pages on-call when the refund stream looks abnormal.',
  },
  disclosure: {
    label: 'Tell customers it is an agent',
    hint: 'Said up front, with what it can and cannot do.',
  },
  escalation: {
    label: 'Human escalation path',
    hint: 'A way to reach a person, offered whenever the agent refuses, fails or is unsure.',
  },
}

type ChoiceId = Exclude<ControlId, ToggleId | 'cap' | 'reviewers'>

const CHOICES: Record<
  ChoiceId,
  { label: string; options: { value: string; label: string; hint: string }[] }
> = {
  identity: {
    label: 'Agent identity',
    options: [
      {
        value: 'shared',
        label: 'Shared service account',
        hint: 'The same credentials a dozen other systems use. They can read, and pay, any customer.',
      },
      {
        value: 'scoped',
        label: 'Own scoped identity',
        hint: 'Its own credentials, issued per session and limited to the authenticated customer.',
      },
    ],
  },
  tools: {
    label: 'Tool allow-list',
    options: [
      {
        value: 'narrow',
        label: 'Refund tool only',
        hint: 'One action, one limit. The payments tool itself stops at S$5,000 a call.',
      },
      {
        value: 'broad',
        label: 'Refunds, transfers, profile',
        hint: 'More it can do for a customer, and for an attacker. The per-call limit becomes S$20,000.',
      },
    ],
  },
  approval: {
    label: 'Human approval checkpoint',
    options: [
      {
        value: 'none',
        label: 'None',
        hint: 'Nothing waits for a person. Above the cap the answer is simply no, if the cap is enforced at all.',
      },
      {
        value: 'above-cap',
        label: 'Above the cap',
        hint: 'Refunds over the cap wait for a named reviewer. Everything under it goes straight through.',
      },
      {
        value: 'all',
        label: 'Every refund',
        hint: 'Nothing moves without a person. Count the reviews a month before you choose this.',
      },
    ],
  },
  audit: {
    label: 'Audit trail',
    options: [
      { value: 'none', label: 'None', hint: 'Nothing is kept. What happened is whatever people remember.' },
      {
        value: 'logs',
        label: 'Application logs',
        hint: 'Tool calls in ordinary logs. Editable, and silent about what the model read.',
      },
      {
        value: 'trace',
        label: 'Append-only trace',
        hint: 'Prompts, retrieved documents, tool calls and approvals, written once and alertable.',
      },
    ],
  },
  rollout: {
    label: 'Rollout',
    options: [
      { value: 'full', label: 'Full launch', hint: 'Every customer on day one.' },
      {
        value: 'staged',
        label: 'Staged',
        hint: 'Trained staff and a small cohort first, widening as the evaluations hold.',
      },
    ],
  },
  retrieval: {
    label: 'Retrieval',
    options: [
      { value: 'vector', label: 'Vector only', hint: 'Fast and cheap. Weak on exact terms such as fee names and clause numbers.' },
      {
        value: 'hybrid',
        label: 'Hybrid + rerank',
        hint: 'Keyword and vector search, reranked. Better grounding, about 170 ms slower.',
      },
    ],
  },
  chunking: {
    label: 'Chunking',
    options: [
      { value: 'fixed', label: 'Fixed size', hint: 'Splits every 512 tokens, wherever that falls.' },
      {
        value: 'structure',
        label: 'Structure-aware',
        hint: 'Splits on headings and clauses, so a rule stays with its exception.',
      },
    ],
  },
  freshness: {
    label: 'Index freshness',
    options: [
      { value: 'nightly', label: 'Nightly batch', hint: 'The whole index is rebuilt at 02:00.' },
      {
        value: 'event',
        label: 'Event-driven',
        hint: 'A changed document is re-embedded within about five minutes.',
      },
    ],
  },
  permissions: {
    label: 'Document permissions',
    options: [
      { value: 'none', label: 'None', hint: 'Any document can be retrieved for anyone.' },
      {
        value: 'post',
        label: 'Filter after fetch',
        hint: 'Restricted documents are fetched, then dropped in application code.',
      },
      {
        value: 'pre',
        label: 'Filter in the query',
        hint: 'The permission filter is part of the search, so restricted text is never fetched.',
      },
    ],
  },
  cache: {
    label: 'Semantic cache',
    options: [
      { value: 'off', label: 'Off', hint: 'Every question pays for retrieval and a model call.' },
      {
        value: 'on',
        label: 'Shared',
        hint: 'Keyed by what a question means. Fast, cheap, and indifferent to who is asking or what changed.',
      },
      {
        value: 'scoped',
        label: 'Scoped + invalidated',
        hint: 'Personal answers are keyed per user, and entries are evicted when a document they cite changes.',
      },
    ],
  },
  routing: {
    label: 'Model routing',
    options: [
      { value: 'large', label: 'Large model for all', hint: 'Best answers, slowest first token, highest bill.' },
      {
        value: 'cascade',
        label: 'Small first',
        hint: 'A small model answers most turns and hands the hard ones up.',
      },
    ],
  },
  fallback: {
    label: 'Provider fallback',
    options: [
      { value: 'none', label: 'None', hint: 'If the provider is down, so is the agent.' },
      {
        value: 'secondary',
        label: 'Second provider',
        hint: 'Fail over to another provider’s model, contracted and evaluated in advance.',
      },
      {
        value: 'degrade',
        label: 'Degrade',
        hint: 'Retrieval-only answers, actions off, and a handoff to a person.',
      },
    ],
  },
}

function isToggle(id: ControlId): id is ToggleId {
  return id in TOGGLES
}

function FieldShell({
  label,
  right,
  children,
  hint,
}: {
  label: ReactNode
  right?: ReactNode
  children: ReactNode
  hint?: ReactNode
}) {
  return (
    <div className="px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13.5px] font-medium text-film-text">{label}</span>
        {right}
      </div>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1.5 text-[12px] leading-snug text-film-muted">{hint}</p>}
    </div>
  )
}

function Enforcement({ on }: { on: boolean }) {
  return (
    <Chip surface="film" tone={on ? 'ok' : 'warn'} dot>
      {on ? 'enforced in code' : 'prompt only'}
    </Chip>
  )
}

function Stat({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[11px] text-film-muted">{label}</div>
      <div className={cn('num mt-0.5 text-[14px]', alert ? 'text-f-bad' : 'text-film-text')}>
        {value}
      </div>
    </div>
  )
}

export function ControlField({
  id,
  design,
  evaluation,
  onChange,
}: {
  id: ControlId
  design: Design
  evaluation: Evaluation
  onChange: (next: Design) => void
}) {
  if (isToggle(id)) {
    const meta = TOGGLES[id]
    const on = metrics({ ...design, [id]: true })
    const off = metrics({ ...design, [id]: false })
    const cost = Math.round(on.cost.total - off.cost.total)
    const ms = Math.round(on.ttftMs - off.ttftMs)
    return (
      <Toggle
        surface="film"
        checked={design[id]}
        onChange={(checked) => onChange({ ...design, [id]: checked })}
        label={meta.label}
        hint={meta.hint}
        badge={
          cost !== 0 || ms !== 0 ? (
            <span className="num shrink-0 text-right text-[11px] leading-tight text-film-muted">
              {cost !== 0 && <span className="block">+{money(cost)}</span>}
              {ms !== 0 && <span className="block">+{ms} ms</span>}
            </span>
          ) : undefined
        }
      />
    )
  }

  if (id === 'cap') {
    const index = Math.max(0, CAP_STOPS.indexOf(design.cap))
    return (
      <div>
        <Slider
          surface="film"
          label="Auto-approve refund cap"
          min={0}
          max={CAP_STOPS.length - 1}
          value={index}
          onChange={(i) => onChange({ ...design, cap: CAP_STOPS[i] ?? design.cap })}
          valueLabel={money(design.cap)}
        />
        <div className="flex flex-wrap items-center gap-2 px-2.5 pb-2">
          <Enforcement on={design.policyCheck} />
          <span className="text-[12px] leading-snug text-film-muted">
            {design.policyCheck
              ? `${pct(shareAtOrBelow(design.cap))} of refund requests are at or under it.`
              : 'Until the deterministic check is on, this number is a sentence in a prompt.'}
          </span>
        </div>
      </div>
    )
  }

  if (id === 'reviewers') {
    const o = evaluation.oversight
    const none = design.approval === 'none'
    let verdict: { text: string; bad: boolean }
    if (none) {
      verdict = { text: 'There is no checkpoint, so nobody is asked to review anything.', bad: false }
    } else if (o.reviewsPerMonth === 0) {
      verdict = { text: 'The cap is so high that nothing ever reaches a reviewer.', bad: true }
    } else if (o.stalled) {
      verdict = {
        text: 'Requests are waiting and nobody is on shift. Nothing that needs a person will ever be approved.',
        bad: true,
      }
    } else if (o.rubberStamping) {
      verdict = {
        text: `The queue is ${o.load.toFixed(1)} times what this team can read properly. Reviews have shrunk to ${Math.round(o.reviewSeconds)} seconds and the override rate has fallen to ${pct(o.overrideRate, 1)}. Short reviews and few overrides are what automation bias looks like in a queue, and the framework flags that bias as a risk to human oversight.`,
        bad: true,
      }
    } else {
      verdict = {
        text: `Each request gets about ${Math.round(o.reviewSeconds / 60)} minutes of a person’s attention, and ${pct(o.overrideRate, 0)} are rejected or changed.`,
        bad: false,
      }
    }
    return (
      <div>
        <Slider
          surface="film"
          label="Reviewers on shift"
          min={0}
          max={12}
          value={design.reviewers}
          onChange={(reviewers) => onChange({ ...design, reviewers })}
          valueLabel={design.reviewers}
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-2.5 pb-1 sm:grid-cols-4">
          <Stat label="Reviews a month" value={Math.round(o.reviewsPerMonth).toLocaleString('en-SG')} />
          <Stat
            label="Time per review"
            value={none || o.reviewSeconds === 0 ? 'n/a' : `${Math.round(o.reviewSeconds)} s`}
            alert={o.rubberStamping}
          />
          <Stat
            label="Override rate"
            value={none || o.reviewSeconds === 0 ? 'n/a' : pct(o.overrideRate, 1)}
            alert={o.rubberStamping}
          />
          <Stat
            label="Typical wait"
            value={none || o.reviewsPerMonth === 0 ? 'n/a' : fmtDuration(o.waitMinutes)}
            alert={o.stalled || o.rubberStamping}
          />
        </div>
        <p
          className={cn(
            'px-2.5 pt-1.5 pb-2 text-[12px] leading-snug',
            verdict.bad ? 'text-f-warn' : 'text-film-muted',
          )}
        >
          {verdict.text}
        </p>
      </div>
    )
  }

  const meta = CHOICES[id]
  const value = design[id]
  const selected = meta.options.find((option) => option.value === value)
  return (
    <FieldShell
      label={meta.label}
      right={id === 'approval' && design.approval !== 'none' ? <Enforcement on={design.policyCheck} /> : undefined}
      hint={
        <>
          {selected?.hint}
          {id === 'approval' && design.approval !== 'none' && !design.policyCheck && (
            <span className="text-f-warn">
              {' '}
              Without the deterministic check it is the model that decides when to ask. An injected
              model will not ask.
            </span>
          )}
          {id === 'permissions' && (
            <span> Counts toward dimension 1: it bounds what the agent can read.</span>
          )}
        </>
      }
    >
      <div className="max-w-full">
        <Segmented
          surface="film"
          size="sm"
          label={meta.label}
          value={value}
          onChange={(next) => onChange({ ...design, [id]: next } as Design)}
          options={meta.options.map((option) => ({ value: option.value, label: option.label }))}
        />
      </div>
    </FieldShell>
  )
}

/* ── the panel ────────────────────────────────────────────────────────── */

const RAG_GROUP = {
  title: 'Retrieval and serving',
  gist: 'Not a governance dimension. These decide whether the agent is right, fast and affordable, and two of them decide whether it leaks.',
}

export function ControlPanel({
  design,
  evaluation,
  onChange,
  group,
  onGroup,
}: {
  design: Design
  evaluation: Evaluation
  onChange: (next: Design) => void
  group: PanelGroup
  onGroup: (group: PanelGroup) => void
}) {
  const dimension = IMDA.dimensions.find((dim) => dim.id === group)
  const tabs: { id: PanelGroup; n: string; name: string; score?: number }[] = [
    ...IMDA.dimensions.map((dim) => ({
      id: dim.id as PanelGroup,
      n: String(dim.n),
      name: dim.short,
      score: evaluation.coverage[dim.id].score,
    })),
    { id: 'rag', n: '+', name: RAG_GROUP.title },
  ]

  return (
    <div className="rounded-xl border border-film-rule bg-film-2/80">
      <div className="grid md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="border-b border-film-rule/70 p-2 md:border-r md:border-b-0">
          <div role="tablist" aria-label="Control groups" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {tabs.map((tab) => {
              const active = tab.id === group
              const met = tab.score != null && tab.score >= BOUNDS.coverage
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onGroup(tab.id)}
                  className={cn(
                    'min-w-[10.5rem] shrink-0 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 md:min-w-0',
                    active ? 'bg-film-3' : 'hover:bg-film-3/60',
                  )}
                >
                  <span className="flex items-baseline gap-2">
                    <span
                      className={cn(
                        'num flex size-[18px] shrink-0 items-center justify-center rounded text-[11px]',
                        active ? 'bg-line text-white' : 'bg-film-3 text-film-muted',
                      )}
                    >
                      {tab.n}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[12.5px] font-medium',
                        active ? 'text-film-text' : 'text-film-muted',
                      )}
                    >
                      {tab.name}
                    </span>
                    {tab.score != null && (
                      <span className={cn('num text-[12.5px]', met ? 'text-f-ok' : 'text-f-warn')}>
                        {tab.score}
                      </span>
                    )}
                  </span>
                  {tab.score != null && (
                    <span className="relative mt-1.5 block h-1 rounded-full bg-film-3">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out"
                        style={{
                          width: `${tab.score}%`,
                          backgroundColor: met ? 'var(--color-f-ok)' : 'var(--color-f-warn)',
                        }}
                      />
                      <span
                        className="absolute -top-0.5 h-2 w-px bg-film-text/80"
                        style={{ left: `${BOUNDS.coverage}%` }}
                      />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="hidden px-2.5 pt-2 pb-1 text-[11px] leading-snug text-film-muted md:block">
            Scores out of 100 are this app’s reading of how much of each dimension your design
            exercises. The tick is the bar of {BOUNDS.coverage}. The framework itself has no scores.
          </p>
        </div>

        <div role="tabpanel" className="min-w-0 p-2">
          <div className="px-2.5 pt-1.5 pb-2">
            <div className="kicker text-line">
              {dimension ? `Dimension ${dimension.n} of ${IMDA.dimensions.length}` : 'Plus'}
            </div>
            <div className="mt-1 text-[15px] leading-snug font-semibold text-film-text">
              {dimension ? dimension.title : RAG_GROUP.title}
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-film-muted">
              {dimension ? dimension.gist : RAG_GROUP.gist}
            </p>
          </div>
          <div className="flex flex-col divide-y divide-film-rule/50">
            {GROUP_FIELDS[group].map((id) => (
              <div key={id} className="py-0.5">
                <ControlField id={id} design={design} evaluation={evaluation} onChange={onChange} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
