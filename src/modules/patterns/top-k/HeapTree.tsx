import { motion } from 'motion/react'
import { cn } from '@/lib/cn'
import type { Surface } from '@/components/ui'
import { childrenOf, parentOf, type Item } from './logic'

/*
 * One heap, two honest pictures of it: the tree you reason about and the flat
 * array you actually store. Items are keyed by id, so when two trade places
 * they visibly travel instead of blinking.
 */

type Highlights = {
  /** Heap indices being compared right now. */
  compare?: number[]
  /** Heap index of the value that is moving. */
  at?: number | null
  /** A parent/child edge that breaks the heap property. */
  badEdge?: [number, number] | null
}

function layout(capacity: number) {
  const levels = Math.floor(Math.log2(Math.max(1, capacity))) + 1
  return Array.from({ length: capacity }, (_, i) => {
    const level = Math.floor(Math.log2(i + 1))
    const slots = 2 ** level
    const pos = i - (slots - 1)
    return {
      x: ((pos + 0.5) / slots) * 100,
      y: ((level + 0.5) / levels) * 100,
    }
  })
}

const SPRING = { type: 'spring', stiffness: 380, damping: 30 } as const

export function HeapTree({
  items,
  capacity,
  surface,
  compare = [],
  at = null,
  badEdge = null,
  clickable = [],
  onNodeClick,
  rootLabel = 'gate',
  height = 232,
  className,
}: Highlights & {
  items: Item[]
  /** Number of slots (K). Empty slots are drawn while the heap is filling. */
  capacity: number
  surface: Surface
  /** Heap indices that respond to a click (the hand-run challenge). */
  clickable?: number[]
  onNodeClick?: (index: number) => void
  rootLabel?: string
  height?: number
  className?: string
}) {
  const film = surface === 'film'
  const spots = layout(capacity)
  const edgeColor = film ? 'var(--color-film-rule)' : 'var(--color-rule-2)'
  const badColor = film ? 'var(--color-f-bad)' : 'var(--color-bad)'
  const liveColor = film ? 'var(--color-f-warn)' : 'var(--color-warn)'

  return (
    <div className={cn('relative w-full', className)} style={{ height }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full"
        aria-hidden
      >
        {spots.map((spot, i) => {
          if (i === 0) return null
          const p = parentOf(i)
          const parent = spots[p]!
          const exists = i < items.length
          const isBad = badEdge != null && badEdge[0] === p && badEdge[1] === i
          const isLive = compare.includes(i) && compare.includes(p)
          return (
            <line
              key={i}
              x1={parent.x}
              y1={parent.y}
              x2={spot.x}
              y2={spot.y}
              stroke={isBad ? badColor : isLive ? liveColor : edgeColor}
              strokeWidth={isBad ? 3 : isLive ? 2.2 : 1.5}
              strokeDasharray={exists ? undefined : '3 4'}
              opacity={exists ? 1 : 0.6}
              vectorEffect="non-scaling-stroke"
              style={{ transition: 'stroke 0.2s' }}
            />
          )
        })}
      </svg>

      {/* empty slots while the heap fills */}
      {spots.map((spot, i) =>
        i >= items.length ? (
          <span
            key={`slot-${i}`}
            className={cn(
              'absolute flex size-[50px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-dashed',
              film ? 'border-film-rule bg-film' : 'border-rule-2 bg-card',
            )}
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            aria-hidden
          />
        ) : null,
      )}

      {items.map((item, i) => {
        const spot = spots[i]!
        const isAt = at === i
        const isCompared = compare.includes(i)
        const canClick = clickable.includes(i) && Boolean(onNodeClick)
        const isRoot = i === 0
        const inBadEdge = badEdge != null && (badEdge[0] === i || badEdge[1] === i)

        const tone = isAt
          ? film
            ? 'border-trace bg-trace text-film'
            : 'border-line bg-line text-white'
          : inBadEdge
            ? film
              ? 'border-f-bad bg-f-bad/15 text-f-bad'
              : 'border-bad bg-bad-wash text-bad'
            : isCompared
              ? film
                ? 'border-f-warn bg-f-warn/15 text-f-warn'
                : 'border-warn bg-warn-wash text-warn'
              : film
                ? cn('bg-film-2 text-film-text', isRoot ? 'border-trace/70' : 'border-film-rule')
                : cn('bg-card text-ink', isRoot ? 'border-ink' : 'border-rule-2')

        const body = (
          <>
            <span className="num text-[17px] leading-none font-medium">{item.value}</span>
            <span
              className={cn(
                'num absolute -bottom-[18px] text-[10px] leading-none',
                film ? 'text-film-muted' : 'text-ink-3',
              )}
            >
              [{i}]
            </span>
            {isRoot && (
              <span
                className={cn(
                  'kicker absolute -top-[19px] text-[9.5px] whitespace-nowrap',
                  film ? 'text-trace' : 'text-ink-2',
                )}
              >
                {rootLabel}
              </span>
            )}
          </>
        )

        const shared = cn(
          'absolute flex size-[50px] items-center justify-center rounded-full border-2 transition-colors duration-200',
          tone,
          canClick &&
            'cursor-pointer ring-2 ring-offset-2 hover:scale-105 ' +
              (film ? 'ring-trace/60 ring-offset-film' : 'ring-line/50 ring-offset-card'),
        )

        return (
          <motion.div
            key={item.id}
            className="absolute"
            initial={false}
            animate={{ left: `${spot.x}%`, top: `${spot.y}%` }}
            transition={SPRING}
            style={{ zIndex: isAt ? 3 : 2 }}
          >
            {canClick ? (
              <button
                type="button"
                onClick={() => onNodeClick?.(i)}
                aria-label={`Swap with ${item.value} at index ${i}`}
                className={cn(shared, '-translate-x-1/2 -translate-y-1/2')}
              >
                {body}
              </button>
            ) : (
              <span className={cn(shared, '-translate-x-1/2 -translate-y-1/2')}>{body}</span>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

/** The same heap as the array it is stored in, with the index arithmetic. */
export function HeapArray({
  items,
  capacity,
  surface,
  compare = [],
  at = null,
  className,
}: Highlights & {
  items: Item[]
  capacity: number
  surface: Surface
  className?: string
}) {
  const film = surface === 'film'
  const focus = at ?? null
  const kids = focus != null ? childrenOf(focus, items.length) : []
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-end gap-1.5">
        <span
          className={cn('num mb-[17px] text-[11px]', film ? 'text-film-muted' : 'text-ink-3')}
        >
          heap =
        </span>
        {Array.from({ length: capacity }, (_, i) => {
          const item = items[i]
          const isAt = at === i
          const isCompared = compare.includes(i)
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'num flex h-9 w-10 items-center justify-center rounded-md border text-[14px] transition-colors duration-200',
                  !item
                    ? film
                      ? 'border-dashed border-film-rule text-film-muted/40'
                      : 'border-dashed border-rule-2 text-ink-3/40'
                    : isAt
                      ? film
                        ? 'border-trace bg-trace text-film'
                        : 'border-line bg-line text-white'
                      : isCompared
                        ? film
                          ? 'border-f-warn bg-f-warn/15 text-f-warn'
                          : 'border-warn bg-warn-wash text-warn'
                        : film
                          ? 'border-film-rule bg-film-2 text-film-text'
                          : 'border-rule-2 bg-card text-ink',
                )}
              >
                {item ? item.value : '·'}
              </span>
              <span className={cn('num text-[10px]', film ? 'text-film-muted' : 'text-ink-3')}>
                {i}
              </span>
            </div>
          )
        })}
      </div>
      <p className={cn('num text-[11.5px] leading-snug', film ? 'text-film-muted' : 'text-ink-3')}>
        {focus == null ? (
          <>children of i are at 2i + 1 and 2i + 2, its parent at (i − 1) // 2</>
        ) : kids.length > 0 ? (
          <>
            i = {focus}: children at 2·{focus} + 1 = {2 * focus + 1}
            {kids.length > 1 ? ` and 2·${focus} + 2 = ${2 * focus + 2}` : ' (no right child)'}
          </>
        ) : (
          <>
            i = {focus}: 2·{focus} + 1 = {2 * focus + 1} is past the end, so it has no children
          </>
        )}
      </p>
    </div>
  )
}
