import { Pause, Play, RotateCcw, StepBack, StepForward } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { cn, FILM_TONE, PAPER_TONE, type Tone } from '@/lib/cn'
import type { Playback } from '@/lib/usePlayback'
import type { Surface } from './ui'

const SPEEDS = [0.5, 1, 2]

/**
 * Transport controls for a `usePlayback` timeline: rewind, step, play/pause,
 * a draggable scrub bar, and a speed toggle. `marks` flags notable frames.
 */
export function Scrubber({
  playback,
  surface = 'film',
  marks,
  caption,
  showSpeed = true,
  className,
}: {
  playback: Playback
  surface?: Surface
  /** Frames worth jumping to (a swap, a rejection, the moment it breaks). */
  marks?: { index: number; tone?: Tone }[]
  /** One-line description of the current frame. */
  caption?: ReactNode
  showSpeed?: boolean
  className?: string
}) {
  const film = surface === 'film'
  const { index, length, playing, speed } = playback
  const last = Math.max(1, length - 1)
  const pct = (index / last) * 100
  const tones = film ? FILM_TONE : PAPER_TONE

  const iconButton = cn(
    'inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 disabled:opacity-30',
    film
      ? 'text-film-muted hover:bg-film-3 hover:text-film-text'
      : 'text-ink-3 hover:bg-paper-2 hover:text-ink',
  )

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {caption != null && (
        <div
          className={cn(
            'min-h-[2.6em] text-[13.5px] leading-snug',
            film ? 'text-film-text' : 'text-ink',
          )}
          aria-live="polite"
        >
          {caption}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={iconButton}
          onClick={playback.reset}
          disabled={playback.atStart && !playing}
          aria-label="Rewind to the first step"
        >
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={playback.prev}
          disabled={playback.atStart}
          aria-label="Previous step"
        >
          <StepBack size={16} />
        </button>
        <button
          type="button"
          onClick={playback.toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className={cn(
            'inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-[filter,transform] duration-150 hover:brightness-110 active:scale-95',
            film ? 'bg-trace text-film' : 'bg-ink text-paper',
          )}
        >
          {playing ? <Pause size={16} /> : <Play size={16} className="translate-x-px" />}
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={playback.next}
          disabled={playback.atEnd}
          aria-label="Next step"
        >
          <StepForward size={16} />
        </button>

        <div className="relative mx-2 min-w-0 flex-1">
          {marks && marks.length > 0 && (
            <div className="pointer-events-none absolute inset-x-2 top-0 h-[5px]" aria-hidden>
              {marks.map((m) => (
                <span
                  key={`${m.index}-${m.tone ?? 'trace'}`}
                  className="absolute top-0 h-[5px] w-[3px] -translate-x-1/2 rounded-full"
                  style={{
                    left: `${(m.index / last) * 100}%`,
                    backgroundColor: tones[m.tone ?? 'trace'],
                  }}
                />
              ))}
            </div>
          )}
          <input
            type="range"
            min={0}
            max={Math.max(0, length - 1)}
            step={1}
            value={index}
            disabled={length <= 1}
            onChange={(e) => {
              playback.pause()
              playback.setIndex(Number(e.target.value))
            }}
            aria-label="Scrub through the steps"
            aria-valuetext={`Step ${index + 1} of ${length}`}
            className={cn('scrub block', !film && 'scrub-paper')}
            style={{ '--scrub-pct': `${pct}%` } as CSSProperties}
          />
        </div>

        <span
          className={cn(
            'num shrink-0 text-[12px] tabular-nums',
            film ? 'text-film-muted' : 'text-ink-3',
          )}
        >
          <span className={film ? 'text-film-text' : 'text-ink'}>
            {String(index + 1).padStart(2, '0')}
          </span>
          /{String(length).padStart(2, '0')}
        </span>

        {showSpeed && (
          <button
            type="button"
            onClick={() =>
              playback.setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1)
            }
            aria-label={`Playback speed ${speed}×. Click to change.`}
            className={cn(
              'num h-7 w-11 shrink-0 rounded-md border text-[11.5px] transition-colors duration-150',
              film
                ? 'border-film-rule text-film-muted hover:border-trace/60 hover:text-film-text'
                : 'border-rule-2 text-ink-3 hover:border-ink hover:text-ink',
            )}
          >
            {speed}×
          </button>
        )}
      </div>
    </div>
  )
}
