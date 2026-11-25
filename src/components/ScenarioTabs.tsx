import { Check } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { to } from '@/lib/router'
import { useProgress } from '@/lib/storage'

export type ScenarioTab = {
  /** Route segment, e.g. `top-k` → `#/patterns/top-k`. */
  id: string
  title: string
  /** One line on what you will do. */
  sub: string
  icon: ReactNode
  /** Hint-ladder id used for the progress mark. */
  ladderId?: string
}

/**
 * Scenario switcher for a lab with several scenarios. Each tab is a real link,
 * so scenarios are deep-linkable and the back button works.
 */
export function ScenarioTabs({
  basePath,
  items,
  active,
  label,
}: {
  basePath: string
  items: ScenarioTab[]
  active: string
  label: string
}) {
  const { progress } = useProgress()
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul
        className="grid min-w-max gap-2 sm:min-w-0"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(11.5rem, 1fr))` }}
      >
        {items.map((item, i) => {
          const isActive = item.id === active
          const state = item.ladderId ? progress[item.ladderId] : undefined
          const done = Boolean(state && (state.solved || state.rung >= 3))
          const started = Boolean(state)
          return (
            <li key={item.id} className="relative">
              <a
                href={to(`${basePath}/${item.id}`)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative flex h-full flex-col gap-1.5 rounded-xl border px-3.5 py-3 transition-colors duration-150',
                  isActive
                    ? 'border-line bg-card shadow-card'
                    : 'border-rule bg-card/50 hover:border-rule-2 hover:bg-card',
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId={`scenario-${basePath}`}
                    className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-line"
                    transition={{ type: 'spring', stiffness: 480, damping: 40 }}
                  />
                )}
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                      isActive ? 'bg-line text-white' : 'bg-paper-2 text-ink-2 group-hover:text-ink',
                    )}
                  >
                    {item.icon}
                  </span>
                  <span className="num text-[11px] text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                  {item.ladderId ? (
                    <span
                      className={cn(
                        'ml-auto flex size-[18px] items-center justify-center rounded-full border text-white',
                        done
                          ? 'border-ok bg-ok'
                          : started
                            ? 'border-line/60 bg-line/15'
                            : 'border-rule-2 bg-transparent',
                      )}
                      title={done ? 'Worked through' : started ? 'In progress' : 'Not started'}
                    >
                      {done && <Check size={11} strokeWidth={3} />}
                    </span>
                  ) : (
                    <span className="kicker ml-auto text-ink-3">reference</span>
                  )}
                </span>
                <span className="text-[14.5px] leading-tight font-semibold text-ink">
                  {item.title}
                </span>
                <span className="text-[12.5px] leading-snug text-ink-3">{item.sub}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
