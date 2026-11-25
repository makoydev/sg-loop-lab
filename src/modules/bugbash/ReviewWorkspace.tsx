import {
  BookOpen,
  Bot,
  Check,
  CornerDownRight,
  Eye,
  Flag as FlagIcon,
  GitPullRequest,
  Lock,
  RotateCcw,
  Search,
  Send,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { CodePanel, type LineTone } from '@/components/CodePanel'
import { Button, Card, Chip, Kicker, Segmented } from '@/components/ui'
import { cn, type Tone } from '@/lib/cn'
import {
  bugsAt,
  describeLocation,
  diagnoseFlag,
  flagKey,
  isCleanReview,
  lineText,
  scoreReview,
  toggleFlag,
  type Finding,
  type Flag,
  type ReviewResult,
} from './logic'
import { Rich } from './Rich'
import { Snippet } from './Snippet'
import type { PullRequest, Severity } from './types'

/*
 * The struggle: review an AI-written pull request.
 *
 * Read the files, flag the lines you would block the merge for, name what is
 * wrong with each, and submit. Found bugs are confirmed and locked in; false
 * alarms are explained; anything missed stays hidden so you can keep hunting.
 */

const SEVERITY_TONE: Record<Severity, Tone> = { critical: 'bad', high: 'warn', medium: 'neutral' }

const fileName = (path: string) => path.split('/').pop() ?? path

/* ── reference panel: what the PR claims, and what the docs say ───────── */

function Description({ pr }: { pr: PullRequest }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
        <span className="flex size-6 items-center justify-center rounded-full bg-line/10 text-line">
          <Bot size={14} />
        </span>
        <span>
          <span className="font-medium text-ink-2">assistant</span> opened{' '}
          <span className="num">#{pr.number}</span>
        </span>
      </div>
      <p className="text-[14px] leading-snug font-semibold text-ink">{pr.description.summary}</p>
      <ul className="flex flex-col gap-2">
        {pr.description.bullets.map((bullet) => (
          <li key={bullet} className="flex gap-2 text-[13px] leading-snug text-ink-2">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
      <p className="text-[13px] font-medium text-ink-2">{pr.description.closing}</p>
      <p className="border-t border-rule pt-2.5 text-[12px] leading-snug text-ink-3">
        Written by the assistant. Every sentence is a claim, and none of them has been checked.
      </p>
    </div>
  )
}

function Docs({ pr }: { pr: PullRequest }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] leading-snug text-ink-3">{pr.docs.intro}</p>
      {pr.docs.entries.map((entry) => (
        <section key={entry.title} className="flex flex-col gap-2">
          <div role="heading" aria-level={4} className="num text-[12.5px] font-semibold text-ink">
            {entry.title}
          </div>
          {entry.signature && <Snippet code={entry.signature} lang={entry.lang} />}
          <ul className="flex flex-col gap-1.5">
            {entry.notes.map((note) => (
              <li key={note} className="flex gap-2 text-[12.5px] leading-snug text-ink-2">
                <span className="mt-[7px] size-1 shrink-0 rounded-full bg-line" aria-hidden />
                <span>
                  <Rich text={note} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/* ── results ──────────────────────────────────────────────────────────── */

/** One bug in the results: confirmed, half-found, still hidden, or revealed. */
export function FindingCard({
  pr,
  finding,
  revealed,
  onShow,
}: {
  pr: PullRequest
  finding: Finding
  revealed: boolean
  onShow: () => void
}) {
  const { bug, status, flag } = finding

  if (status === 'missed' && !revealed) {
    return (
      <li className="flex items-center gap-3 rounded-xl border border-dashed border-rule-2 bg-card/60 px-4 py-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-paper-3 text-ink-3">
          <Lock size={14} />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-ink-2">Still in there</div>
          <div className="text-[12.5px] text-ink-3">
            One {bug.severity}-severity problem has not been flagged yet.
          </div>
        </div>
      </li>
    )
  }

  const missed = status === 'missed'
  const spotted = status === 'spotted'
  return (
    <li
      className={cn(
        'animate-rise overflow-hidden rounded-xl border bg-card',
        missed ? 'border-bad/40' : spotted ? 'border-warn/45' : 'border-ok/40',
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b px-4 py-2.5',
          missed
            ? 'border-bad/20 bg-bad-wash/60'
            : spotted
              ? 'border-warn/20 bg-warn-wash/60'
              : 'border-ok/20 bg-ok-wash/60',
        )}
      >
        <Chip tone={missed ? 'bad' : spotted ? 'warn' : 'ok'}>
          {missed ? 'Missed' : spotted ? 'Right line, wrong name' : 'Found and named'}
        </Chip>
        <Chip tone={SEVERITY_TONE[bug.severity]}>{bug.severity}</Chip>
        <span className="kicker text-ink-2">{bug.category}</span>
        <button
          type="button"
          onClick={onShow}
          className="num ml-auto inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-ink-2 underline decoration-rule-2 underline-offset-2 hover:text-ink hover:decoration-ink"
        >
          <CornerDownRight size={12} />
          {describeLocation(pr, bug)}
        </button>
      </div>
      <div className="px-4 py-3.5">
        <h4 className="text-[17px] leading-snug font-[560] text-ink">
          <Rich text={bug.title} />
        </h4>
        {spotted && (
          <p className="mt-1.5 text-[13px] leading-snug text-warn">
            {flag?.diagnosis
              ? `You flagged the right place and called it "${flag.diagnosis}". It is "${bug.category}". Rename the flag and submit again to claim it.`
              : `You flagged the right place and did not say why. In the room that is half a finding. It is "${bug.category}".`}
          </p>
        )}
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-[13.5px] leading-relaxed lg:grid-cols-3">
          <div>
            <dt className="kicker text-ink-3">What is wrong</dt>
            <dd className="mt-1 text-ink-2">
              <Rich text={bug.summary} />
            </dd>
          </div>
          <div>
            <dt className="kicker text-ink-3">Why it slips through</dt>
            <dd className="mt-1 text-ink-2">
              <Rich text={bug.plausible} />
            </dd>
          </div>
          <div>
            <dt className="kicker text-ink-3">In production</dt>
            <dd className="mt-1 text-ink-2">
              <Rich text={bug.impact} />
            </dd>
          </div>
        </dl>
      </div>
    </li>
  )
}

function verdictFor(
  result: ReviewResult,
  totalFalseAlarms: number,
  assisted: boolean,
): { tone: Tone; title: string; body: string } {
  const total = result.findings.length
  if (!result.allFound) {
    const left = result.missed
    return {
      tone: 'neutral',
      title: `${result.found} of ${total} found.`,
      body: `${left === 1 ? 'One is' : `${left} are`} still in there. Your confirmed findings are locked in. Keep reading, ask for a nudge, or reveal what you missed.`,
    }
  }
  if (assisted) {
    return {
      tone: 'neutral',
      title: 'All found, with help.',
      body: 'Watch each one happen on the X-Ray, then try another pull request unaided.',
    }
  }
  if (isCleanReview(result, totalFalseAlarms)) {
    const named = result.diagnosed === total
    return {
      tone: 'ok',
      title: named ? 'A clean review.' : 'A clean review, with a naming gap.',
      body: `Every problem found, ${totalFalseAlarms === 0 ? 'with no false alarms' : 'with a single false alarm'}. ${named ? 'You named each one, which is what lets an interviewer write "understands the failure" and not "got lucky".' : 'Naming the problem is the other half: it is what separates "something is off here" from a diagnosis.'}`,
    }
  }
  return {
    tone: 'warn',
    title: 'All found, at a cost.',
    body: `${totalFalseAlarms} false alarms along the way. In the room each wrong flag spends minutes and credibility, and a reviewer who flags everything has flagged nothing.`,
  }
}

/* ── the workspace ────────────────────────────────────────────────────── */

export function ReviewWorkspace({
  pr,
  onSolved,
  onReview,
}: {
  pr: PullRequest
  /** Called once a review is clean: everything found, at most one false alarm, unaided. */
  onSolved: () => void
  /** Called with every submitted review, so the X-Ray can show what was missed. */
  onReview: (result: ReviewResult) => void
}) {
  const [fileId, setFileId] = useState(pr.files[0]!.id)
  const [side, setSide] = useState<'pr' | 'docs'>('pr')
  const [flags, setFlags] = useState<Flag[]>([])
  const [result, setResult] = useState<ReviewResult | null>(null)
  /** True from a submit until the reviewer chooses to keep hunting. */
  const [submitted, setSubmitted] = useState(false)
  const [round, setRound] = useState(0)
  const [falseAlarms, setFalseAlarms] = useState(0)
  const [revealed, setRevealed] = useState(false)
  /** Sticky: once answers have been revealed, a later clean review does not count. */
  const [assisted, setAssisted] = useState(false)
  const [focus, setFocus] = useState<{ fileId: string; line: number } | null>(null)
  /** Bumped when a click is refused for lack of flags, to flash the budget chip. */
  const [refused, setRefused] = useState(0)

  const file = pr.files.find((f) => f.id === fileId) ?? pr.files[0]!

  /** Flags that earned a finding in the last review: confirmed, and locked in. */
  const confirmed = useMemo(() => {
    const map = new Map<string, Finding>()
    for (const finding of result?.findings ?? []) {
      if (finding.status !== 'missed' && finding.flag) map.set(flagKey(finding.flag), finding)
    }
    return map
  }, [result])

  const wrong = useMemo(
    () =>
      new Map(
        submitted && result ? result.falseAlarms.map((a) => [flagKey(a.flag), a.why]) : [],
      ),
    [submitted, result],
  )

  /** Flags on a bug that another flag has already earned: harmless, and spare. */
  const redundant = useMemo(() => {
    const keys = new Set<string>()
    if (!submitted || !result) return keys
    for (const flag of flags) {
      const key = flagKey(flag)
      if (!confirmed.has(key) && bugsAt(pr, flag.fileId, flag.line).length > 0) keys.add(key)
    }
    return keys
  }, [submitted, result, flags, confirmed, pr])

  const { marks, tones } = useMemo(() => {
    const marks: Record<number, ReactNode> = {}
    const tones: Record<number, LineTone> = {}
    const paint = (status: Finding['status']) => {
      for (const finding of result?.findings ?? []) {
        if (finding.status !== status) continue
        if (status === 'missed' && !revealed) continue
        for (const loc of finding.bug.locations) {
          if (loc.fileId !== file.id) continue
          for (let n = loc.lines[0]; n <= loc.lines[1]; n++) {
            tones[n] = status === 'missed' ? 'bad' : 'ok'
          }
        }
      }
    }
    // Missed first, so a line shared with a found bug ends up green.
    paint('missed')
    paint('spotted')
    paint('diagnosed')
    for (const flag of flags) {
      if (flag.fileId !== file.id) continue
      const key = flagKey(flag)
      if (confirmed.has(key) || redundant.has(key)) {
        marks[flag.line] = <Check size={13} strokeWidth={3} className="text-ok" />
      } else if (wrong.has(key)) {
        marks[flag.line] = <X size={13} strokeWidth={3} className="text-warn" />
        tones[flag.line] = 'warn'
      } else {
        marks[flag.line] = <FlagIcon size={12} className="text-line" fill="currentColor" />
        tones[flag.line] ??= 'info'
      }
    }
    return { marks, tones }
  }, [flags, file.id, result, revealed, confirmed, wrong, redundant])

  const toggle = (line: number) => {
    if (submitted) return
    if (lineText(pr, file.id, line).trim() === '') return
    const key = flagKey({ fileId: file.id, line })
    if (confirmed.has(key)) return
    setFocus(null)
    if (flags.length >= pr.flagBudget && !flags.some((f) => flagKey(f) === key)) {
      setRefused(refused + 1)
      return
    }
    setFlags(toggleFlag(flags, file.id, line, pr.flagBudget))
  }

  const submit = () => {
    const next = scoreReview(pr, flags)
    const total = falseAlarms + next.falseAlarms.length
    setResult(next)
    setSubmitted(true)
    setRound(round + 1)
    setFalseAlarms(total)
    onReview(next)
    if (!assisted && isCleanReview(next, total)) onSolved()
  }

  const keepHunting = () => {
    // False alarms and duplicate flags are handed back, so the budget is free again.
    setFlags(flags.filter((f) => !wrong.has(flagKey(f)) && !redundant.has(flagKey(f))))
    setSubmitted(false)
  }

  const reveal = () => {
    setRevealed(true)
    setAssisted(true)
  }

  const startOver = () => {
    setFlags([])
    setResult(null)
    setSubmitted(false)
    setRound(0)
    setFalseAlarms(0)
    setRevealed(false)
    setFocus(null)
  }

  const codeRef = useRef<HTMLDivElement>(null)
  const show = (fileIdToShow: string, line: number) => {
    setFileId(fileIdToShow)
    setFocus({ fileId: fileIdToShow, line })
    codeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const left = pr.flagBudget - flags.length
  const totalLines = pr.files.reduce((sum, f) => sum + f.code.split('\n').length, 0)
  const categories = useMemo(() => [...pr.categories].sort(), [pr.categories])
  const verdict = result ? verdictFor(result, falseAlarms, assisted) : null
  const hasHiddenMisses = Boolean(result && !result.allFound && !revealed)

  return (
    <Card className="overflow-hidden">
      {/* header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule px-5 py-3.5">
        <div className="min-w-0">
          <Kicker>Your move</Kicker>
          <h3 className="mt-1 flex items-center gap-2 text-[19px] leading-tight font-[560]">
            <GitPullRequest size={18} className="shrink-0 text-line" />
            <span className="min-w-0">
              Review <span className="num text-[16px] text-ink-3">#{pr.number}</span> before it
              merges
            </span>
          </h3>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Chip>
            {pr.files.length} {pr.files.length === 1 ? 'file' : 'files'} · +{totalLines}
          </Chip>
          <Chip tone="ok" dot>
            tests passing
          </Chip>
          <Chip
            key={refused}
            tone={left === 0 ? 'warn' : 'neutral'}
            className={cn(refused > 0 && left === 0 && 'animate-flash')}
            aria-live="polite"
          >
            {left} of {pr.flagBudget} flags left
          </Chip>
        </div>
      </div>

      <p className="px-5 pt-4 text-[13.5px] text-ink-3">
        Click a line to flag it, and click it again to unflag. Then name what is wrong. You have{' '}
        {pr.flagBudget} flags, so spend them on what you would block the merge for. Keyboard: Tab to
        a line, Enter to flag.
      </p>

      <div className="grid gap-5 px-5 pt-4 pb-5 lg:grid-cols-[minmax(0,1fr)_21.5rem]">
        {/* code */}
        <div ref={codeRef} className="flex min-w-0 scroll-mt-20 flex-col gap-2">
          {pr.files.length > 1 && (
            <div role="tablist" aria-label="Files in this pull request" className="flex gap-1.5">
              {pr.files.map((f) => {
                const active = f.id === file.id
                const count = flags.filter((flag) => flag.fileId === f.id).length
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setFileId(f.id)
                      setFocus(null)
                    }}
                    className={cn(
                      'num inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-[12.5px] transition-colors duration-150',
                      active
                        ? 'border-ink bg-ink text-paper'
                        : 'border-rule bg-card text-ink-2 hover:border-rule-2 hover:text-ink',
                    )}
                  >
                    {fileName(f.path)}
                    {count > 0 && (
                      <span
                        className={cn(
                          'flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold',
                          active ? 'bg-paper text-ink' : 'bg-line text-white',
                        )}
                        aria-label={`${count} flagged`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          <CodePanel
            surface="paper"
            lang={file.lang}
            code={file.code}
            title={file.path}
            right={
              <span className="num text-[11.5px] text-ink-3">
                {file.code.split('\n').length} lines
              </span>
            }
            maxHeight={610}
            activeLines={focus && focus.fileId === file.id ? [focus.line] : undefined}
            tones={tones}
            marks={marks}
            onLineClick={submitted ? undefined : toggle}
            lineLabel={(n) =>
              `${fileName(file.path)} line ${n}: ${lineText(pr, file.id, n).trim() || 'blank'}. ${
                flags.some((f) => f.fileId === file.id && f.line === n)
                  ? 'Flagged. Press Enter to remove the flag.'
                  : 'Press Enter to flag.'
              }`
            }
          />
        </div>

        {/* side panel */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2.5">
            <Segmented
              label="Reference material"
              size="sm"
              full
              value={side}
              onChange={setSide}
              options={[
                {
                  value: 'pr',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Bot size={13} /> What the PR says
                    </span>
                  ),
                },
                {
                  value: 'docs',
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <BookOpen size={13} /> Docs
                    </span>
                  ),
                },
              ]}
            />
            <div className="thin-scroll max-h-[19.5rem] overflow-y-auto rounded-xl border border-rule bg-paper-2/50 p-3.5">
              {side === 'pr' ? <Description pr={pr} /> : <Docs pr={pr} />}
            </div>
          </div>

          <div className="rounded-xl border border-rule bg-card">
            <div className="flex items-center justify-between border-b border-rule px-3.5 py-2.5">
              <Kicker>Your review</Kicker>
              <span className="num text-[12px] text-ink-3">
                {flags.length} of {pr.flagBudget} flags
              </span>
            </div>
            {flags.length === 0 ? (
              <p className="px-3.5 py-4 text-[13px] leading-snug text-ink-3">
                No flags yet. Click a line you would block the merge for, then say what is wrong
                with it.
              </p>
            ) : (
              <ul className="divide-y divide-rule">
                {flags.map((flag) => {
                  const key = flagKey(flag)
                  const finding = confirmed.get(key)
                  const isWrong = wrong.has(key)
                  const path = pr.files.find((f) => f.id === flag.fileId)?.path ?? flag.fileId
                  const locked = Boolean(finding) || submitted
                  return (
                    <li key={key} className="flex flex-col gap-2 px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded-full',
                            finding
                              ? 'bg-ok text-white'
                              : isWrong
                                ? 'bg-warn-wash text-warn'
                                : 'bg-line/10 text-line',
                          )}
                          aria-hidden
                        >
                          {finding ? (
                            <Check size={11} strokeWidth={3} />
                          ) : isWrong ? (
                            <X size={11} strokeWidth={3} />
                          ) : (
                            <FlagIcon size={10} fill="currentColor" />
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => show(flag.fileId, flag.line)}
                          className="num shrink-0 text-[12.5px] font-medium text-ink underline decoration-rule-2 underline-offset-2 hover:decoration-ink"
                          title="Show this line"
                        >
                          {fileName(path)}:{flag.line}
                        </button>
                        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3">
                          {lineText(pr, flag.fileId, flag.line).trim()}
                        </span>
                        {!locked && (
                          <button
                            type="button"
                            onClick={() => setFlags(flags.filter((f) => flagKey(f) !== key))}
                            aria-label={`Remove the flag on ${fileName(path)} line ${flag.line}`}
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-paper-2 hover:text-ink"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      <select
                        value={flag.diagnosis ?? ''}
                        disabled={submitted || finding?.status === 'diagnosed'}
                        onChange={(e) => setFlags(diagnoseFlag(flags, key, e.target.value || null))}
                        aria-label={`What is wrong on ${fileName(path)} line ${flag.line}`}
                        className={cn(
                          'h-8 w-full rounded-md border bg-card px-2 text-[12.5px] transition-colors disabled:opacity-70',
                          flag.diagnosis
                            ? 'border-rule-2 font-medium text-ink'
                            : 'border-rule-2 border-dashed text-ink-3',
                        )}
                      >
                        <option value="">Name the problem…</option>
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      {isWrong && (
                        <p className="text-[12px] leading-snug text-warn">{wrong.get(key)}</p>
                      )}
                      {redundant.has(key) && (
                        <p className="text-[12px] leading-snug text-ink-3">
                          Same problem as another of your flags. This one is spare.
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {submitted ? (
            <p className="flex items-center gap-2 text-[13px] text-ink-3">
              <Search size={14} /> Review {round} submitted. The results are below.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <Button
                variant="line"
                size="lg"
                className="w-full"
                onClick={submit}
                disabled={flags.length === 0}
                icon={<Send size={16} />}
              >
                {round === 0 ? 'Submit review' : 'Submit review again'}
              </Button>
              <p className="text-[12px] leading-snug text-ink-3">
                A flag without a name still counts as finding the line. Naming it is what earns the
                diagnosis.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* results */}
      {result && verdict && (
        <div className="border-t border-rule bg-paper-2/50 px-5 py-5">
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1" aria-live="polite">
              <Kicker>Review round {round}</Kicker>
              <p
                className={cn(
                  'display mt-1 text-[24px] leading-tight font-[560]',
                  verdict.tone === 'ok' && 'text-ok',
                  verdict.tone === 'warn' && 'text-warn',
                  verdict.tone === 'neutral' && 'text-ink',
                )}
              >
                {verdict.title}
              </p>
              <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-ink-2">
                {verdict.body}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip tone={result.allFound ? 'ok' : 'neutral'}>
                {result.found} of {result.findings.length} found
              </Chip>
              <Chip tone={result.diagnosed === result.findings.length ? 'ok' : 'neutral'}>
                {result.diagnosed} named
              </Chip>
              <Chip tone={falseAlarms > 1 ? 'warn' : 'neutral'}>
                {falseAlarms} false {falseAlarms === 1 ? 'alarm' : 'alarms'}
              </Chip>
            </div>
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            {result.findings.map((finding) => (
              <FindingCard
                key={finding.bug.id}
                pr={pr}
                finding={finding}
                revealed={revealed}
                onShow={() => {
                  const loc = finding.bug.locations[0]!
                  show(loc.fileId, loc.lines[0])
                }}
              />
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {submitted && !result.allFound && (
              <Button variant="line" onClick={keepHunting} icon={<Search size={15} />}>
                Keep hunting
              </Button>
            )}
            {hasHiddenMisses && (
              <Button variant="outline" onClick={reveal} icon={<Eye size={15} />}>
                Reveal what I missed
              </Button>
            )}
            <Button
              variant="ghost"
              className="ml-auto"
              onClick={startOver}
              icon={<RotateCcw size={15} />}
            >
              Start this review over
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
