import { ArrowUpRight } from 'lucide-react'
import { Card, Chip, Kicker } from '@/components/ui'
import type { Tone } from '@/lib/cn'
import { FEAT, IMDA, MAS, PDPA, SOURCES, type SourceGrade } from '@/lib/facts'
import { lineStyle } from '@/lib/lines'

const GRADE: Record<SourceGrade, { label: string; tone: Tone; meaning: string }> = {
  primary: {
    label: 'primary source',
    tone: 'ok',
    meaning: 'Stated by the organisation itself.',
  },
  secondary: {
    label: 'secondary source',
    tone: 'warn',
    meaning: 'Consistent across reputable summaries or reporting; not read from the original here.',
  },
  anecdotal: {
    label: 'candidate-reported',
    tone: 'neutral',
    meaning: 'Anonymous or self-published accounts. Useful for direction, wrong in the details.',
  },
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 font-medium text-ink underline decoration-rule-2 underline-offset-4 hover:decoration-ink"
    >
      {children}
      <ArrowUpRight size={13} aria-hidden />
    </a>
  )
}

export default function Sources() {
  return (
    <div style={lineStyle('var(--color-ink)')} className="flex flex-col gap-12">
      <header className="max-w-3xl">
        <Kicker>Sources & caveats</Kicker>
        <h1 className="mt-3 text-[clamp(2rem,4.4vw,3.1rem)] leading-[1.04] font-[560]">
          What this app knows, and how well it knows it.
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-2">
          Interview formats and regulatory guidance both move. Everything factual in Loop Lab was
          checked on <span className="num text-ink">25 Nov 2026</span> and is graded below by how
          solid the source is. If you plan to quote something in an interview, read the original
          first.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {(Object.keys(GRADE) as SourceGrade[]).map((g) => (
            <div key={g} className="flex items-baseline gap-3 text-[14px] text-ink-2">
              <Chip tone={GRADE[g].tone} dot className="shrink-0">
                {GRADE[g].label}
              </Chip>
              {GRADE[g].meaning}
            </div>
          ))}
        </div>
      </header>

      <section aria-labelledby="claims-title">
        <h2 id="claims-title" className="text-[26px] leading-tight font-[560]">
          The claims
        </h2>
        <div className="mt-5 flex flex-col gap-4">
          {SOURCES.map((source) => (
            <Card key={source.topic} className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-[19px] leading-tight font-[560]">{source.topic}</h3>
                <Chip tone={GRADE[source.grade].tone} dot>
                  {GRADE[source.grade].label}
                </Chip>
              </div>
              <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-ink">{source.claim}</p>
              <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-3">{source.note}</p>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
                {source.links.map((link) => (
                  <ExternalLink key={link.url} href={link.url}>
                    {link.label}
                  </ExternalLink>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="gov-title" className="grid gap-4 lg:grid-cols-2">
        <h2 id="gov-title" className="text-[26px] leading-tight font-[560] lg:col-span-2">
          The two governance documents, at a glance
        </h2>

        <Card className="p-5 sm:p-6">
          <Kicker>{IMDA.owner}</Kicker>
          <h3 className="mt-2 text-[20px] leading-tight font-[560]">{IMDA.name}</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-3">
            Launched {IMDA.launched}. Current: {IMDA.updated}. {IMDA.status}
          </p>
          <ol className="mt-4 flex flex-col gap-3">
            {IMDA.dimensions.map((d) => (
              <li key={d.id} className="flex gap-3">
                <span className="num mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-rule-2 text-[11.5px] font-semibold">
                  {d.n}
                </span>
                <span>
                  <span className="block text-[14.5px] font-semibold">{d.title}</span>
                  <span className="mt-0.5 block text-[13.5px] leading-snug text-ink-2">
                    {d.gist}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-rule pt-3 text-[13px] leading-snug text-ink-3">
            Risks it names: {IMDA.risks.join(', ').toLowerCase()}.
          </p>
          <div className="mt-3 text-[13.5px]">
            <ExternalLink href={IMDA.url}>Read the framework</ExternalLink>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <Kicker>{MAS.owner}</Kicker>
          <h3 className="mt-2 text-[20px] leading-tight font-[560]">{MAS.name}</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-3">
            Consulted {MAS.consulted}. Issued {MAS.issued}. {MAS.status}
          </p>
          <dl className="mt-4 flex flex-col gap-2">
            {MAS.phases.map((phase) => (
              <div key={phase.when} className="flex gap-3 text-[13.5px]">
                <dt className="num w-28 shrink-0 text-ink">{phase.when}</dt>
                <dd className="text-ink-2">{phase.what}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 border-t border-rule pt-3">
            <Kicker>Risk materiality is rated on</Kicker>
            <ul className="mt-2 flex flex-col gap-2">
              {MAS.materiality.map((m) => (
                <li key={m.id} className="text-[13.5px] leading-snug text-ink-2">
                  <span className="font-semibold text-ink">{m.title}.</span> {m.gist}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 border-t border-rule pt-3 text-[13px] leading-snug text-ink-3">
            {MAS.next} Alongside it sit the {FEAT.name} ({FEAT.expanded}, {FEAT.issued}) and the{' '}
            {PDPA.name}.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
            <ExternalLink href={MAS.url}>MAS guidelines</ExternalLink>
            <ExternalLink href={FEAT.url}>FEAT principles</ExternalLink>
            <ExternalLink href={PDPA.url}>PDPA</ExternalLink>
          </div>
        </Card>
      </section>

      <section aria-labelledby="model-title" className="max-w-3xl">
        <h2 id="model-title" className="text-[26px] leading-tight font-[560]">
          What is modelled, not measured
        </h2>
        <ul className="mt-4 flex flex-col gap-3 text-[15px] leading-relaxed text-ink-2">
          <li>
            <span className="font-semibold text-ink">Round weightings in the Calibrator</span> are
            estimates for deciding where to spend prep time. No employer publishes these numbers.
          </li>
          <li>
            <span className="font-semibold text-ink">Latency, cost, risk and coverage figures</span>{' '}
            in the System Design Sandbox come from small deterministic models built to make
            trade-offs visible. They move in the right direction for the right reasons. They are
            not benchmarks, quotes or pricing.
          </li>
          <li>
            <span className="font-semibold text-ink">Assistant output in the Bug Bash</span> is
            scripted. No model is called, and nothing you do leaves your browser.
          </li>
          <li>
            <span className="font-semibold text-ink">
              The mapping from engineering controls to the IMDA dimensions
            </span>{' '}
            is this app's reading of a voluntary framework, offered as a way to structure an
            answer.
          </li>
        </ul>
      </section>
    </div>
  )
}
