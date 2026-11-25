import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { cn, FILM_TONE, PAPER_TONE, type Tone } from '@/lib/cn'
import { highlight, type Lang } from '@/lib/highlight'
import type { Surface } from './ui'

const LINE_HEIGHT = 22

/** Per-line tint: a semantic tone, or a diff marker. */
export type LineTone = Tone | 'add' | 'del'

function toneColor(tone: LineTone, surface: Surface): string {
  const map = surface === 'film' ? FILM_TONE : PAPER_TONE
  if (tone === 'add') return map.ok
  if (tone === 'del') return map.bad
  return map[tone]
}

/**
 * Source code with a line gutter. `activeLines` drives a highlight band that
 * slides to the line being executed, which is how the X-Ray visualizers keep
 * code and animation in sync. Lines can also be tinted, marked, or clickable.
 */
export function CodePanel({
  code,
  lang = 'python',
  title,
  right,
  activeLines,
  tones,
  marks,
  onLineClick,
  lineLabel,
  surface = 'film',
  maxHeight,
  startLine = 1,
  className,
}: {
  code: string
  lang?: Lang
  title?: ReactNode
  right?: ReactNode
  /** 1-based line numbers currently "executing". The first one gets the sliding band. */
  activeLines?: number[]
  /** 1-based line number → tint. */
  tones?: Record<number, LineTone>
  /** 1-based line number → gutter marker (a flag, a bug pin, …). */
  marks?: Record<number, ReactNode>
  onLineClick?: (line: number) => void
  /** Accessible label for a clickable line. */
  lineLabel?: (line: number) => string
  surface?: Surface
  maxHeight?: number
  startLine?: number
  className?: string
}) {
  const film = surface === 'film'
  const lines = useMemo(() => highlight(code, lang), [code, lang])
  const scrollRef = useRef<HTMLDivElement>(null)
  const primary = activeLines?.[0]

  // Keep the executing line in view inside the panel (never scrolls the page).
  useEffect(() => {
    const el = scrollRef.current
    if (!el || primary == null) return
    const top = (primary - startLine) * LINE_HEIGHT
    const visibleTop = el.scrollTop
    const visibleBottom = visibleTop + el.clientHeight - LINE_HEIGHT * 2
    if (top < visibleTop + LINE_HEIGHT || top > visibleBottom) {
      el.scrollTo({ top: Math.max(0, top - el.clientHeight / 2), behavior: 'smooth' })
    }
  }, [primary, startLine])

  const bandColor = film ? 'var(--color-trace)' : 'var(--color-ink)'

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border',
        film ? 'code-film border-film-rule bg-film-2' : 'code-paper border-rule bg-card',
        className,
      )}
    >
      {(title || right) && (
        <div
          className={cn(
            'flex items-center justify-between gap-3 border-b px-3 py-2',
            film ? 'border-film-rule/80' : 'border-rule',
          )}
        >
          <span
            className={cn('num truncate text-[12px]', film ? 'text-film-muted' : 'text-ink-3')}
          >
            {title}
          </span>
          {right}
        </div>
      )}
      <div
        ref={scrollRef}
        className={cn('thin-scroll overflow-auto', film && 'on-film')}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <div
          className="relative min-w-max py-2 font-mono text-[12.5px]"
          style={{ lineHeight: `${LINE_HEIGHT}px` }}
        >
          {primary != null && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-2 transition-transform duration-300 ease-out"
              style={{
                height: LINE_HEIGHT,
                transform: `translateY(${(primary - startLine) * LINE_HEIGHT}px)`,
                backgroundColor: `color-mix(in oklab, ${bandColor} ${film ? 16 : 9}%, transparent)`,
                boxShadow: `inset 3px 0 0 ${bandColor}`,
              }}
            />
          )}
          {lines.map((toks, i) => {
            const n = i + startLine
            const tone = tones?.[n]
            const isActive = activeLines?.includes(n) ?? false
            const secondary = isActive && n !== primary
            const tint = tone ? toneColor(tone, surface) : undefined
            const rowStyle: CSSProperties = { height: LINE_HEIGHT }
            if (tint) {
              rowStyle.backgroundColor = `color-mix(in oklab, ${tint} ${film ? 15 : 13}%, transparent)`
              rowStyle.boxShadow = `inset 3px 0 0 ${tint}`
            } else if (secondary) {
              rowStyle.backgroundColor = `color-mix(in oklab, ${bandColor} ${film ? 9 : 5}%, transparent)`
            }
            const clickable = Boolean(onLineClick)
            return (
              <div
                key={n}
                className={cn(
                  'relative flex',
                  clickable &&
                    (film
                      ? 'cursor-pointer hover:bg-film-3/80'
                      : 'cursor-pointer hover:bg-paper-2/80'),
                )}
                style={rowStyle}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable ? (lineLabel?.(n) ?? `Line ${n}`) : undefined}
                onClick={clickable ? () => onLineClick?.(n) : undefined}
                onKeyDown={
                  clickable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onLineClick?.(n)
                        }
                      }
                    : undefined
                }
              >
                <span
                  className="flex w-6 shrink-0 items-center justify-center select-none"
                  aria-hidden={!marks?.[n]}
                >
                  {marks?.[n]}
                </span>
                <span
                  className={cn(
                    'w-7 shrink-0 pr-3 text-right select-none',
                    film ? 'text-film-muted/70' : 'text-ink-3/70',
                    isActive && (film ? 'text-trace' : 'text-ink'),
                  )}
                  aria-hidden
                >
                  {tone === 'add' ? '+' : tone === 'del' ? '−' : n}
                </span>
                <span className="pr-5 whitespace-pre">
                  {toks.length === 0
                    ? ' '
                    : toks.map((tok, j) => (
                        <span key={j} className={`tok-${tok.kind}`}>
                          {tok.text}
                        </span>
                      ))}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
