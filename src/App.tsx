import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect } from 'react'
import { cn } from '@/lib/cn'
import { LABS, lineStyle, type LabMeta } from '@/lib/lines'
import { to, useRoute } from '@/lib/router'
import { useProgress } from '@/lib/storage'
import Calibrator from '@/modules/calibrator'

const Patterns = lazy(() => import('@/modules/patterns'))
const BugBash = lazy(() => import('@/modules/bugbash'))
const Design = lazy(() => import('@/modules/design'))
const Translator = lazy(() => import('@/modules/translator'))
const Sources = lazy(() => import('@/modules/calibrator/Sources'))

function LoopMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle
        cx="16"
        cy="16"
        r="10.5"
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="3.2"
        strokeDasharray="48 18"
        strokeLinecap="round"
        transform="rotate(-58 16 16)"
      />
      <circle cx="25" cy="9.8" r="3.6" fill="var(--color-line-red)" />
    </svg>
  )
}

function Station({
  lab,
  active,
  pct,
  first,
}: {
  lab: LabMeta
  active: boolean
  pct: number
  first: boolean
}) {
  return (
    <li className="flex items-center">
      {!first && <span className="h-0.5 w-3 bg-rule-2 sm:w-5" aria-hidden />}
      <a
        href={to(lab.path)}
        aria-current={active ? 'page' : undefined}
        title={`${lab.name}: ${lab.round}`}
        aria-label={lab.name}
        className={cn(
          'group flex items-center gap-2 rounded-full p-1.5 transition-colors duration-150 sm:pr-2.5',
          active ? 'bg-card shadow-card' : 'hover:bg-paper-2',
        )}
      >
        <span
          className="flex size-[22px] shrink-0 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110"
          style={{
            background: `conic-gradient(${lab.color} ${pct}%, var(--color-rule-2) 0)`,
          }}
        >
          <span
            className="size-[14px] rounded-full border-[3px] transition-colors duration-200"
            style={{
              borderColor: 'var(--color-paper)',
              backgroundColor: active ? lab.color : 'var(--color-paper)',
              boxShadow: `inset 0 0 0 2px ${lab.color}`,
            }}
          />
        </span>
        <span
          className={cn(
            'hidden text-[13px] leading-none font-medium whitespace-nowrap md:block',
            active ? 'text-ink' : 'text-ink-2 group-hover:text-ink',
          )}
        >
          {lab.short}
        </span>
        <span className="num hidden text-[10.5px] leading-none text-ink-3 sm:block md:hidden">
          {lab.code}
        </span>
      </a>
    </li>
  )
}

function TopBar({ activeId }: { activeId?: string }) {
  const { progress } = useProgress()
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
        <a href={to('/')} className="flex shrink-0 items-center gap-2" aria-label="Loop Lab home">
          <LoopMark className="size-7" />
          <span className="display text-[19px] leading-none font-[640]">Loop Lab</span>
          <span className="kicker ml-1 hidden rounded border border-rule-2 px-1.5 py-1 text-ink-3 lg:inline">
            SG · 2026
          </span>
        </a>
        <nav aria-label="Labs" className="ml-auto min-w-0 overflow-x-auto">
          <ol className="flex items-center">
            {LABS.map((lab, i) => {
              const done = lab.ladders.filter((id) => {
                const p = progress[id]
                return p && (p.solved || p.rung >= 3)
              }).length
              const pct = lab.ladders.length ? (done / lab.ladders.length) * 100 : 0
              return (
                <Station
                  key={lab.id}
                  lab={lab}
                  active={lab.id === activeId}
                  pct={pct}
                  first={i === 0}
                />
              )
            })}
          </ol>
        </nav>
      </div>
    </header>
  )
}

function Footer() {
  const { progress, reset } = useProgress()
  const hasProgress = Object.keys(progress).length > 0
  return (
    <footer className="border-t border-rule bg-paper/70">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-8 text-[13px] text-ink-3 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <p className="max-w-xl leading-relaxed">
          Loop Lab runs entirely in your browser. There is no account and no backend, and your
          progress stays on this device. The numbers inside the sandboxes come from small teaching
          models, not benchmarks.
        </p>
        <div className="flex shrink-0 items-center gap-5">
          <a
            href={to('/sources')}
            className="font-medium text-ink-2 underline decoration-rule-2 underline-offset-4 hover:text-ink hover:decoration-ink"
          >
            Sources & caveats
          </a>
          <button
            type="button"
            onClick={reset}
            disabled={!hasProgress}
            className="font-medium text-ink-2 underline decoration-rule-2 underline-offset-4 hover:text-ink hover:decoration-ink disabled:no-underline disabled:opacity-40"
          >
            Reset progress
          </button>
        </div>
      </div>
    </footer>
  )
}

function Loading() {
  return (
    <div className="flex flex-col gap-4 py-10" aria-busy="true" aria-label="Loading lab">
      <div className="h-4 w-40 animate-pulse rounded bg-paper-3" />
      <div className="h-12 w-2/3 animate-pulse rounded-lg bg-paper-3" />
      <div className="h-72 animate-pulse rounded-2xl bg-paper-2" />
    </div>
  )
}

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="kicker text-ink-3">Off the map</p>
      <h1 className="mt-3 text-4xl font-[560]">This station does not exist.</h1>
      <a
        href={to('/')}
        className="mt-6 inline-block font-medium underline decoration-rule-2 underline-offset-4 hover:decoration-ink"
      >
        Back to the Loop Calibrator
      </a>
    </div>
  )
}

export default function App() {
  const route = useRoute()
  const head = route[0]
  const sub = route[1]
  const lab = LABS.find((l) => l.path === `/${head ?? ''}`)
  const color = lab?.color ?? 'var(--color-ink)'

  // Jump to the top when changing lab (not when switching scenario inside one).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [head])

  let page
  if (head === undefined) page = <Calibrator />
  else if (head === 'patterns') page = <Patterns sub={sub} />
  else if (head === 'bugbash') page = <BugBash sub={sub} />
  else if (head === 'design') page = <Design sub={sub} />
  else if (head === 'translator') page = <Translator sub={sub} />
  else if (head === 'sources') page = <Sources />
  else page = <NotFound />

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh flex-col" style={lineStyle(color)}>
        <TopBar activeId={lab?.id} />
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
          <Suspense fallback={<Loading />}>{page}</Suspense>
        </main>
        <Footer />
      </div>
    </MotionConfig>
  )
}
