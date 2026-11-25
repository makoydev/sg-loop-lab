import { Languages, Mic, SlidersHorizontal } from 'lucide-react'
import { ScenarioTabs, type ScenarioTab } from '@/components/ScenarioTabs'
import { PageHeader } from '@/components/ui'
import type { LabPageProps } from '@/lib/lines'
import MapLab from './map/MapLab'
import MixerLab from './mixer/MixerLab'
import OpeningLab from './opening/OpeningLab'

const SCENARIOS: ScenarioTab[] = [
  {
    id: 'opening',
    title: 'The first 90 seconds',
    sub: 'Order your opening so it says engineer',
    icon: <Mic size={15} />,
    ladderId: 'translator/opening',
  },
  {
    id: 'mixer',
    title: 'The answer mixer',
    sub: 'Assemble answers, watch the notepad',
    icon: <SlidersHorizontal size={15} />,
    ladderId: 'translator/mixer',
  },
  {
    id: 'map',
    title: 'Translation map',
    sub: 'Delivery concepts as engineering mechanisms',
    icon: <Languages size={15} />,
  },
]

export default function Translator({ sub }: LabPageProps) {
  const active = SCENARIOS.some((s) => s.id === sub) ? sub! : SCENARIOS[0]!.id
  return (
    <div>
      <PageHeader
        code="TL5"
        kicker="Leadership & trade-off rounds"
        title="PMP + CPMAI Translator"
        lede="A PMP can sink an engineering interview or set it apart. Sound like a project manager and you are levelled down. Show that your delivery instincts are engineering mechanisms and you are the rare engineer who can also land the work. So: prove you build first, then translate every instinct into a mechanism, a number and a trade-off."
      />
      <ScenarioTabs
        basePath="/translator"
        items={SCENARIOS}
        active={active}
        label="Translator scenarios"
      />
      <div className="mt-8" key={active}>
        {active === 'opening' && <OpeningLab />}
        {active === 'mixer' && <MixerLab />}
        {active === 'map' && <MapLab />}
      </div>
    </div>
  )
}
