import { useCallback, useEffect, useMemo, useState } from 'react'
import { clamp } from './cn'

/*
 * Step-through playback for every "X-Ray" visualizer: an index into a list of
 * precomputed frames, with play / pause / step / scrub and a speed control.
 * Visualizers compute their frames up front, so scrubbing backwards is free.
 */

export type Playback = {
  /** Current frame, always within [0, length - 1]. */
  index: number
  length: number
  playing: boolean
  speed: number
  atStart: boolean
  atEnd: boolean
  setIndex: (i: number) => void
  play: () => void
  pause: () => void
  toggle: () => void
  next: () => void
  prev: () => void
  reset: () => void
  setSpeed: (s: number) => void
}

export type PlaybackOptions = {
  /** Milliseconds per frame at 1× speed. */
  stepMs?: number
  autoPlay?: boolean
  loop?: boolean
  /** Change this value to rewind to frame 0 (e.g. when the scenario changes). */
  resetKey?: string | number
}

export function usePlayback(length: number, options: PlaybackOptions = {}): Playback {
  const { stepMs = 900, autoPlay = false, loop = false, resetKey } = options
  const [rawIndex, setRawIndex] = useState(0)
  const [playing, setPlaying] = useState(autoPlay)
  const [speed, setSpeed] = useState(1)

  // Rewind when the scenario changes (render-phase state adjustment).
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setRawIndex(0)
    setPlaying(autoPlay)
  }

  const last = Math.max(0, length - 1)
  const index = clamp(rawIndex, 0, last)

  useEffect(() => {
    if (!playing) return
    if (index >= last) {
      const t = window.setTimeout(
        () => {
          if (loop && last > 0) setRawIndex(0)
          else setPlaying(false)
        },
        loop ? (stepMs / speed) * 1.6 : 0,
      )
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => setRawIndex(index + 1), stepMs / speed)
    return () => window.clearTimeout(t)
  }, [playing, index, last, stepMs, speed, loop])

  const setIndex = useCallback((i: number) => setRawIndex(clamp(Math.round(i), 0, last)), [last])
  const pause = useCallback(() => setPlaying(false), [])
  const play = useCallback(() => {
    // Pressing play at the end replays from the start.
    setRawIndex((i) => (i >= last ? 0 : i))
    setPlaying(true)
  }, [last])
  const toggle = useCallback(() => {
    if (playing) setPlaying(false)
    else play()
  }, [playing, play])
  const next = useCallback(() => {
    setPlaying(false)
    setRawIndex((i) => clamp(i + 1, 0, last))
  }, [last])
  const prev = useCallback(() => {
    setPlaying(false)
    setRawIndex((i) => clamp(i - 1, 0, last))
  }, [last])
  const reset = useCallback(() => {
    setPlaying(false)
    setRawIndex(0)
  }, [])

  return useMemo(
    () => ({
      index,
      length,
      playing,
      speed,
      atStart: index === 0,
      atEnd: index >= last,
      setIndex,
      play,
      pause,
      toggle,
      next,
      prev,
      reset,
      setSpeed,
    }),
    [index, length, playing, speed, last, setIndex, play, pause, toggle, next, prev, reset],
  )
}
