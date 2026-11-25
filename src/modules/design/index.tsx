import { Bot, ShoppingCart } from 'lucide-react'
import { ScenarioTabs, type ScenarioTab } from '@/components/ScenarioTabs'
import { PageHeader } from '@/components/ui'
import type { LabPageProps } from '@/lib/lines'
import AgentLab from './agent/AgentLab'
import FlashSaleLab from './flash-sale/FlashSaleLab'

const SCENARIOS: ScenarioTab[] = [
  {
    id: 'flash-sale',
    title: 'Flash sale at midnight',
    sub: 'Classic high-scale design, with a budget',
    icon: <ShoppingCart size={15} />,
    ladderId: 'design/flash-sale',
  },
  {
    id: 'agent',
    title: 'The refund agent',
    sub: 'Agentic AI under Singapore governance',
    icon: <Bot size={15} />,
    ladderId: 'design/agent',
  },
]

export default function DesignSandbox({ sub }: LabPageProps) {
  const active = SCENARIOS.some((s) => s.id === sub) ? sub! : SCENARIOS[0]!.id
  return (
    <div>
      <PageHeader
        code="SD4"
        kicker="System design rounds"
        title="System Design Sandbox"
        lede="System design is where senior and mid-level part ways. Interviewers now push past the boxes and arrows, into what the design costs, how you would know it is failing, and, for AI systems, who is accountable when the agent acts. Two live architectures to break and repair."
      />
      <ScenarioTabs
        basePath="/design"
        items={SCENARIOS}
        active={active}
        label="System design scenarios"
      />
      <div className="mt-8" key={active}>
        {active === 'flash-sale' && <FlashSaleLab />}
        {active === 'agent' && <AgentLab />}
      </div>
    </div>
  )
}
