import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { clamp, cn, FILM_TONE, PAPER_TONE } from '@/lib/cn'
import type { Surface } from '@/components/ui'
import type { Span } from './logic'

/*
 * A time axis with requests drawn as lollipops: green allowed, red rejected.
 * On paper it is the interactive challenge (click, or use the keyboard, to
 * place requests). On film it is read-only and shows what the limiter can
 * "see": the window it is counting and the request being judged.
 */

export type WindowOverlay =
  /** One fixed bucket starting at `start`. */
  | { kind: 'fixed'; start: number; label: string }
  /** The trailing window ending at `to`. */
  | { kind: 'sliding'; to: number; label: string }
  /** Current bucket plus a fading share of the previous one. */
  | { kind: 'weighted'; start: number; overlap: number; label: string }

const W = 900
const PAD = 26
const AXIS_Y = 98
const TOP_Y = 46
const H = 146
const BAND_Y = TOP_Y - 22
const BAND_H = AXIS_Y - BAND_Y
const SLIDE = 'transform 0.35s cubic-bezier(0.2, 0.7, 0.2, 1)'

export function Timeline({
  surface,
  duration,
  window,
  requests,
  decisions,
  snap = 0.5,
  onToggle,
  maxRequests,
  activeIndex,
  playhead,
  overlay,
  span,
  limit,
  className,
}: {
  surface: Surface
  /** Seconds shown on the axis. */
  duration: number
  /** Rate-limit window in seconds. */
  window: number
  requests: number[]
  decisions: (boolean | null)[]
  snap?: number
  /** Interactive mode: add or remove a request at this (snapped) time. */
  onToggle?: (t: number) => void
  maxRequests?: number
  /** Request currently being judged (film). */
  activeIndex?: number
  playhead?: number
  overlay?: WindowOverlay | null
  /** Densest span of allowed requests, drawn as a bracket under the axis. */
  span?: Span | null
  limit: number
  className?: string
}) {
  const film = surface === 'film'
  const tones = film ? FILM_TONE : PAPER_TONE
  const interactive = Boolean(onToggle)
  const slots = Math.round(duration / snap)
  const clipId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [cursor, setCursor] = useState<number | null>(null)

  const perSecond = (W - PAD * 2) / duration
  const px = (t: number) => PAD + t * perSecond
  const x = (t: number) => px(clamp(t, 0, duration))
  const windowPx = window * perSecond
  const axisColor = film ? 'var(--color-film-rule)' : 'var(--color-rule-2)'
  const textColor = film ? 'var(--color-film-muted)' : 'var(--color-ink-3)'
  const full = maxRequests != null && requests.length >= maxRequests

  const slotFromPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    return clamp(Math.floor(ratio * slots), 0, slots - 1)
  }

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (!interactive) return
    const cur = cursor ?? 0
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      setCursor(clamp(cur + (e.shiftKey ? 4 : 1), 0, slots - 1))
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setCursor(clamp(cur - (e.shiftKey ? 4 : 1), 0, slots - 1))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onToggle?.(cur * snap)
    }
  }

  const cursorT = cursor != null ? cursor * snap : null
  const cursorTaken = cursorT != null && requests.includes(cursorT)
  const spanOver = Boolean(span && span.count > limit)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('block w-full select-none', interactive && 'cursor-crosshair', className)}
      role={interactive ? 'application' : 'img'}
      aria-label={
        interactive
          ? `Request timeline, 0 to ${duration} seconds. Use the arrow keys to move and Enter to place or remove a request. ${requests.length} placed.`
          : `Request timeline with ${requests.length} requests`
      }
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKeyDown}
      onFocus={interactive ? () => setCursor((c) => c ?? 0) : undefined}
      onBlur={interactive ? () => setCursor(null) : undefined}
      style={{ outlineOffset: 4 }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD} y={0} width={W - PAD * 2} height={H} />
        </clipPath>
      </defs>

      {/* what the limiter is counting */}
      <g clipPath={`url(#${clipId})`}>
        {overlay?.kind === 'fixed' && (
          <g style={{ transform: `translateX(${px(overlay.start)}px)`, transition: SLIDE }}>
            <rect y={BAND_Y} width={windowPx} height={BAND_H} rx={6} fill={tones.trace} opacity={0.1} />
            <path d={`M0,${BAND_Y} v${BAND_H} M${windowPx},${BAND_Y} v${BAND_H}`} stroke={tones.trace} strokeWidth={1.2} strokeDasharray="3 3" opacity={0.7} />
            <text x={8} y={BAND_Y + 14} fontSize={11} fontFamily="var(--font-mono)" fill={tones.trace}>
              {overlay.label}
            </text>
          </g>
        )}
        {overlay?.kind === 'sliding' && (
          <g style={{ transform: `translateX(${px(overlay.to) - windowPx}px)`, transition: SLIDE }}>
            <rect y={BAND_Y} width={windowPx} height={BAND_H} rx={6} fill={tones.trace} opacity={0.1} />
            <path d={`M0,${BAND_Y} v${BAND_H}`} stroke={tones.trace} strokeWidth={1.4} strokeDasharray="3 3" />
            <text x={windowPx - 8} y={BAND_Y + 14} textAnchor="end" fontSize={11} fontFamily="var(--font-mono)" fill={tones.trace}>
              {overlay.label}
            </text>
          </g>
        )}
        {overlay?.kind === 'weighted' && (
          <g style={{ transform: `translateX(${px(overlay.start)}px)`, transition: SLIDE }}>
            <rect
              x={-windowPx}
              y={BAND_Y}
              width={windowPx}
              height={BAND_H}
              rx={6}
              fill={tones.info}
              opacity={0.04 + overlay.overlap * 0.2}
              style={{ transition: 'opacity 0.3s' }}
            />
            <rect y={BAND_Y} width={windowPx} height={BAND_H} rx={6} fill={tones.trace} opacity={0.1} />
            <path d={`M0,${BAND_Y} v${BAND_H}`} stroke={tones.trace} strokeWidth={1.2} strokeDasharray="3 3" opacity={0.7} />
            <text x={8} y={BAND_Y + 14} fontSize={11} fontFamily="var(--font-mono)" fill={tones.trace}>
              {overlay.label}
            </text>
          </g>
        )}
      </g>

      {/* axis */}
      <line x1={PAD} x2={W - PAD} y1={AXIS_Y} y2={AXIS_Y} stroke={axisColor} strokeWidth={1.5} />
      {Array.from({ length: duration + 1 }, (_, s) => {
        const major = s % 5 === 0
        return (
          <g key={s}>
            <line
              x1={x(s)}
              x2={x(s)}
              y1={AXIS_Y}
              y2={AXIS_Y + (major ? 7 : 4)}
              stroke={axisColor}
              strokeWidth={major ? 1.5 : 1}
            />
            {major && (
              <text
                x={x(s)}
                y={AXIS_Y + 20}
                textAnchor="middle"
                fontSize={10.5}
                fontFamily="var(--font-mono)"
                fill={textColor}
              >
                {s}s
              </text>
            )}
          </g>
        )
      })}

      {/* densest span of allowed requests */}
      {span && span.count > 1 && (
        <g>
          <rect
            x={x(span.start) - 6}
            y={AXIS_Y + 28}
            width={x(span.last) - x(span.start) + 12}
            height={5}
            rx={2.5}
            fill={spanOver ? tones.bad : tones.ok}
          />
          <text
            x={clamp((x(span.start) + x(span.last)) / 2, 110, W - 110)}
            y={AXIS_Y + 45}
            textAnchor="middle"
            fontSize={10.5}
            fontFamily="var(--font-mono)"
            fontWeight={500}
            fill={spanOver ? tones.bad : textColor}
          >
            {span.count} allowed within {Math.round((span.last - span.start) * 10) / 10}s
          </text>
        </g>
      )}

      {/* playhead */}
      {playhead != null && (
        <g style={{ transform: `translateX(${px(playhead)}px)`, transition: SLIDE }}>
          <line y1={BAND_Y - 4} y2={AXIS_Y + 8} stroke={tones.trace} strokeWidth={1.5} />
          <path d={`M-4,${BAND_Y - 8} h8 l-4,6 z`} fill={tones.trace} />
        </g>
      )}

      {/* keyboard / hover cursor */}
      {interactive && cursorT != null && (
        <g opacity={full && !cursorTaken ? 0.3 : 0.75} pointerEvents="none">
          <line
            x1={x(cursorT)}
            x2={x(cursorT)}
            y1={TOP_Y}
            y2={AXIS_Y}
            stroke={tones.neutral}
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
          <circle
            cx={x(cursorT)}
            cy={TOP_Y}
            r={7}
            fill="none"
            stroke={tones.neutral}
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
          <text
            x={x(cursorT)}
            y={TOP_Y - 13}
            textAnchor="middle"
            fontSize={10.5}
            fontFamily="var(--font-mono)"
            fill={textColor}
          >
            {cursorTaken ? 'remove' : full ? 'full' : `${cursorT}s`}
          </text>
        </g>
      )}

      {/* requests */}
      {requests.map((t, i) => {
        const decision = decisions[i]
        const active = activeIndex === i
        const color = decision == null ? tones.neutral : decision ? tones.ok : tones.bad
        const cx = x(t)
        const knockout = film ? 'var(--color-film)' : '#fff'
        return (
          <g key={t} pointerEvents="none">
            <line
              x1={cx}
              x2={cx}
              y1={TOP_Y + 7}
              y2={AXIS_Y}
              stroke={color}
              strokeWidth={active ? 2 : 1.5}
              opacity={decision == null ? 0.5 : 0.85}
            />
            {active && (
              <circle cx={cx} cy={TOP_Y} r={12} fill={color} opacity={0.22}>
                <animate attributeName="r" values="9;14;9" dur="1.2s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              cx={cx}
              cy={TOP_Y}
              r={7}
              fill={decision == null ? (film ? 'var(--color-film)' : 'var(--color-card)') : color}
              stroke={color}
              strokeWidth={1.8}
              style={{ transition: 'fill 0.2s, stroke 0.2s' }}
            />
            {decision === true && (
              <path
                d={`M${cx - 3},${TOP_Y} l2,2.2 l4,-4.4`}
                fill="none"
                stroke={knockout}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {decision === false && (
              <path
                d={`M${cx - 2.6},${TOP_Y - 2.6} l5.2,5.2 M${cx + 2.6},${TOP_Y - 2.6} l-5.2,5.2`}
                stroke={knockout}
                strokeWidth={1.8}
                strokeLinecap="round"
              />
            )}
          </g>
        )
      })}

      {/* pointer capture: one column per slot, centred on the slot's time */}
      {interactive && (
        <rect
          x={PAD - (snap * perSecond) / 2}
          y={8}
          width={W - PAD * 2}
          height={AXIS_Y + 4}
          fill="transparent"
          onPointerMove={(e) => setCursor(slotFromPointer(e))}
          onPointerLeave={() => setCursor(null)}
          onPointerDown={(e) => {
            const slot = slotFromPointer(e)
            setCursor(slot)
            onToggle?.(slot * snap)
          }}
        />
      )}
    </svg>
  )
}
