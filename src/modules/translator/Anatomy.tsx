import type { CSSProperties } from 'react'
import { cn, FILM_TONE, PAPER_TONE } from '@/lib/cn'
import type { Surface } from '@/components/ui'
import {
  SIGNAL_ORDER,
  SIGNALS,
  sides,
  type Piece,
  type SignalKind,
  type Tally,
} from './logic'

/*
 * Signal anatomy: text with each span drawn by what it gives an interview
 * panel. This is the Translator's x-ray. Colour says which family a span is
 * in; the mark (fill, underline, dashes, outline, wave) tells the kinds within
 * a family apart, so the picture never depends on colour alone.
 */

function signalColor(kind: SignalKind, surface: Surface): string {
  const tone = SIGNALS[kind].tone
  if (surface === 'film') return tone === 'neutral' ? 'var(--color-film-text)' : FILM_TONE[tone]
  if (tone === 'neutral') return 'var(--color-ink)'
  if (tone === 'trace') return 'var(--color-line-blue)'
  return PAPER_TONE[tone]
}

function markStyle(kind: SignalKind, surface: Surface): CSSProperties {
  const color = signalColor(kind, surface)
  const base: CSSProperties = {
    color,
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  }
  const line: CSSProperties = {
    textDecorationLine: 'underline',
    textDecorationColor: `color-mix(in oklab, ${color} 75%, transparent)`,
    textDecorationThickness: '2px',
    textUnderlineOffset: '3px',
  }
  switch (SIGNALS[kind].mark) {
    case 'fill':
      return {
        ...base,
        backgroundColor: `color-mix(in oklab, ${color} ${surface === 'film' ? 17 : 13}%, transparent)`,
        borderRadius: 3,
        padding: '1px 3px',
        margin: '0 -1px',
      }
    case 'outline':
      return {
        ...base,
        boxShadow: `inset 0 0 0 1.5px ${color}`,
        borderRadius: 3,
        padding: '1px 4px',
      }
    case 'dashed':
      return { ...base, ...line, textDecorationStyle: 'dashed' }
    case 'wavy':
      return { ...base, ...line, textDecorationStyle: 'wavy', textDecorationThickness: '1.5px' }
    default:
      return { ...base, ...line }
  }
}

/** Text with its signal spans marked. Hover a span to see what it is. */
export function Anatomy({
  pieces,
  surface = 'film',
  className,
}: {
  pieces: Piece[]
  surface?: Surface
  className?: string
}) {
  return (
    <span className={className}>
      {pieces.map((piece, i) =>
        piece.kind ? (
          <span key={i} style={markStyle(piece.kind, surface)} title={SIGNALS[piece.kind].label}>
            {piece.text}
          </span>
        ) : (
          <span key={i}>{piece.text}</span>
        ),
      )}
    </span>
  )
}

/** A sample of one signal's mark, for legends. */
export function SignalSwatch({
  kind,
  surface = 'film',
  className,
}: {
  kind: SignalKind
  surface?: Surface
  className?: string
}) {
  return (
    <span
      className={cn('text-[12.5px] leading-6 font-medium whitespace-nowrap', className)}
      style={markStyle(kind, surface)}
    >
      {SIGNALS[kind].label}
    </span>
  )
}

/**
 * The legend and the score sheet in one: every signal kind with its mark, and
 * how many times it appears in each column being compared.
 */
export function SignalLegend({
  columns,
  surface = 'film',
  className,
}: {
  columns: { label: string; tally: Tally }[]
  surface?: Surface
  className?: string
}) {
  const film = surface === 'film'
  const muted = film ? 'text-film-muted' : 'text-ink-3'
  const strong = film ? 'text-film-text' : 'text-ink'
  const rule = film ? 'border-film-rule/60' : 'border-rule'
  const max = Math.max(1, ...columns.flatMap((c) => SIGNAL_ORDER.map((k) => c.tally[k])))
  const totals = columns.map((c) => sides(c.tally))

  return (
    <table className={cn('w-full border-collapse text-left', className)}>
      <thead>
        <tr>
          <th scope="col" className={cn('kicker pb-1.5 font-medium', muted)}>
            Signal
          </th>
          {columns.map((c) => (
            <th key={c.label} scope="col" className={cn('kicker w-[5.5rem] pb-1.5 text-right font-medium', muted)}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {SIGNAL_ORDER.map((kind) => (
          <tr key={kind} className={cn('border-t', rule)}>
            <th scope="row" className="py-1 pr-2 font-normal" title={SIGNALS[kind].hint}>
              <SignalSwatch kind={kind} surface={surface} />
            </th>
            {columns.map((c) => {
              const n = c.tally[kind]
              return (
                <td key={c.label} className="py-1 text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span
                      aria-hidden
                      className="h-1.5 rounded-full transition-[width] duration-500 ease-out"
                      style={{
                        width: `${(n / max) * 40}px`,
                        backgroundColor: signalColor(kind, surface),
                        opacity: n > 0 ? 0.85 : 0,
                      }}
                    />
                    <span className={cn('num w-4 text-[12.5px]', n > 0 ? strong : muted)}>{n}</span>
                  </span>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className={cn('border-t-2', rule)}>
          <th scope="row" className={cn('pt-2 text-[12.5px] font-semibold', strong)}>
            Things a panel can write down
          </th>
          {totals.map((t, i) => (
            <td key={columns[i]!.label} className={cn('num pt-2 text-right text-[14px] font-medium', strong)}>
              {t.engineering}
            </td>
          ))}
        </tr>
        <tr>
          <th scope="row" className={cn('text-[12.5px] font-normal', muted)}>
            Process nouns and buzzwords
          </th>
          {totals.map((t, i) => (
            <td
              key={columns[i]!.label}
              className="num text-right text-[14px] font-medium"
              style={{
                color:
                  t.delivery > 0
                    ? film
                      ? FILM_TONE.bad
                      : PAPER_TONE.bad
                    : film
                      ? 'var(--color-film-muted)'
                      : 'var(--color-ink-3)',
              }}
            >
              {t.delivery}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  )
}
