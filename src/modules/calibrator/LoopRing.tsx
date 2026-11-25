import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/cn'
import { AnimatedNumber } from '@/components/Meter'
import type { Round, RoundId } from './data'

/*
 * The interview loop drawn as a ring: one arc per kind of round, its length
 * the share of the loop's weight. Switching employer type re-cuts the ring.
 */

const VB_W = 440
const VB_H = 340
const CX = VB_W / 2
const CY = VB_H / 2
const R = 104
const STROKE = 36
const C = 2 * Math.PI * R
const GAP = 5
const EASE = 'cubic-bezier(0.2, 0.7, 0.2, 1)'

export function LoopRing({
  rounds,
  weights,
  hot,
  onHot,
  title,
  subtitle,
  className,
}: {
  rounds: Round[]
  weights: Record<RoundId, number>
  /** Round currently hovered or focused elsewhere on the page. */
  hot: RoundId | null
  onHot: (id: RoundId | null) => void
  title: string
  subtitle: string
  className?: string
}) {
  const arcs = rounds.reduce<{ round: Round; frac: number; start: number }[]>((acc, round) => {
    const prev = acc[acc.length - 1]
    const start = prev ? prev.start + prev.frac : 0
    acc.push({ round, frac: weights[round.id] / 100, start })
    return acc
  }, [])

  const hotRound = hot ? rounds.find((r) => r.id === hot) : undefined

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="block w-full"
        role="img"
        aria-label={`Interview mix for ${title}: ${arcs
          .map((a) => `${a.round.name} ${Math.round(a.frac * 100)} percent`)
          .join(', ')}`}
      >
        {/* track */}
        <circle
          cx={CX}
          cy={CY}
          r={R}
          fill="none"
          stroke="var(--color-paper-3)"
          strokeWidth={STROKE}
          opacity={0.6}
        />

        {arcs.map(({ round, frac, start }) => {
          const len = Math.max(0.01, frac * C - GAP)
          const dim = hot != null && hot !== round.id
          return (
            <circle
              key={round.id}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={round.color}
              strokeWidth={hot === round.id ? STROKE + 8 : STROKE}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-(start * C + GAP / 2)}
              transform={`rotate(-90 ${CX} ${CY})`}
              opacity={dim ? 0.32 : 1}
              style={{
                transition: `stroke-dasharray 0.8s ${EASE}, stroke-dashoffset 0.8s ${EASE}, stroke-width 0.2s ease, opacity 0.2s ease`,
                cursor: 'pointer',
              }}
              onPointerEnter={() => onHot(round.id)}
              onPointerLeave={() => onHot(null)}
            />
          )
        })}

        {/* labels ride on the arc midpoints */}
        {arcs.map(({ round, frac, start }) => {
          const theta = (start + frac / 2) * Math.PI * 2 - Math.PI / 2
          const ax = CX + Math.cos(theta) * R
          const ay = CY + Math.sin(theta) * R
          const lx = CX + Math.cos(theta) * (R + STROKE / 2 + 14)
          const ly = CY + Math.sin(theta) * (R + STROKE / 2 + 14)
          const side = Math.cos(theta) > 0.25 ? 'start' : Math.cos(theta) < -0.25 ? 'end' : 'middle'
          const dim = hot != null && hot !== round.id
          return (
            <g key={round.id} pointerEvents="none">
              <g
                style={{
                  transform: `translate(${ax}px, ${ay}px)`,
                  transition: `transform 0.8s ${EASE}`,
                }}
              >
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12.5}
                  fontWeight={600}
                  fontFamily="var(--font-mono)"
                  fill={round.id === 'agentic' ? 'var(--color-ink)' : '#fff'}
                  opacity={frac < 0.07 ? 0 : dim ? 0.4 : 1}
                  style={{ transition: 'opacity 0.2s ease' }}
                >
                  {Math.round(frac * 100)}
                </text>
              </g>
              <g
                style={{
                  transform: `translate(${lx}px, ${ly}px)`,
                  transition: `transform 0.8s ${EASE}`,
                }}
              >
                <text
                  textAnchor={side}
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={hot === round.id ? 600 : 500}
                  fill={dim ? 'var(--color-ink-3)' : 'var(--color-ink-2)'}
                  style={{ transition: 'fill 0.2s ease' }}
                >
                  {round.short}
                </text>
              </g>
            </g>
          )
        })}
      </svg>

      {/* centre read-out */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="flex w-[9.5rem] flex-col items-center text-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={hotRound ? hotRound.id : title}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col items-center"
            >
              {hotRound ? (
                <>
                  <span className="num text-[34px] leading-none font-medium text-ink">
                    <AnimatedNumber value={weights[hotRound.id]} />
                    <span className="text-[18px] text-ink-3">%</span>
                  </span>
                  <span className="mt-1.5 text-[12.5px] leading-tight font-medium text-ink-2">
                    {hotRound.name}
                  </span>
                </>
              ) : (
                <>
                  <span className="display text-[19px] leading-[1.1] font-[600] text-ink">
                    {title}
                  </span>
                  <span className="kicker mt-2 text-ink-3">{subtitle}</span>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
