import { Check, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import type { Surface } from './ui'

export type ScoreTarget = {
  id: string
  /** What is being judged, e.g. "Buy-path p99". */
  label: string
  /** Current value, already formatted. */
  value: ReactNode
  /** The bar to clear, e.g. "≤ 500 ms". */
  goal: string
  met: boolean
}

/**
 * The win condition of a sandbox, written the way an interviewer would mark
 * it: a short list of targets, each visibly met or missed as you change the
 * design.
 */
export function Scorecard({
  title = "Interviewer's scorecard",
  targets,
  surface = 'film',
  className,
}: {
  title?: string
  targets: ScoreTarget[]
  surface?: Surface
  className?: string
}) {
  const film = surface === 'film'
  const met = targets.filter((t) => t.met).length
  const all = met === targets.length
  return (
    <div
      className={cn(
        'rounded-xl border',
        film ? 'border-film-rule bg-film-2/80' : 'border-rule bg-card',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-3 border-b px-3 py-2',
          film ? 'border-film-rule/70' : 'border-rule',
        )}
      >
        <span className={cn('kicker', film ? 'text-film-muted' : 'text-ink-3')}>{title}</span>
        <span
          className={cn(
            'num rounded-md px-1.5 py-0.5 text-[12px] font-medium transition-colors duration-300',
            all
              ? film
                ? 'bg-f-ok/15 text-f-ok'
                : 'bg-ok-wash text-ok'
              : film
                ? 'text-film-text'
                : 'text-ink',
          )}
          aria-live="polite"
        >
          {met} / {targets.length} met
        </span>
      </div>
      <ul className="flex flex-col">
        {targets.map((t) => (
          <li
            key={t.id}
            className={cn(
              'grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b px-3 py-2 last:border-b-0',
              film ? 'border-film-rule/50' : 'border-rule/70',
            )}
          >
            <span
              className={cn(
                'flex size-[18px] items-center justify-center rounded-full transition-colors duration-300',
                t.met
                  ? film
                    ? 'bg-f-ok text-film'
                    : 'bg-ok text-white'
                  : film
                    ? 'bg-f-bad/20 text-f-bad'
                    : 'bg-bad-wash text-bad',
              )}
              aria-hidden
            >
              {t.met ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  'block truncate text-[13px] font-medium',
                  film ? 'text-film-text' : 'text-ink',
                )}
              >
                {t.label}
                <span className="sr-only">{t.met ? ' (met)' : ' (missed)'}</span>
              </span>
              <span className={cn('num block text-[11px]', film ? 'text-film-muted' : 'text-ink-3')}>
                target {t.goal}
              </span>
            </span>
            <span
              className={cn(
                'num text-right text-[14px] font-medium transition-colors duration-300',
                t.met
                  ? film
                    ? 'text-f-ok'
                    : 'text-ok'
                  : film
                    ? 'text-f-bad'
                    : 'text-bad',
              )}
            >
              {t.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
