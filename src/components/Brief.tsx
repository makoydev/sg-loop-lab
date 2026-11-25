import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Card, Chip, Kicker } from './ui'

/**
 * The interviewer's prompt that opens every scenario: what you are asked, in
 * the voice you would hear it in, with any starting material beside it.
 */
export function Brief({
  kicker = 'The prompt',
  tags,
  children,
  aside,
  className,
}: {
  kicker?: string
  /** Short facts about the round: type, time box, where it shows up. */
  tags?: string[]
  /** The prompt, in the interviewer's words. */
  children: ReactNode
  /** Starting material: code, a diagram, constraints. */
  aside?: ReactNode
  className?: string
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className={cn('grid', aside && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]')}>
        <div className="relative px-6 py-6 sm:px-8">
          <span className="absolute inset-y-6 left-0 w-1 rounded-r-full bg-line" aria-hidden />
          <div className="flex flex-wrap items-center gap-2">
            <Kicker className="text-line">{kicker}</Kicker>
            {tags?.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </div>
          <div className="display mt-3 flex max-w-2xl flex-col gap-3 text-[19px] leading-[1.42] font-[420] text-ink [&_strong]:font-[640]">
            {children}
          </div>
        </div>
        {aside && (
          <div className="border-t border-rule bg-paper-2/60 p-4 lg:border-t-0 lg:border-l">
            {aside}
          </div>
        )}
      </div>
    </Card>
  )
}
