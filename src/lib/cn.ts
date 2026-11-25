export type ClassValue = string | number | bigint | boolean | null | undefined | ClassValue[]

/** Join class names, skipping falsy values. */
export function cn(...values: ClassValue[]): string {
  const out: string[] = []
  for (const v of values) {
    if (!v || v === true) continue
    if (Array.isArray(v)) {
      const inner = cn(...v)
      if (inner) out.push(inner)
    } else {
      out.push(String(v))
    }
  }
  return out.join(' ')
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Semantic tone shared by every visualizer. */
export type Tone = 'neutral' | 'trace' | 'ok' | 'warn' | 'bad' | 'info'

/** CSS colour for a tone on the dark "film" surface. */
export const FILM_TONE: Record<Tone, string> = {
  neutral: 'var(--color-film-muted)',
  trace: 'var(--color-trace)',
  ok: 'var(--color-f-ok)',
  warn: 'var(--color-f-warn)',
  bad: 'var(--color-f-bad)',
  info: 'var(--color-f-info)',
}

/** CSS colour for a tone on the light "paper" surface. */
export const PAPER_TONE: Record<Tone, string> = {
  neutral: 'var(--color-ink-3)',
  trace: 'var(--color-ink)',
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  bad: 'var(--color-bad)',
  info: 'var(--color-line-purple)',
}
