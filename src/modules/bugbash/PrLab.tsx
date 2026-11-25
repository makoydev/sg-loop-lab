import { ArrowRight, GitPullRequest } from 'lucide-react'
import { useState } from 'react'
import { Brief } from '@/components/Brief'
import { HintLadder } from '@/components/HintLadder'
import { Takeaway } from '@/components/Takeaway'
import { Chip, Kicker } from '@/components/ui'
import { to } from '@/lib/router'
import { BugXRay } from './BugXRay'
import type { ReviewResult } from './logic'
import { ReviewWorkspace } from './ReviewWorkspace'
import { Rich } from './Rich'
import type { PullRequest } from './types'

/** The order of questions that finds behavioural bugs, whatever the code. */
const READING_ORDER = [
  {
    title: 'Side effects',
    body: 'Find every line that moves money, writes state or calls another system.',
  },
  { title: 'Identity', body: 'Whose permissions is each of those lines running with?' },
  { title: 'Failure', body: 'What happens on a timeout, on a retry, with two at once?' },
  { title: 'The docs', body: 'Does each dependency really behave the way the code assumes?' },
]

/** How the PR came to exist: one loose sentence in, a confident diff out. */
function Origin({ pr }: { pr: PullRequest }) {
  const lines = pr.files.reduce((sum, f) => sum + f.code.split('\n').length, 0)
  return (
    <div className="flex h-full flex-col gap-3 p-1.5">
      <Kicker>What your teammate typed</Kicker>
      <p className="rounded-xl border border-rule bg-card px-3.5 py-3 font-mono text-[13px] leading-relaxed text-ink">
        <span className="text-ink-3 select-none" aria-hidden>
          &gt;{' '}
        </span>
        {pr.teammatePrompt}
      </p>
      <Kicker className="mt-1">What came back</Kicker>
      <div className="flex items-start gap-2.5 text-[14px] leading-snug text-ink-2">
        <GitPullRequest size={16} className="mt-0.5 shrink-0 text-line" />
        <span>
          <span className="num text-ink-3">#{pr.number}</span>{' '}
          <span className="font-medium text-ink">{pr.title}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip>
          {pr.files.length} {pr.files.length === 1 ? 'file' : 'files'}
        </Chip>
        <Chip>+{lines} lines</Chip>
        <Chip tone="ok" dot>
          all tests passing
        </Chip>
      </div>
      <p className="mt-auto pt-1 text-[12.5px] leading-snug text-ink-3">
        One sentence in, {lines} lines out. The prompt never said what has to stay true, so nothing
        in the code makes sure of it.
      </p>
    </div>
  )
}

/** One pull request, from brief to takeaway. */
export function PrLab({ pr }: { pr: PullRequest }) {
  const [solved, setSolved] = useState(false)
  const [review, setReview] = useState<ReviewResult | null>(null)
  const t = pr.takeaway

  return (
    <div className="flex flex-col gap-8">
      <Brief kicker={`Ticket ${pr.ticket.id}`} tags={pr.tags} aside={<Origin pr={pr} />}>
        {pr.ticket.paragraphs.map((paragraph) => (
          <p key={paragraph}>
            <Rich text={paragraph} />
          </p>
        ))}
      </Brief>

      <HintLadder
        id={pr.ladderId}
        solved={solved}
        struggle={
          <ReviewWorkspace pr={pr} onSolved={() => setSolved(true)} onReview={setReview} />
        }
        nudge={
          <>
            <p>
              There are {pr.bugs.length} problems in this pull request. None of them is about
              style, and no single line looks wrong on its own.
            </p>
            <ul className="my-2 flex flex-col gap-1">
              {pr.bugs.map((bug) => (
                <li key={bug.id} className="flex gap-2">
                  <span className="mt-[9px] size-1 shrink-0 rounded-full bg-warn" aria-hidden />
                  <span>
                    <strong>{bug.category}</strong>, somewhere in{' '}
                    <span className="num text-[13px]">{bug.fn}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p>
              Read for behaviour. Where does money or data move, whose permissions is it moving
              under, and what happens when the same thing is asked for twice? Then open the Docs
              tab and check that each call does what the PR description says it does.
            </p>
          </>
        }
        xray={<BugXRay pr={pr} review={review} />}
        takeaway={
          <Takeaway
            headline={t.headline}
            points={t.points.map((point) => ({
              title: point.title,
              body: (
                <p>
                  <Rich text={point.body} />
                </p>
              ),
            }))}
            facts={t.facts}
            traps={t.traps.map((trap) => (
              <Rich key={trap} text={trap} />
            ))}
            sayIt={t.sayIt}
          >
            <Kicker>The reading order that finds these</Kicker>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {READING_ORDER.map((step, i) => (
                <li key={step.title} className="rounded-xl border border-rule bg-paper-2/60 px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="num flex size-5 items-center justify-center rounded-full bg-line text-[11px] font-semibold text-white">
                      {i + 1}
                    </span>
                    <span className="text-[14px] font-semibold text-ink">{step.title}</span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{step.body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-[13px] text-ink-3">
              Style, naming and formatting come last. They are the cheapest things to find and the
              least likely to matter.
            </p>
            {t.seeAlso && (
              <p className="mt-5 border-t border-rule pt-4 text-[13.5px] leading-relaxed text-ink-2">
                {t.seeAlso.text}{' '}
                <a
                  href={to(t.seeAlso.path)}
                  className="inline-flex items-center gap-1 font-medium text-ink underline decoration-rule-2 underline-offset-4 hover:decoration-ink"
                >
                  {t.seeAlso.label}
                  <ArrowRight size={14} />
                </a>
              </p>
            )}
          </Takeaway>
        }
      />
    </div>
  )
}
