import { useMemo } from 'react'
import type { Surface } from '@/components/ui'
import { cn } from '@/lib/cn'
import { highlight, type Lang } from '@/lib/highlight'

/** A short highlighted code block without a gutter, for signatures in the docs. */
export function Snippet({
  code,
  lang = 'ts',
  surface = 'paper',
  className,
}: {
  code: string
  lang?: Lang
  surface?: Surface
  className?: string
}) {
  const lines = useMemo(() => highlight(code, lang), [code, lang])
  return (
    <pre
      className={cn(
        'thin-scroll overflow-x-auto rounded-lg border px-3 py-2 font-mono text-[11.5px] leading-[1.6]',
        surface === 'film'
          ? 'code-film on-film border-film-rule bg-film-2'
          : 'code-paper border-rule bg-card',
        className,
      )}
    >
      {lines.map((toks, i) => (
        <div key={i}>
          {toks.length === 0
            ? ' '
            : toks.map((tok, j) => (
                <span key={j} className={`tok-${tok.kind}`}>
                  {tok.text}
                </span>
              ))}
        </div>
      ))}
    </pre>
  )
}
