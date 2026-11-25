import { Bot, Database, Receipt } from 'lucide-react'
import type { ReactNode } from 'react'
import { ScenarioTabs, type ScenarioTab } from '@/components/ScenarioTabs'
import { Card, Kicker, PageHeader } from '@/components/ui'
import type { LabPageProps } from '@/lib/lines'
import { to } from '@/lib/router'
import { PULL_REQUESTS } from './data'
import { PrLab } from './PrLab'

const ICONS: Record<string, ReactNode> = {
  refunds: <Receipt size={15} />,
  agent: <Bot size={15} />,
  cache: <Database size={15} />,
}

const SCENARIOS: ScenarioTab[] = PULL_REQUESTS.map((pr) => ({
  id: pr.id,
  title: pr.tab.title,
  sub: pr.tab.sub,
  icon: ICONS[pr.id],
  ladderId: pr.ladderId,
}))

/** Where rounds like this are reported, stated no more strongly than the sources allow. */
const SEEN_AT = [
  { who: 'Meta', what: 'a 60-minute AI-assisted coding round since October 2025.' },
  {
    who: 'Google',
    what: 'reported to be piloting a code comprehension round with Gemini, for junior and mid-level roles on select US teams.',
  },
  { who: 'Stripe', what: 'loops are reported to include Bug Bash and Integration rounds.' },
]

function SeenAt() {
  return (
    <Card className="max-w-[21rem] px-4 py-3.5">
      <Kicker>Where this shows up</Kicker>
      <ul className="mt-2 flex flex-col gap-1.5">
        {SEEN_AT.map((row) => (
          <li key={row.who} className="text-[12.5px] leading-snug text-ink-2">
            <span className="font-semibold text-ink">{row.who}:</span> {row.what}
          </li>
        ))}
      </ul>
      <p className="mt-2.5 border-t border-rule pt-2.5 text-[12px] leading-snug text-ink-3">
        Formats vary by team, level and country. Ask your recruiter which one you will get.{' '}
        <a
          href={to('/sources')}
          className="font-medium text-ink-2 underline decoration-rule-2 underline-offset-2 hover:text-ink hover:decoration-ink"
        >
          Sources
        </a>
      </p>
    </Card>
  )
}

export default function BugBash({ sub }: LabPageProps) {
  const active = PULL_REQUESTS.find((pr) => pr.id === sub) ?? PULL_REQUESTS[0]!
  return (
    <div>
      <PageHeader
        code="BB3"
        kicker="Code comprehension rounds"
        title="AI-Assisted Bug Bash"
        lede="The newest kind of coding round hands you code you did not write, often with an AI assistant at your side, and watches what you catch. Reading is the skill: follow the data, check the claims against the docs, and ask for a fix you can verify. Here are three pull requests an assistant wrote. Each passes its tests, and each would hurt in production."
        aside={<SeenAt />}
      />
      <ScenarioTabs
        basePath="/bugbash"
        items={SCENARIOS}
        active={active.id}
        label="Pull requests to review"
      />
      <div className="mt-8" key={active.id}>
        <PrLab pr={active} />
      </div>
    </div>
  )
}
