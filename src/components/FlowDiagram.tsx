import { useReducedMotion } from 'motion/react'
import { useEffect, useId, useMemo, useRef } from 'react'
import { clamp, cn, FILM_TONE, type Tone } from '@/lib/cn'

/*
 * A live architecture diagram on film. Nodes are components, edges are traffic.
 * Particles flow along each edge at a density set by `rate`, nodes show a load
 * bar and change colour as they saturate, and disabled parts are drawn ghosted.
 * The diagram is a pure function of its props: recompute nodes and edges from
 * your simulation state and the picture follows.
 */

export type FlowSide = 'l' | 'r' | 't' | 'b'

export type FlowNode = {
  id: string
  label: string
  /** Small mono second line (a rate, a count, a state). */
  sub?: string
  /** Centre position in diagram units. */
  x: number
  y: number
  w?: number
  h?: number
  /** Status colour. If omitted it is derived from `load`. */
  tone?: Tone
  /** Utilisation, 0..1+. Draws a load bar; ≥ 1 means saturated. */
  load?: number
  /** Short tag above the top-right corner. */
  badge?: string
  /** Component is switched off / not part of this design. */
  off?: boolean
  shape?: 'box' | 'pill' | 'store'
}

export type FlowEdge = {
  id: string
  from: string
  to: string
  /** Traffic density 0..1. 0 draws an idle edge with no particles. */
  rate?: number
  tone?: Tone
  /** Extra stream of failing traffic, 0..1, drawn in red. */
  errRate?: number
  label?: string
  dashed?: boolean
  off?: boolean
  /** Bend the edge sideways by this many units (to route around nodes). */
  curve?: number
  fromSide?: FlowSide
  toSide?: FlowSide
  /** Particle speed multiplier. */
  speed?: number
}

const NODE_W = 132
const NODE_H = 52

const NORMAL: Record<FlowSide, [number, number]> = {
  l: [-1, 0],
  r: [1, 0],
  t: [0, -1],
  b: [0, 1],
}

function autoSides(a: FlowNode, b: FlowNode): [FlowSide, FlowSide] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) >= Math.abs(dy) * 0.9) return dx >= 0 ? ['r', 'l'] : ['l', 'r']
  return dy >= 0 ? ['b', 't'] : ['t', 'b']
}

function anchor(n: FlowNode, side: FlowSide): [number, number] {
  const w = n.w ?? NODE_W
  const h = n.h ?? NODE_H
  if (side === 'l') return [n.x - w / 2, n.y]
  if (side === 'r') return [n.x + w / 2, n.y]
  if (side === 't') return [n.x, n.y - h / 2]
  return [n.x, n.y + h / 2]
}

function edgeGeometry(a: FlowNode, b: FlowNode, e: FlowEdge) {
  const auto = autoSides(a, b)
  const sa = e.fromSide ?? auto[0]
  const sb = e.toSide ?? auto[1]
  const p1 = anchor(a, sa)
  const p2 = anchor(b, sb)
  const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1
  const k = clamp(dist * 0.42, 16, 90)
  const c1: [number, number] = [p1[0] + NORMAL[sa][0] * k, p1[1] + NORMAL[sa][1] * k]
  const c2: [number, number] = [p2[0] + NORMAL[sb][0] * k, p2[1] + NORMAL[sb][1] * k]
  if (e.curve) {
    const px = (-(p2[1] - p1[1]) / dist) * e.curve
    const py = ((p2[0] - p1[0]) / dist) * e.curve
    c1[0] += px
    c1[1] += py
    c2[0] += px
    c2[1] += py
  }
  const f = (n: number) => n.toFixed(1)
  const d = `M${f(p1[0])},${f(p1[1])} C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`
  const mid: [number, number] = [
    (p1[0] + 3 * c1[0] + 3 * c2[0] + p2[0]) / 8,
    (p1[1] + 3 * c1[1] + 3 * c2[1] + p2[1]) / 8,
  ]
  return { d, mid }
}

function loadTone(load: number | undefined): Tone | undefined {
  if (load == null) return undefined
  if (load >= 1) return 'bad'
  if (load >= 0.75) return 'warn'
  return undefined
}

export function FlowDiagram({
  nodes,
  edges,
  width,
  height,
  selected,
  onSelect,
  paused = false,
  minWidth = 640,
  label,
  className,
}: {
  nodes: FlowNode[]
  edges: FlowEdge[]
  /** Diagram coordinate space; the SVG scales to its container. */
  width: number
  height: number
  selected?: string | null
  onSelect?: (id: string) => void
  paused?: boolean
  minWidth?: number
  /** Accessible description of the diagram. */
  label: string
  className?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const reduce = useReducedMotion()
  const svgRef = useRef<SVGSVGElement>(null)
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    if (paused) svg.pauseAnimations()
    else svg.unpauseAnimations()
  }, [paused])

  const geometry = useMemo(
    () =>
      edges
        .map((e) => {
          const a = nodeById.get(e.from)
          const b = nodeById.get(e.to)
          if (!a || !b) return null
          return { edge: e, ...edgeGeometry(a, b, e) }
        })
        .filter((g) => g != null),
    [edges, nodeById],
  )

  return (
    <div className={cn('thin-scroll on-film overflow-x-auto', className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="block w-full"
        style={{ minWidth }}
        role="img"
        aria-label={label}
      >
        <defs>
          {(Object.keys(FILM_TONE) as Tone[]).map((tone) => (
            <marker
              key={tone}
              id={`${uid}-arrow-${tone}`}
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="6.5"
              markerHeight="6.5"
              orient="auto-start-reverse"
            >
              <path d="M0,1.2 L10,5 L0,8.8 Z" fill={FILM_TONE[tone]} />
            </marker>
          ))}
        </defs>

        {/* edges */}
        {geometry.map(({ edge, d, mid }) => {
          const tone = edge.tone ?? 'trace'
          const color = FILM_TONE[tone]
          const idle = !edge.rate || edge.rate <= 0
          return (
            <g key={edge.id} opacity={edge.off ? 0.22 : 1}>
              <path
                id={`${uid}-e-${edge.id}`}
                d={d}
                fill="none"
                stroke={color}
                strokeOpacity={idle ? 0.28 : 0.55}
                strokeWidth={1.4}
                strokeDasharray={edge.dashed || edge.off ? '4 5' : undefined}
                markerEnd={`url(#${uid}-arrow-${tone})`}
                style={{ transition: 'stroke 0.3s, stroke-opacity 0.3s' }}
              />
              {edge.label && (
                <text
                  x={mid[0]}
                  y={mid[1] - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  fill={idle ? 'var(--color-film-muted)' : color}
                  stroke="var(--color-film)"
                  strokeWidth={3.5}
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {edge.label}
                </text>
              )}
            </g>
          )
        })}

        {/* particles */}
        {!reduce &&
          geometry.map(({ edge }) => {
            if (edge.off) return null
            const streams: { key: string; rate: number; color: string; phase: number }[] = []
            if (edge.rate && edge.rate > 0) {
              streams.push({
                key: 'ok',
                rate: edge.rate,
                color: FILM_TONE[edge.tone ?? 'trace'],
                phase: 0,
              })
            }
            if (edge.errRate && edge.errRate > 0) {
              streams.push({ key: 'err', rate: edge.errRate, color: FILM_TONE.bad, phase: 0.37 })
            }
            return streams.map((s) => {
              const rate = clamp(s.rate, 0, 1)
              const count = clamp(Math.round(rate * 7), 1, 8)
              const dur = (2.3 - rate * 1.1) / (edge.speed ?? 1)
              return (
                <g key={`${edge.id}-${s.key}-${count}-${dur.toFixed(2)}`}>
                  {Array.from({ length: count }, (_, i) => (
                    <circle key={i} r={2.3} fill={s.color}>
                      <animateMotion
                        dur={`${dur.toFixed(2)}s`}
                        begin={`${(-((i + s.phase) / count) * dur).toFixed(2)}s`}
                        repeatCount="indefinite"
                        calcMode="linear"
                      >
                        <mpath href={`#${uid}-e-${edge.id}`} />
                      </animateMotion>
                    </circle>
                  ))}
                </g>
              )
            })
          })}

        {/* nodes */}
        {nodes.map((n) => {
          const w = n.w ?? NODE_W
          const h = n.h ?? NODE_H
          const tone = n.tone ?? loadTone(n.load)
          const stroke = tone ? FILM_TONE[tone] : 'var(--color-film-rule)'
          const isSelected = selected === n.id
          const saturated = !n.off && (n.load ?? 0) >= 1
          const interactive = Boolean(onSelect)
          const rx = n.shape === 'pill' ? h / 2 : 10
          const load = clamp(n.load ?? 0, 0, 1)
          const barColor =
            (n.load ?? 0) >= 1
              ? FILM_TONE.bad
              : (n.load ?? 0) >= 0.75
                ? FILM_TONE.warn
                : FILM_TONE.ok
          return (
            <g
              key={n.id}
              transform={`translate(${n.x - w / 2},${n.y - h / 2})`}
              className={interactive ? 'flow-node' : undefined}
              opacity={n.off ? 0.36 : 1}
              style={{
                transition: 'opacity 0.3s',
                cursor: interactive ? 'pointer' : undefined,
              }}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={
                interactive ? `${n.label}${n.sub ? `, ${n.sub}` : ''}${n.off ? ', off' : ''}` : undefined
              }
              aria-pressed={interactive ? isSelected : undefined}
              onClick={interactive ? () => onSelect?.(n.id) : undefined}
              onKeyDown={
                interactive
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSelect?.(n.id)
                      }
                    }
                  : undefined
              }
            >
              {(isSelected || saturated) && (
                <rect
                  x={-4}
                  y={-4}
                  width={w + 8}
                  height={h + 8}
                  rx={rx + 4}
                  fill="none"
                  stroke={saturated ? FILM_TONE.bad : FILM_TONE.trace}
                  strokeOpacity={0.45}
                  strokeWidth={1.5}
                  className={saturated ? 'animate-pulse' : undefined}
                />
              )}
              <rect
                className="flow-node-box"
                width={w}
                height={h}
                rx={rx}
                fill="var(--color-film-2)"
                stroke={isSelected ? FILM_TONE.trace : stroke}
                strokeWidth={isSelected ? 1.8 : 1.3}
                strokeDasharray={n.off ? '4 4' : undefined}
                style={{ transition: 'stroke 0.3s' }}
              />
              {n.shape === 'store' && (
                <path
                  d={`M9,7.5 H${w - 9}`}
                  stroke={tone ? stroke : 'var(--color-film-muted)'}
                  strokeOpacity={0.6}
                  strokeWidth={1.2}
                  strokeLinecap="round"
                />
              )}
              <text
                x={w / 2}
                y={n.sub ? h / 2 - 1.5 : h / 2 + 4.5}
                textAnchor="middle"
                fontSize={12.5}
                fontWeight={600}
                fill="var(--color-film-text)"
              >
                {n.label}
              </text>
              {n.sub && (
                <text
                  x={w / 2}
                  y={h / 2 + 13}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="var(--font-mono)"
                  fill={tone ? stroke : 'var(--color-film-muted)'}
                >
                  {n.sub}
                </text>
              )}
              {n.load != null && !n.off && (
                <>
                  <rect
                    x={10}
                    y={h - 6.5}
                    width={w - 20}
                    height={2.5}
                    rx={1.25}
                    fill="var(--color-film-3)"
                  />
                  <rect
                    x={10}
                    y={h - 6.5}
                    width={(w - 20) * load}
                    height={2.5}
                    rx={1.25}
                    fill={barColor}
                    style={{ transition: 'width 0.4s ease-out, fill 0.3s' }}
                  />
                </>
              )}
              {n.badge && (
                <text
                  x={w - 2}
                  y={-6}
                  textAnchor="end"
                  fontSize={9.5}
                  fontFamily="var(--font-mono)"
                  fill={tone ? stroke : 'var(--color-film-muted)'}
                >
                  {n.badge}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
