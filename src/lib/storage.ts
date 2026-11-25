import { useCallback, useSyncExternalStore } from 'react'

/*
 * localStorage-backed state shared across components. Everything stays in the
 * browser: there is no account, no backend, nothing leaves the device.
 */

const PREFIX = 'loop-lab:'
const cache = new Map<string, unknown>()
const listeners = new Map<string, Set<() => void>>()

function read<T>(key: string, initial: T): T {
  if (cache.has(key)) return cache.get(key) as T
  let value = initial
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw != null) value = JSON.parse(raw) as T
  } catch {
    // Private mode or corrupted entry: fall back to the initial value.
  }
  cache.set(key, value)
  return value
}

function write<T>(key: string, value: T): void {
  cache.set(key, value)
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Storage full or unavailable: keep the in-memory value for this session.
  }
  listeners.get(key)?.forEach((notify) => notify())
}

export function useLocalStorage<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const subscribe = useCallback(
    (notify: () => void) => {
      let set = listeners.get(key)
      if (!set) {
        set = new Set()
        listeners.set(key, set)
      }
      set.add(notify)
      return () => {
        set.delete(notify)
      }
    },
    [key],
  )
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, initial),
    () => initial,
  )
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = read(key, initial)
      write(key, typeof next === 'function' ? (next as (p: T) => T)(prev) : next)
    },
    // `initial` only matters before the first write; callers pass constants.
    // eslint-disable-next-line react/exhaustive-deps
    [key],
  )
  return [value, setValue]
}

/* ── lab progress ─────────────────────────────────────────────────────── */

/** How far up the hint ladder a lab has been taken (0 = struggle … 3 = takeaway). */
export type LabProgress = { rung: number; solved: boolean }
export type ProgressMap = Record<string, LabProgress>

const EMPTY: ProgressMap = {}

export function useProgress(): {
  progress: ProgressMap
  mark: (id: string, patch: Partial<LabProgress>) => void
  reset: () => void
} {
  const [progress, setProgress] = useLocalStorage<ProgressMap>('progress', EMPTY)
  const mark = useCallback(
    (id: string, patch: Partial<LabProgress>) => {
      setProgress((prev) => {
        const cur = prev[id] ?? { rung: 0, solved: false }
        const next: LabProgress = {
          rung: Math.max(cur.rung, patch.rung ?? 0),
          solved: cur.solved || Boolean(patch.solved),
        }
        if (next.rung === cur.rung && next.solved === cur.solved && prev[id]) return prev
        return { ...prev, [id]: next }
      })
    },
    [setProgress],
  )
  const reset = useCallback(() => setProgress(EMPTY), [setProgress])
  return { progress, mark, reset }
}
