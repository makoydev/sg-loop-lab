import { Bug, CloudOff, Eye, History, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Tone } from '@/lib/cn'
import { IMDA } from '@/lib/facts'
import {
  CONTROLS,
  type ControlId,
  type IncidentId,
  type Level,
  type Status,
  type Verdict,
} from './logic'

/* Presentation lookups shared by the sandbox and the incident replay. */

export const INCIDENT_ICON: Record<IncidentId, ReactNode> = {
  injection: <Bug size={15} />,
  stale: <History size={15} />,
  outage: <CloudOff size={15} />,
  retry: <RotateCcw size={15} />,
  probe: <Eye size={15} />,
}

export const STATUS_TONE: Record<Status, Tone> = {
  stopped: 'ok',
  contained: 'warn',
  breached: 'bad',
}

export const STATUS_COLOR: Record<Status, string> = {
  stopped: 'var(--color-f-ok)',
  contained: 'var(--color-f-warn)',
  breached: 'var(--color-f-bad)',
}

export const LEVEL_TONE: Record<Level, Tone> = { Low: 'ok', Medium: 'warn', High: 'bad' }

export const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  passed: { label: 'passed', tone: 'trace' },
  blocked: { label: 'blocked', tone: 'ok' },
  escalated: { label: 'escalated', tone: 'info' },
  logged: { label: 'logged', tone: 'trace' },
  missing: { label: 'not in this design', tone: 'bad' },
  failed: { label: 'present, and failed', tone: 'bad' },
}

/** The IMDA dimension a control serves (as this app reads it), or a plain label. */
export function dimensionOf(control: ControlId): { n: string; name: string } {
  const group = CONTROLS[control].group
  const dimension = IMDA.dimensions.find((dim) => dim.id === group)
  return dimension
    ? { n: String(dimension.n), name: dimension.short }
    : { n: '+', name: 'Retrieval and serving' }
}
