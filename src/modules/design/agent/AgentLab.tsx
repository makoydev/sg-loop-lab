import { ArrowUpRight, Check, Minus, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Brief } from '@/components/Brief'
import { HintLadder } from '@/components/HintLadder'
import { Takeaway } from '@/components/Takeaway'
import { Button, Kicker } from '@/components/ui'
import { cn } from '@/lib/cn'
import { FEAT, IMDA, MAS, PDPA } from '@/lib/facts'
import { IncidentReplay } from './IncidentReplay'
import {
  BOUNDS,
  evaluate,
  money,
  REFERENCE,
  SCALE,
  STARTING,
  type Design,
  type Evaluation,
} from './logic'
import { Sandbox } from './Sandbox'

/* ── the vocabulary card beside the prompt ────────────────────────────── */

function SourceLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 font-medium text-ink underline decoration-rule-2 underline-offset-4 hover:decoration-ink"
    >
      {children}
      <ArrowUpRight size={13} aria-hidden />
    </a>
  )
}

function Vocabulary() {
  return (
    <div className="flex h-full flex-col gap-4 rounded-xl border border-rule bg-card p-4">
      <Kicker>The vocabulary the panel will use</Kicker>

      <div>
        <div className="text-[14px] leading-snug font-semibold text-ink">{IMDA.name}</div>
        <div className="num mt-0.5 text-[11.5px] text-ink-3">
          launched {IMDA.launched} · {IMDA.updated}
        </div>
        <ol className="mt-2 flex flex-col gap-1">
          {IMDA.dimensions.map((dim) => (
            <li key={dim.id} className="flex gap-2 text-[13px] leading-snug text-ink-2">
              <span className="num mt-px flex size-[18px] shrink-0 items-center justify-center rounded bg-line/15 text-[11px] font-semibold text-line">
                {dim.n}
              </span>
              {dim.title}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[12px] leading-snug text-ink-3">{IMDA.status}</p>
      </div>

      <div className="border-t border-rule pt-3">
        <div className="text-[14px] leading-snug font-semibold text-ink">{MAS.name}</div>
        <div className="num mt-0.5 text-[11.5px] text-ink-3">
          {MAS.owner} · issued {MAS.issued}
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink-2">
          Rates how material an AI use case is on{' '}
          {MAS.materiality.map((dim, i) => (
            <span key={dim.id}>
              <span className="font-semibold text-ink">{dim.title.toLowerCase()}</span>
              {i < MAS.materiality.length - 2 ? ', ' : i === MAS.materiality.length - 2 ? ' and ' : '.'}
            </span>
          ))}
        </p>
        <p className="mt-2 text-[12px] leading-snug text-ink-3">{MAS.status}</p>
      </div>

      <p className="mt-auto border-t border-rule pt-3 text-[12px] leading-snug text-ink-3">
        A dated summary. Read <SourceLink href={IMDA.url}>the framework</SourceLink> and{' '}
        <SourceLink href={MAS.url}>the guidelines</SourceLink> before you quote either.
      </p>
    </div>
  )
}

/* ── the dimension → engineering table in the takeaway ────────────────── */

function DimensionTable({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div>
      <Kicker>The four dimensions, as engineering</Kicker>
      <div className="thin-scroll mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-rule-2">
              <th className="kicker w-[34%] py-2 pr-4 text-ink-3">IMDA dimension</th>
              <th className="kicker py-2 pr-4 text-ink-3">What carries it in this sandbox</th>
              <th className="kicker py-2 text-right text-ink-3">Your design</th>
            </tr>
          </thead>
          <tbody>
            {IMDA.dimensions.map((dim) => {
              const reading = evaluation.coverage[dim.id]
              const covered = reading.score >= BOUNDS.coverage
              return (
                <tr key={dim.id} className="border-b border-rule align-top">
                  <td className="py-3 pr-4">
                    <div className="flex gap-2.5">
                      <span className="num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-line text-[11.5px] font-semibold text-white">
                        {dim.n}
                      </span>
                      <div>
                        <div className="text-[14px] leading-snug font-semibold text-ink">
                          {dim.title}
                        </div>
                        <p className="mt-1 text-[12.5px] leading-snug text-ink-3">{dim.gist}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <ul className="flex flex-col gap-1.5">
                      {reading.items.map((item) => {
                        const full = item.points >= item.max
                        const none = item.points === 0
                        return (
                          <li
                            key={`${item.control}-${item.label}`}
                            className="flex items-start gap-2 text-[13px] leading-snug"
                          >
                            <span
                              className={cn(
                                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                                full
                                  ? 'bg-ok text-white'
                                  : none
                                    ? 'bg-paper-3 text-ink-3'
                                    : 'bg-warn-wash text-warn',
                              )}
                            >
                              {full ? (
                                <Check size={11} strokeWidth={3} />
                              ) : none ? (
                                <X size={11} strokeWidth={3} />
                              ) : (
                                <Minus size={11} strokeWidth={3} />
                              )}
                            </span>
                            <span className={none ? 'text-ink-3' : 'text-ink-2'}>
                              {item.label}
                              <span className="sr-only">
                                {full ? ' (in your design)' : none ? ' (not in your design)' : ' (partly)'}
                              </span>
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </td>
                  <td className="py-3 text-right">
                    <span className={cn('num text-[20px] leading-none', covered ? 'text-ok' : 'text-bad')}>
                      {reading.score}
                    </span>
                    <span className="num text-[12px] text-ink-3"> / 100</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-ink-3">
        {IMDA.status} Which control serves which dimension, and the scores, are this app’s reading
        of it. In the room, quote <SourceLink href={IMDA.url}>the framework PDF</SourceLink>, not
        this app.
      </p>
    </div>
  )
}

/* ── the lab ──────────────────────────────────────────────────────────── */

export default function AgentLab() {
  const [design, setDesign] = useState<Design>(STARTING)
  const evaluation = useMemo(() => evaluate(design), [design])
  const reference = useMemo(() => evaluate(REFERENCE), [])
  const onReference = design === REFERENCE

  return (
    <div className="flex flex-col gap-8">
      <Brief
        tags={['System design round', '45 to 60 min', 'Banks · regulated fintech']}
        aside={<Vocabulary />}
      >
        <p>
          We are a digital bank in Singapore. We want a customer-support agent that answers policy
          questions from about <strong>{SCALE.documents.toLocaleString('en-SG')} internal documents</strong>
          , and that can act: it issues fee refunds through our payments tool. Plan for around{' '}
          <strong>{SCALE.conversations.toLocaleString('en-SG')} conversations a month</strong>.
        </p>
        <p>
          Design it to be useful and affordable, and so that you can tell our risk committee exactly
          what it can and cannot do. They will ask in the language of the MAS AI risk guidelines and
          the IMDA agentic AI framework. So will I.
        </p>
      </Brief>

      <HintLadder
        id="design/agent"
        solved={evaluation.solved}
        struggle={
          <div className="flex flex-col gap-3">
            <p className="max-w-3xl text-[14.5px] leading-relaxed text-ink-2">
              This is the demo that impressed the steering committee: fast, cheap, and able to pay
              out S$5,000 on the word of whatever text it last read. Change the design until the
              risk committee’s scorecard is fully met. Every control costs something, so the
              interesting part is what you choose not to switch on.
            </p>
            <Sandbox
              design={design}
              evaluation={evaluation}
              onChange={setDesign}
              onReset={() => setDesign(STARTING)}
            />
          </div>
        }
        nudge={
          <>
            <p>
              Treat autonomy as a budget. What can the agent do with no person involved, and what
              does the worst single action cost? That number is yours to set.
            </p>
            <p>
              Then go through your limits and ask of each one: is this enforced by{' '}
              <strong>code outside the model</strong>, or by <strong>words inside the prompt</strong>?
              An attacker gets to rewrite the second kind.
            </p>
          </>
        }
        xray={<IncidentReplay design={design} evaluation={evaluation} onChange={setDesign} />}
        takeaway={
          <Takeaway
            headline="Decide what the agent may do alone, enforce it in code outside the model, and governance becomes a description of your architecture."
            points={[
              {
                title: 'Put the limits outside the model',
                body: (
                  <p>
                    A cap in a prompt is a request. A cap in the gateway in front of the tool is a
                    limit. Validate every tool call against ground truth, here the customer’s own
                    order record, enforce the cap there, and route approvals from there. Then the
                    worst an injected model can do is the most you had already decided to allow.
                  </p>
                ),
              },
              {
                title: 'One least-privilege identity, on every path to the data',
                body: (
                  <p>
                    Give the agent its own credentials, scoped to the customer in the session. Then
                    check the same permission in three places: the tool API, inside the retrieval
                    query, and in the cache key. One unscoped path is enough to leak, and the cache
                    is the one people forget.
                  </p>
                ),
              },
              {
                title: 'Make side effects idempotent and answers fresh',
                body: (
                  <p>
                    Retries happen below your checks, so the refund call carries a key and a retry
                    returns the first result. Freshness is two clocks, the index and the cache.
                    Event-driven indexing with invalidation on change closes both. A nightly rebuild
                    closes neither.
                  </p>
                ),
              },
              {
                title: 'Spend human attention where it changes the outcome',
                body: (
                  <p>
                    “A person approves everything” fails on arithmetic: twelve thousand reviews a
                    month either costs more than the agent saves, or gets 45 seconds each. Set the
                    cap so the queue stays readable, then watch override rate and review time, which
                    the framework names as the signs of automation bias.
                  </p>
                ),
              },
              {
                title: 'Then translate, once',
                body: (
                  <p>
                    Only now reach for the vocabulary. Those moves are the four dimensions of the{' '}
                    {IMDA.short}. How much the agent decides alone is what MAS calls reliance, next
                    to impact and complexity. The {FEAT.name} from {FEAT.issued} still apply, and a
                    customer’s complaint history is {PDPA.short} territory before it is a retrieval
                    problem.
                  </p>
                ),
              },
            ]}
            facts={[
              { label: IMDA.short, value: `${IMDA.dimensions.length} dimensions` },
              { label: 'Last updated', value: IMDA.updated },
              { label: MAS.short, value: `issued ${MAS.issued}` },
              { label: 'One passing design', value: `${money(reference.metrics.cost.total)} / mo` },
              { label: 'Its worst single action', value: money(reference.metrics.blast) },
              {
                label: 'Refunds it pays alone',
                value: `${Math.round(reference.metrics.autonomyShare * 100)}%`,
              },
            ]}
            traps={[
              'Opening with the frameworks. Lead with the mechanism, then name the dimension it serves.',
              'Calling guardrails the control for money movement. They are probabilistic. The limit has to be deterministic.',
              'Saying a human approves everything without doing the arithmetic on the queue.',
              'Describing either document as law, or quoting this app instead of the source.',
            ]}
            sayIt={`I'd treat autonomy as a budget. Under ${money(REFERENCE.cap)} the agent pays on its own, because a gateway outside the model checks the fee against the customer's record and enforces that number. Above it a named reviewer decides, and I've sized the cap so they can read what they approve. That is also my answer to the risk committee: it bounds the risk upfront, keeps a person accountable, puts the controls in code, and tells the customer what they are talking to.`}
          >
            <div className="flex flex-col gap-6">
              <DimensionTable evaluation={evaluation} />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-rule bg-paper-2/60 px-4 py-3">
                <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink-2">
                  {onReference
                    ? 'The reference design is loaded. Go back to the challenge and take one control away at a time to see which targets it was carrying.'
                    : 'Stuck, or curious? Load one design that meets every target, then go back and take controls away one at a time to see what each was carrying. There are other passing designs.'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={onReference}
                  onClick={() => setDesign(REFERENCE)}
                  icon={<Sparkles size={14} />}
                >
                  Load a passing design
                </Button>
              </div>
            </div>
          </Takeaway>
        }
      />
    </div>
  )
}
