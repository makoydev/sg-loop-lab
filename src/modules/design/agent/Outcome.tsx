import type { ReactNode } from 'react'
import { Chip } from '@/components/ui'
import { cn, type Tone } from '@/lib/cn'
import { PDPA } from '@/lib/facts'
import { CONTROLS, money, type ControlId, type Outcome } from './logic'
import { dimensionOf, STATUS_TONE } from './meta'

function ControlChip({ control, tone }: { control: ControlId; tone: Tone }) {
  const dimension = dimensionOf(control)
  return (
    <Chip surface="film" tone={tone} title={`Serves: ${dimension.name}`}>
      {CONTROLS[control].label}
      <span className="opacity-60">{dimension.n}</span>
      <span className="sr-only">, {dimension.name}</span>
    </Chip>
  )
}

/** The controls that held, and the ones whose absence let it through. */
export function ControlChips({ outcome }: { outcome: Outcome }) {
  if (outcome.stoppedBy.length === 0 && outcome.missing.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {outcome.stoppedBy.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="kicker mr-1 text-film-muted">held</span>
          {outcome.stoppedBy.map((control) => (
            <ControlChip key={control} control={control} tone="ok" />
          ))}
        </div>
      )}
      {outcome.missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="kicker mr-1 text-film-muted">missing</span>
          {outcome.missing.map((control) => (
            <ControlChip key={control} control={control} tone="bad" />
          ))}
        </div>
      )}
      <p className="text-[11px] leading-snug text-film-muted">
        The small number is the IMDA dimension the control serves, in this app’s reading. A plus
        marks plain retrieval and serving engineering.
      </p>
    </div>
  )
}

/** The three questions asked after any incident: what was lost, who noticed, can you show it. */
export function OutcomeFacts({ outcome }: { outcome: Outcome }) {
  const lost = `${`${money(outcome.loss)}. ${outcome.affected}`.replace(/\.$/, '')}.`
  const rows: { label: string; value: ReactNode; tone?: Tone }[] = [
    { label: 'Lost', value: lost, tone: outcome.loss > 0 ? STATUS_TONE[outcome.status] : undefined },
    { label: 'Noticed', value: outcome.noticed.text },
    {
      label: 'On record',
      value: outcome.reconstruct.text,
      tone:
        outcome.reconstruct.level === 'full'
          ? 'ok'
          : outcome.reconstruct.level === 'partial'
            ? 'warn'
            : 'bad',
    },
  ]
  return (
    <dl className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3">
          <dt className="kicker pt-0.5 text-film-muted">{row.label}</dt>
          <dd
            className={cn(
              'text-[13px] leading-snug',
              row.tone === 'ok' && 'text-f-ok',
              row.tone === 'warn' && 'text-f-warn',
              row.tone === 'bad' && 'text-f-bad',
              !row.tone && 'text-film-text',
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
      {outcome.personalData && (
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3">
          <dt className="kicker pt-0.5 text-film-muted">{PDPA.short}</dt>
          <dd className="text-[13px] leading-snug text-f-warn">
            Personal data reached the wrong person, so this is a matter for the {PDPA.name} as well
            as for your incident process.
          </dd>
        </div>
      )}
    </dl>
  )
}
