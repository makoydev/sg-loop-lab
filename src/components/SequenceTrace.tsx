import { motion } from 'motion/react'
import { useId, useMemo } from 'react'
import { cn, FILM_TONE, type Tone } from '@/lib/cn'

/*
 * A step-driven sequence diagram on film: vertical lifelines for each actor,
 * and one row per step. Used wherever the insight is "who did what, in which
 * order": race conditions, retries, an attack walking through a pipeline.
 * Drive `index` from `usePlayback` and pair it with a <Scrubber>.
 */

export type TraceLane = {
  id: string
  label: string
  /** Small second line under the label. */
  sub?: string
  tone?: Tone
}

export type TraceStep = {
  /** Lane the step starts from. */
  from: string
  /** Target lane. Omit for something that happens inside `from`. */
  to?: string
  /** Short text drawn on the diagram (keep it under ~32 characters). */
  label: string
  /** Sentence explaining the step, shown under the diagram. */
  detail?: string
  tone?: Tone
  /** Draw as a dashed line (a response, or something that did not happen). */
  dashed?: boolean
  /** State values that change at this step; merged into the running readout. */
  state?: Record<string, string | number>
}

const W = 760
const MARGIN = 16
const HEAD_H = 46
const ROW_H = 38
const FILM_BG = 'var(--color-film)'

export function SequenceTrace({
  lanes,
  steps,
  index,
  initialState,
  className,
}: {
  lanes: TraceLane[]
  steps: TraceStep[]
  /** Current step (0-based). Steps after it are not drawn yet. */
  index: number
  initialState?: Record<string, string | number>
  className?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const laneX = useMemo(() => {
    const span = (W - MARGIN * 2) / lanes.length
    const map = new Map<string, number>()
    lanes.forEach((lane, i) => map.set(lane.id, MARGIN + span * (i + 0.5)))
    return map
  }, [lanes])
  const laneW = Math.min(150, (W - MARGIN * 2) / lanes.length - 12)

  const height = HEAD_H + steps.length * ROW_H + 18
  const current = steps[Math.min(index, steps.length - 1)]

  // Running state: fold every step up to `index`, and note what just changed.
  const { state, changed } = useMemo(() => {
    const acc: Record<string, string | number> = { ...initialState }
    let changedKeys: string[] = []
    for (let i = 0; i <= index && i < steps.length; i++) {
      const patch = steps[i]?.state
      if (patch) {
        Object.assign(acc, patch)
        if (i === index) changedKeys = Object.keys(patch)
      }
    }
    return { state: acc, changed: changedKeys }
  }, [steps, index, initialState])

  const stateKeys = Object.keys(state)

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="thin-scroll on-film overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          className="block w-full min-w-[620px]"
          role="img"
          aria-label={`Sequence diagram, step ${index + 1} of ${steps.length}: ${current?.label ?? ''}`}
        >
          <defs>
            {(Object.keys(FILM_TONE) as Tone[]).map((tone) => (
              <marker
                key={tone}
                id={`${uid}-arrow-${tone}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,1 L10,5 L0,9 Z" fill={FILM_TONE[tone]} />
              </marker>
            ))}
          </defs>

          {/* current-row band */}
          {current && (
            <rect
              x={4}
              y={HEAD_H + index * ROW_H + 2}
              width={W - 8}
              height={ROW_H - 2}
              rx={8}
              fill={FILM_TONE[current.tone ?? 'trace']}
              opacity={0.07}
              style={{ transition: 'y 0.3s ease-out' }}
            />
          )}

          {/* lifelines */}
          {lanes.map((lane) => {
            const x = laneX.get(lane.id) ?? 0
            return (
              <line
                key={`life-${lane.id}`}
                x1={x}
                x2={x}
                y1={HEAD_H - 6}
                y2={height - 6}
                stroke="var(--color-film-rule)"
                strokeWidth={1.2}
                strokeDasharray="2 5"
              />
            )
          })}

          {/* lane headers */}
          {lanes.map((lane) => {
            const x = laneX.get(lane.id) ?? 0
            const color = FILM_TONE[lane.tone ?? 'neutral']
            return (
              <g key={`head-${lane.id}`}>
                <rect
                  x={x - laneW / 2}
                  y={6}
                  width={laneW}
                  height={HEAD_H - 14}
                  rx={8}
                  fill="var(--color-film-2)"
                  stroke={lane.tone ? color : 'var(--color-film-rule)'}
                  strokeWidth={1.2}
                />
                <text
                  x={x}
                  y={lane.sub ? 20 : 25.5}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill="var(--color-film-text)"
                >
                  {lane.label}
                </text>
                {lane.sub && (
                  <text
                    x={x}
                    y={32}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontFamily="var(--font-mono)"
                    fill="var(--color-film-muted)"
                  >
                    {lane.sub}
                  </text>
                )}
              </g>
            )
          })}

          {/* steps */}
          {steps.map((step, i) => {
            if (i > index) return null
            const isCurrent = i === index
            const y = HEAD_H + i * ROW_H + ROW_H / 2 + 6
            const tone = step.tone ?? 'trace'
            const color = FILM_TONE[tone]
            const x1 = laneX.get(step.from) ?? 0
            const opacity = isCurrent ? 1 : 0.62
            const textProps = {
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              fill: isCurrent ? '#fff' : 'var(--color-film-text)',
              stroke: FILM_BG,
              strokeWidth: 4,
              paintOrder: 'stroke' as const,
              strokeLinejoin: 'round' as const,
            }

            if (!step.to || step.to === step.from) {
              const rightSide = x1 < W * 0.62
              return (
                <g key={i} opacity={opacity}>
                  <motion.circle
                    key={isCurrent ? `c-${i}-on` : `c-${i}`}
                    cx={x1}
                    cy={y - 4}
                    r={5}
                    fill={FILM_BG}
                    stroke={color}
                    strokeWidth={2}
                    initial={isCurrent ? { scale: 0.2 } : false}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                    style={{ transformOrigin: `${x1}px ${y - 4}px` }}
                  />
                  <text
                    x={rightSide ? x1 + 12 : x1 - 12}
                    y={y}
                    textAnchor={rightSide ? 'start' : 'end'}
                    {...textProps}
                  >
                    {step.label}
                  </text>
                </g>
              )
            }

            const x2 = laneX.get(step.to) ?? 0
            const dir = x2 > x1 ? 1 : -1
            const d = `M${x1 + dir * 5},${y} L${x2 - dir * 7},${y}`
            return (
              <g key={i} opacity={opacity}>
                <motion.path
                  key={isCurrent ? `p-${i}-on` : `p-${i}`}
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={isCurrent ? 2 : 1.5}
                  strokeDasharray={step.dashed ? '5 4' : undefined}
                  markerEnd={`url(#${uid}-arrow-${tone})`}
                  initial={isCurrent && !step.dashed ? { pathLength: 0 } : false}
                  animate={step.dashed ? undefined : { pathLength: 1 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
                <circle cx={x1} cy={y} r={3} fill={color} />
                <text x={(x1 + x2) / 2} y={y - 7} textAnchor="middle" {...textProps}>
                  {step.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {stateKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="State after this step">
          {stateKeys.map((key) => {
            const isChanged = changed.includes(key)
            return (
              <span
                key={isChanged ? `${key}:${state[key]}:${index}` : key}
                className={cn(
                  'num inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px]',
                  isChanged
                    ? 'animate-flash border-trace/60 text-trace'
                    : 'border-film-rule text-film-muted',
                )}
              >
                <span>{key}</span>
                <span className={isChanged ? 'text-white' : 'text-film-text'}>{state[key]}</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
