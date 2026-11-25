import type { ReactNode } from 'react'
import { cn, FILM_TONE, type Tone } from '@/lib/cn'

/**
 * The dark "x-ray film" surface. Anything that shows the inside of a system
 * (a stepping algorithm, an execution trace, a live architecture) lives on film;
 * everything you read or decide lives on paper.
 */
export function Film({
  kicker = 'X-Ray',
  title,
  right,
  footer,
  children,
  className,
  bodyClassName,
  scan = true,
}: {
  kicker?: string
  title?: ReactNode
  /** Controls shown at the right of the header strip. */
  right?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  /** Play the one-off scanline sweep when the film first appears. */
  scan?: boolean
}) {
  return (
    <section className={cn('film overflow-hidden rounded-2xl border border-film-rule', className)}>
      {scan && <div className="film-scanline" aria-hidden />}
      <header className="relative z-10 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 border-b border-film-rule/80 px-4 py-2">
        <span className="kicker flex items-center gap-2 text-trace">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-trace opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-trace" />
          </span>
          {kicker}
        </span>
        {title && (
          <span className="min-w-0 truncate text-[13.5px] font-medium text-film-text">{title}</span>
        )}
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </header>
      <div className={cn('relative z-10 p-4', bodyClassName)}>{children}</div>
      {footer && (
        <footer className="relative z-10 border-t border-film-rule/80 bg-film/60 px-4 py-3">
          {footer}
        </footer>
      )}
    </section>
  )
}

/** A compact labelled readout for use on film. */
export function FilmStat({
  label,
  value,
  sub,
  tone = 'trace',
  className,
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="kicker text-film-muted">{label}</div>
      <div
        className="num mt-1 text-[22px] leading-none font-medium"
        style={{ color: FILM_TONE[tone] }}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-[11.5px] leading-snug text-film-muted">{sub}</div>}
    </div>
  )
}

/** A bordered sub-panel on film (for grouping controls or readouts). */
export function FilmPanel({
  title,
  right,
  children,
  className,
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-film-rule bg-film-2/80', className)}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 border-b border-film-rule/70 px-3 py-2">
          <span className="kicker text-film-muted">{title}</span>
          {right}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  )
}
