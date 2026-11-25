import { Shuffle, Timer, Trophy, Zap } from 'lucide-react'
import { ScenarioTabs, type ScenarioTab } from '@/components/ScenarioTabs'
import { PageHeader } from '@/components/ui'
import type { LabPageProps } from '@/lib/lines'
import EvolvingLab from './evolving/EvolvingLab'
import RaceLab from './race/RaceLab'
import RateLimiterLab from './rate-limiter/RateLimiterLab'
import TopKLab from './top-k/TopKLab'

const SCENARIOS: ScenarioTab[] = [
  {
    id: 'rate-limiter',
    title: 'Rate limiter',
    sub: 'Break the fixed window, then fix it',
    icon: <Timer size={15} />,
    ladderId: 'patterns/rate-limiter',
  },
  {
    id: 'top-k',
    title: 'Top-K heap',
    sub: 'Be the gatekeeper of a stream',
    icon: <Trophy size={15} />,
    ladderId: 'patterns/top-k',
  },
  {
    id: 'race',
    title: 'Flash-sale race',
    sub: 'You are the scheduler: oversell it',
    icon: <Zap size={15} />,
    ladderId: 'patterns/race',
  },
  {
    id: 'evolving',
    title: 'The requirement changed',
    sub: 'Write code that survives the twist',
    icon: <Shuffle size={15} />,
    ladderId: 'patterns/evolving',
  },
]

export default function PatternsLab({ sub }: LabPageProps) {
  const active = SCENARIOS.some((s) => s.id === sub) ? sub! : SCENARIOS[0]!.id
  return (
    <div>
      <PageHeader
        code="PT2"
        kicker="Coding rounds"
        title="Pattern & Concurrency Lab"
        lede="Algorithm screens did not go away at six years of experience; they changed shape. Fewer trick puzzles, more core patterns under pressure, concurrency, and problems whose requirements move while you are solving them. Four scenarios, each one something you do before it is something you read."
      />
      <ScenarioTabs
        basePath="/patterns"
        items={SCENARIOS}
        active={active}
        label="Pattern scenarios"
      />
      <div className="mt-8" key={active}>
        {active === 'rate-limiter' && <RateLimiterLab />}
        {active === 'top-k' && <TopKLab />}
        {active === 'race' && <RaceLab />}
        {active === 'evolving' && <EvolvingLab />}
      </div>
    </div>
  )
}
