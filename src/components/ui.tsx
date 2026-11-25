import { motion } from 'motion/react'
import {
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { cn, FILM_TONE, type Tone } from '@/lib/cn'

/** Which of the two surfaces a control sits on. */
export type Surface = 'paper' | 'film'

/* ── Button ───────────────────────────────────────────────────────────── */

type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'line'
type ButtonSize = 'sm' | 'md' | 'lg'

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2.5 px-5 text-[15px]',
}

const BUTTON_STYLE: Record<Surface, Record<ButtonVariant, string>> = {
  paper: {
    solid: 'bg-ink text-paper hover:bg-ink-2 active:bg-ink',
    outline: 'border border-rule-2 bg-card text-ink hover:border-ink',
    ghost: 'text-ink-2 hover:bg-paper-2 hover:text-ink',
    line: 'bg-line text-white hover:brightness-110 active:brightness-95',
  },
  film: {
    solid: 'bg-trace text-film hover:brightness-110 active:brightness-95',
    outline:
      'border border-film-rule bg-film-2 text-film-text hover:border-trace/60 hover:bg-film-3',
    ghost: 'text-film-muted hover:bg-film-3 hover:text-film-text',
    line: 'bg-line text-white hover:brightness-110 active:brightness-95',
  },
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  surface?: Surface
  icon?: ReactNode
  iconRight?: ReactNode
}

export function Button({
  variant = 'solid',
  size = 'md',
  surface = 'paper',
  icon,
  iconRight,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap select-none',
        'transition-[background-color,border-color,color,filter,transform] duration-150 active:translate-y-px',
        'disabled:pointer-events-none disabled:opacity-40',
        BUTTON_SIZE[size],
        BUTTON_STYLE[surface][variant],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  )
}

/* ── Chip ─────────────────────────────────────────────────────────────── */

const PAPER_CHIP: Record<Tone, string> = {
  neutral: 'bg-paper-2 text-ink-2 border-rule',
  trace: 'bg-ink text-paper border-ink',
  ok: 'bg-ok-wash text-ok border-ok/25',
  warn: 'bg-warn-wash text-warn border-warn/25',
  bad: 'bg-bad-wash text-bad border-bad/25',
  info: 'bg-info-wash text-line-purple border-line-purple/25',
}

export function Chip({
  tone = 'neutral',
  surface = 'paper',
  dot = false,
  className,
  children,
  style,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; surface?: Surface; dot?: boolean }) {
  const filmStyle: CSSProperties | undefined =
    surface === 'film'
      ? {
          color: FILM_TONE[tone],
          backgroundColor: `color-mix(in oklab, ${FILM_TONE[tone]} 13%, transparent)`,
          borderColor: `color-mix(in oklab, ${FILM_TONE[tone]} 34%, transparent)`,
        }
      : undefined
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] leading-5 font-medium tracking-wide whitespace-nowrap',
        surface === 'paper' && PAPER_CHIP[tone],
        className,
      )}
      style={{ ...filmStyle, ...style }}
      {...rest}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

/* ── Segmented control ────────────────────────────────────────────────── */

export type SegmentedOption<T extends string> = {
  value: T
  label: ReactNode
  disabled?: boolean
  title?: string
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  surface = 'paper',
  size = 'md',
  label,
  full = false,
  className,
}: {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  surface?: Surface
  size?: 'sm' | 'md'
  /** Accessible name for the group. */
  label: string
  full?: boolean
  className?: string
}) {
  const id = useId()
  const film = surface === 'film'
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] border p-0.5',
        film ? 'border-film-rule bg-film-2' : 'border-rule bg-paper-2',
        full && 'flex w-full',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={opt.disabled}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative isolate rounded-lg font-medium whitespace-nowrap transition-colors duration-150 disabled:opacity-40',
              size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13.5px]',
              full && 'flex-1',
              film
                ? active
                  ? 'text-film'
                  : 'text-film-muted hover:text-film-text'
                : active
                  ? 'text-paper'
                  : 'text-ink-2 hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className={cn('absolute inset-0 -z-10 rounded-lg', film ? 'bg-trace' : 'bg-ink')}
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              />
            )}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

/* ── Toggle (switch row) ──────────────────────────────────────────────── */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  surface = 'paper',
  disabled = false,
  badge,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  hint?: ReactNode
  surface?: Surface
  disabled?: boolean
  /** Small element shown before the switch (cost, tag, …). */
  badge?: ReactNode
  className?: string
}) {
  const film = surface === 'film'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 disabled:opacity-40',
        film ? 'hover:bg-film-3' : 'hover:bg-paper-2',
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block text-[13.5px] leading-snug font-medium',
            film ? 'text-film-text' : 'text-ink',
          )}
        >
          {label}
        </span>
        {hint && (
          <span
            className={cn(
              'mt-0.5 block text-[12px] leading-snug',
              film ? 'text-film-muted' : 'text-ink-3',
            )}
          >
            {hint}
          </span>
        )}
      </span>
      {badge}
      <span
        aria-hidden
        className={cn(
          'relative h-[22px] w-10 shrink-0 rounded-full border transition-colors duration-200',
          checked
            ? film
              ? 'border-trace bg-trace'
              : 'border-line bg-line'
            : film
              ? 'border-film-rule bg-film-3'
              : 'border-rule-2 bg-paper-3',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] left-[2px] size-4 rounded-full transition-transform duration-200 ease-out',
            checked ? 'translate-x-[18px]' : 'translate-x-0',
            film ? (checked ? 'bg-film' : 'bg-film-muted') : 'bg-white shadow-sm',
          )}
        />
      </span>
    </button>
  )
}

/* ── Slider ───────────────────────────────────────────────────────────── */

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  valueLabel,
  surface = 'paper',
  className,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  label: ReactNode
  /** Formatted current value, shown on the right. */
  valueLabel?: ReactNode
  surface?: Surface
  className?: string
}) {
  const id = useId()
  const film = surface === 'film'
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100
  return (
    <div className={cn('px-2.5 py-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={id}
          className={cn('text-[13.5px] font-medium', film ? 'text-film-text' : 'text-ink')}
        >
          {label}
        </label>
        {valueLabel != null && (
          <span className={cn('num text-[13px]', film ? 'text-trace' : 'text-ink')}>
            {valueLabel}
          </span>
        )}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={cn('scrub mt-1', !film && 'scrub-paper')}
        style={{ '--scrub-pct': `${pct}%` } as CSSProperties}
      />
    </div>
  )
}

/* ── Card, Kicker, Callout ────────────────────────────────────────────── */

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-2xl border border-rule bg-card shadow-card', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

export function Kicker({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn('kicker text-ink-3', className)} {...rest}>
      {children}
    </span>
  )
}

const PAPER_CALLOUT: Record<Tone, string> = {
  neutral: 'border-rule bg-paper-2 text-ink',
  trace: 'border-ink bg-ink text-paper',
  ok: 'border-ok/30 bg-ok-wash text-ink',
  warn: 'border-warn/30 bg-warn-wash text-ink',
  bad: 'border-bad/30 bg-bad-wash text-ink',
  info: 'border-line-purple/25 bg-info-wash text-ink',
}

export function Callout({
  tone = 'neutral',
  surface = 'paper',
  icon,
  title,
  className,
  children,
}: {
  tone?: Tone
  surface?: Surface
  icon?: ReactNode
  title?: ReactNode
  className?: string
  children?: ReactNode
}) {
  const film = surface === 'film'
  const filmStyle: CSSProperties | undefined = film
    ? {
        borderColor: `color-mix(in oklab, ${FILM_TONE[tone]} 38%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${FILM_TONE[tone]} 9%, var(--color-film-2))`,
      }
    : undefined
  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border px-4 py-3 text-[14px] leading-relaxed',
        film ? 'text-film-text' : PAPER_CALLOUT[tone],
        className,
      )}
      style={filmStyle}
    >
      {icon && (
        <span
          className="mt-0.5 shrink-0"
          style={film ? { color: FILM_TONE[tone] } : undefined}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && <div className="mb-0.5 font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  )
}

/* ── Page header ──────────────────────────────────────────────────────── */

export function PageHeader({
  code,
  kicker,
  title,
  lede,
  aside,
}: {
  /** Station code, e.g. `PT2`. */
  code: string
  kicker: string
  title: ReactNode
  lede: ReactNode
  aside?: ReactNode
}) {
  return (
    <header className="flex flex-col gap-6 pb-8 md:flex-row md:items-end md:justify-between">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2.5">
          <span className="num rounded-md bg-line px-1.5 py-0.5 text-[11px] font-semibold tracking-wider text-white">
            {code}
          </span>
          <span className="kicker text-line">{kicker}</span>
        </div>
        <h1 className="mt-3 text-[clamp(2rem,4.4vw,3.1rem)] leading-[1.04] font-[560]">{title}</h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-ink-2">{lede}</p>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </header>
  )
}
