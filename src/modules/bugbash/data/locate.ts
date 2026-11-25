/*
 * Authoring helpers for scenario data. Bug locations are written as snippets
 * of the code they point at and resolved to line numbers here, so editing a
 * file's code can never silently shift a bug onto the wrong line: a snippet
 * that is missing or ambiguous throws as soon as the module loads.
 */

import type { Location } from '../types'

/** Strip the leading and trailing newline of a template literal. */
export function src(text: string): string {
  return text.replace(/^\n/, '').replace(/\n[ \t]*$/, '')
}

/** 1-based number of the only line containing `snippet`. */
export function lineOf(code: string, snippet: string): number {
  const lines = code.split('\n')
  const matches: number[] = []
  lines.forEach((line, i) => {
    if (line.includes(snippet)) matches.push(i + 1)
  })
  if (matches.length === 0) throw new Error(`Snippet not found: ${snippet}`)
  if (matches.length > 1) {
    throw new Error(`Snippet is ambiguous (lines ${matches.join(', ')}): ${snippet}`)
  }
  return matches[0]!
}

/**
 * Inclusive line range from the line containing `from` to the line containing
 * `to` (default: the same line), optionally extended by `pad` lines to take in
 * a closing bracket.
 */
export function span(code: string, from: string, to?: string, pad = 0): [number, number] {
  const start = lineOf(code, from)
  const end = (to ? lineOf(code, to) : start) + pad
  if (end < start) throw new Error(`Range ends before it starts: ${from} … ${to}`)
  return [start, end]
}

/** A `Location` in `fileId`, found by snippet. */
export function at(
  fileId: string,
  code: string,
  from: string,
  to?: string,
  pad = 0,
): Location {
  return { fileId, lines: span(code, from, to, pad) }
}

/**
 * Parse a unified-style hunk: each line starts with `+ `, `- ` or two spaces.
 * Returns the code without the markers, and which lines were added or removed.
 */
export function parseDiff(text: string): { code: string; tones: Record<number, 'add' | 'del'> } {
  const tones: Record<number, 'add' | 'del'> = {}
  const lines = src(text)
    .split('\n')
    .map((raw, i) => {
      if (raw.startsWith('+')) tones[i + 1] = 'add'
      else if (raw.startsWith('-')) tones[i + 1] = 'del'
      return raw.slice(2)
    })
  return { code: lines.join('\n'), tones }
}
