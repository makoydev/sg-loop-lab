import { Check, TriangleAlert, X } from 'lucide-react'
import { motion } from 'motion/react'
import { cn, FILM_TONE, PAPER_TONE, type Tone } from '@/lib/cn'
import type { Surface } from '@/components/ui'
import {
  LEVELS,
  OPENING_BANDS,
  type Level,
  type LevelReading,
  type Note,
  type NoteTone,
  type OpeningBand,
} from './logic'

/* The two read-outs of the Translator, and the notes that explain them. */

const BAND_TONE: Record<OpeningBand, Tone> = {
  empty: 'neutral',
  pm: 'bad',
  unclear: 'warn',
  engineer: 'trace',
  lead: 'ok',
}

const LEVEL_TONE: Record<Level, Tone> = { mid: 'warn', senior: 'trace', staff: 'ok' }

function Marker({ color }: { color: string }) {
  return (
    <svg width="14" height="9" viewBox="0 0 14 9" aria-hidden className="block">
      <path d="M0,0 H14 L7,9 Z" fill={color} />
    </svg>
  )
}

/**
 * Where an opening lands, from "project manager who used to code" to
 * "engineer who can lead".
 */
export function ImpressionGauge({
  score,
  band,
  surface = 'paper',
  className,
}: {
  score: number
  band: OpeningBand
  surface?: Surface
  className?: string
}) {
  const film = surface === 'film'
  const tones = film ? FILM_TONE : PAPER_TONE
  const idle = film ? 'var(--color-film-3)' : 'var(--color-paper-3)'
  const bounds = [...OPENING_BANDS.map((b) => b.from), 100]
  const markerColor = band === 'empty' ? tones.neutral : tones[BAND_TONE[band]]
  return (
    <div
      className={cn('relative pt-3.5', className)}
      role="img"
      aria-label={`Impression: ${score} out of 100`}
    >
      <motion.div
        className="absolute top-0"
        initial={false}
        animate={{ left: `${score}%` }}
        transition={{ type: 'spring', stiffness: 160, damping: 22 }}
        style={{ x: '-50%' }}
      >
        <Marker color={markerColor} />
      </motion.div>
      <div className="flex h-2.5 gap-[3px]">
        {OPENING_BANDS.map((b, i) => (
          <span
            key={b.band}
            className="rounded-full transition-colors duration-300"
            style={{
              flexGrow: bounds[i + 1]! - bounds[i]!,
              flexBasis: 0,
              backgroundColor: b.band === band ? tones[BAND_TONE[b.band]] : idle,
            }}
          />
        ))}
      </div>
      <div
        className={cn(
          'mt-1.5 flex justify-between gap-6 text-[11px] leading-tight',
          film ? 'text-film-muted' : 'text-ink-3',
        )}
      >
        <span>Project manager who used to code</span>
        <span className="text-right">Engineer who can lead</span>
      </div>
    </div>
  )
}

/** Mid-level, senior, staff-track: where an assembled answer is levelled. */
export function LevelBar({
  reading,
  surface = 'paper',
  className,
}: {
  reading: LevelReading
  surface?: Surface
  className?: string
}) {
  const film = surface === 'film'
  const tones = film ? FILM_TONE : PAPER_TONE
  const idle = film ? 'var(--color-film-3)' : 'var(--color-paper-3)'
  const started = reading.chosen > 0
  const markerColor = started ? tones[LEVEL_TONE[reading.level]] : tones.neutral
  return (
    <div
      className={cn('relative pt-3.5', className)}
      role="img"
      aria-label={
        started
          ? `Level reading: ${LEVELS.find((l) => l.level === reading.level)!.label}${reading.complete ? '' : ', provisional'}`
          : 'Level reading: nothing chosen yet'
      }
    >
      <motion.div
        className="absolute top-0"
        initial={false}
        animate={{ left: `${started ? reading.position : 4}%`, opacity: reading.complete ? 1 : 0.5 }}
        transition={{ type: 'spring', stiffness: 160, damping: 22 }}
        style={{ x: '-50%' }}
      >
        <Marker color={markerColor} />
      </motion.div>
      <div className="grid grid-cols-3 gap-[3px]">
        {LEVELS.map((l) => {
          const active = started && l.level === reading.level
          return (
            <div key={l.level}>
              <div
                className="h-2.5 rounded-full transition-colors duration-300"
                style={{
                  backgroundColor: active ? tones[LEVEL_TONE[l.level]] : idle,
                  opacity: active && !reading.complete ? 0.55 : 1,
                }}
              />
              <div
                className={cn(
                  'mt-1.5 text-center text-[11px] leading-tight font-medium transition-colors duration-300',
                  active
                    ? film
                      ? 'text-film-text'
                      : 'text-ink'
                    : film
                      ? 'text-film-muted'
                      : 'text-ink-3',
                )}
              >
                {l.label}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const NOTE_ICON: Record<NoteTone, typeof Check> = { ok: Check, warn: TriangleAlert, bad: X }

/** One line from an interviewer's notepad: a verdict mark and what they wrote. */
export function NoteMark({ tone, surface = 'paper' }: { tone: NoteTone; surface?: Surface }) {
  const Icon = NOTE_ICON[tone]
  const color = (surface === 'film' ? FILM_TONE : PAPER_TONE)[tone]
  return (
    <span
      className="mt-[3px] flex size-[18px] shrink-0 items-center justify-center rounded-full"
      style={{ color, backgroundColor: `color-mix(in oklab, ${color} 15%, transparent)` }}
      aria-hidden
    >
      <Icon size={11} strokeWidth={2.75} />
    </span>
  )
}

const TONE_WORD: Record<NoteTone, string> = { ok: 'Good', warn: 'Concern', bad: 'Problem' }

/** The interviewer's notes, written the way they would jot them down. */
export function NoteList({
  notes,
  surface = 'paper',
  className,
}: {
  notes: Note[]
  surface?: Surface
  className?: string
}) {
  const film = surface === 'film'
  return (
    <ul className={cn('flex flex-col gap-2.5', className)} aria-live="polite">
      {notes.map((note) => (
        <motion.li
          key={note.text}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.26, ease: [0.2, 0.7, 0.2, 1] }}
          className="flex gap-2.5"
        >
          <NoteMark tone={note.tone} surface={surface} />
          <span
            className={cn(
              'display text-[14.5px] leading-snug font-[430] italic',
              film ? 'text-film-text' : 'text-ink',
            )}
          >
            <span className="sr-only">{TONE_WORD[note.tone]}: </span>
            {note.text}
          </span>
        </motion.li>
      ))}
    </ul>
  )
}
