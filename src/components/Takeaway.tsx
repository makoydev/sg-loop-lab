import { MessageSquare, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Card, Kicker } from './ui'

/**
 * The last rung of every hint ladder: one headline insight, a few talking
 * points that separate senior from mid-level, and a line to say out loud.
 */
export function Takeaway({
  headline,
  points,
  sayIt,
  facts,
  traps,
  children,
  className,
}: {
  /** The one-sentence insight. */
  headline: ReactNode
  /** Three or four talking points. */
  points: { title: ReactNode; body: ReactNode }[]
  /** A sentence worth saying verbatim in the interview. */
  sayIt?: ReactNode
  /** Quick reference facts: complexity, limits, costs. */
  facts?: { label: ReactNode; value: ReactNode }[]
  /** Ways candidates lose the signal. */
  traps?: ReactNode[]
  children?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="border-b border-rule bg-line/[0.06] px-6 py-6 sm:px-8">
        <Kicker className="text-line">Senior takeaway</Kicker>
        <p className="display mt-2 max-w-3xl text-[clamp(1.35rem,2.6vw,1.8rem)] leading-[1.18] font-[540] text-ink">
          {headline}
        </p>
      </div>

      <div className="grid gap-x-10 gap-y-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <ol className="flex flex-col gap-5">
          {points.map((point, i) => (
            <li key={i} className="flex gap-4">
              <span className="num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-line/40 text-[11.5px] font-semibold text-line">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-ink">{point.title}</div>
                <div className="prose-lab mt-1 text-[14.5px] leading-relaxed text-ink-2">
                  {point.body}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <aside className="flex flex-col gap-5">
          {facts && facts.length > 0 && (
            <div>
              <Kicker>At a glance</Kicker>
              <dl className="mt-2 divide-y divide-rule border-y border-rule">
                {facts.map((fact, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 py-2">
                    <dt className="text-[13px] text-ink-3">{fact.label}</dt>
                    <dd className="num text-right text-[13px] font-medium text-ink">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {traps && traps.length > 0 && (
            <div>
              <Kicker className="flex items-center gap-1.5 text-bad">
                <TriangleAlert size={12} /> Where the signal is lost
              </Kicker>
              <ul className="mt-2 flex flex-col gap-2">
                {traps.map((trap, i) => (
                  <li key={i} className="border-l-2 border-bad/40 pl-3 text-[13px] leading-snug text-ink-2">
                    {trap}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {children && <div className="border-t border-rule px-6 py-6 sm:px-8">{children}</div>}

      {sayIt && (
        <div className="flex gap-4 border-t border-rule bg-ink px-6 py-5 text-paper sm:px-8">
          <MessageSquare size={18} className="mt-1 shrink-0 text-trace" aria-hidden />
          <div>
            <div className="kicker text-trace">Say it out loud</div>
            <p className="display mt-1.5 max-w-3xl text-[17px] leading-snug font-[420] italic">
              {sayIt}
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}
