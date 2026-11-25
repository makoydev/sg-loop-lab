import { IMDA } from '@/lib/facts'
import {
  parseMarked,
  seededOrder,
  SEGMENT_ORDER,
  type Annotated,
  type SegmentId,
  type VariantKind,
} from '../logic'

/*
 * The answer mixer's questions.
 *
 * Every question has four segments (frame, decision, mechanism, result) and
 * every segment has the same thought written in four voices. The weak voices
 * are not caricatures: each is something a competent person would really say,
 * which is why they are worth learning to hear.
 *
 * Signal spans are marked inline as {code:text}; see SIGNAL_CODES in logic.ts.
 * The stories are illustrative. The user's own answers should keep the shape
 * and swap in their own systems and numbers.
 */

export type Variant = Annotated & {
  id: string
  kind: VariantKind
  /** What the interviewer writes down on hearing it. */
  note: string
}

export type Segment = {
  id: SegmentId
  /** Variants in the fixed, shuffled order they are shown in. */
  variants: Variant[]
  /** Why the senior variant works, in one line. */
  why: string
}

export type Question = {
  id: string
  /** Two or three words for selectors. */
  short: string
  question: string
  /** What the interviewer is really testing. */
  probing: string
  segments: Segment[]
  /** Optional local context worth one sentence in the room. */
  angle?: { title: string; body: string }
}

type Voices = Record<VariantKind, [marked: string, note: string]>

/**
 * Seeds the order in which the four voices are shown. Chosen so the senior
 * variant lands evenly across the four positions (the content tests check the
 * spread); changing a question or segment id means re-checking it.
 */
const SHUFFLE_SALT = 'mechanism-first'

function segment(questionId: string, id: SegmentId, why: string, voices: Voices): Segment {
  const variants = (Object.keys(voices) as VariantKind[]).map((kind): Variant => {
    const [marked, note] = voices[kind]
    return { id: `${questionId}.${id}.${kind}`, kind, note, ...parseMarked(marked) }
  })
  return { id, why, variants: seededOrder(variants, `${SHUFFLE_SALT}:${questionId}:${id}`) }
}

function question(
  meta: Omit<Question, 'segments'>,
  parts: Record<SegmentId, { why: string; voices: Voices }>,
): Question {
  return {
    ...meta,
    segments: SEGMENT_ORDER.map((id) => segment(meta.id, id, parts[id].why, parts[id].voices)),
  }
}

const boundRisks = IMDA.dimensions[0]!.title
const accountable = IMDA.dimensions[1]!.title

export const QUESTIONS: Question[] = [
  question(
    {
      id: 'pushback',
      short: 'Pushing back',
      question: 'Tell me about a time you pushed back on shipping.',
      probing: 'Judgement under schedule pressure. Can you say no and still bring an option?',
    },
    {
      frame: {
        why: 'It names the system, the failure and its rate before any opinion appears.',
        voices: {
          pm: [
            'We had a {p:fixed launch date} for instalment payments, tied to a marketing campaign that several {p:stakeholders} had already announced. In the final {p:readiness review} I raised a concern about the release and asked for it to be {p:minuted}.',
            'Dates and stakeholders. What was the system, and what was actually wrong with it?',
          ],
          mid: [
            'We were about to release instalment payments and I noticed some issues during testing, mostly around payments failing and being retried, so I did not think we were really ready to go live on that date.',
            '“Some issues.” Which one? How did they find it?',
          ],
          buzz: [
            'It was a {b:high-visibility, business-critical launch} with a lot of eyes on it, and I felt strongly that {b:quality and customer trust} had to come before speed, even if that meant an uncomfortable conversation.',
            'Values, not facts. Nothing to probe yet.',
          ],
          senior: [
            '{o:I owned} the {s:provider adapter for instalment payments}, due {n:four days before a campaign}. My {m:load test} showed that {m:a timeout followed by a client retry} charged the card twice, in about {n:1 in 400 payments}.',
            'Owns the component. Names the failure and its rate. I can dig into this.',
          ],
        },
      },
      decision: {
        why: 'A refusal with a counter-offer is a decision. A refusal on its own is an escalation.',
        voices: {
          pm: [
            'I {p:escalated} the risk to the {p:steering group}, updated the {p:risk register} with the impact and likelihood, and recommended that we {p:re-baseline} the launch date pending a decision from the sponsors.',
            'Escalated and logged. Who made the call? It does not sound like them.',
          ],
          mid: [
            'I told my manager we should probably delay it by a bit, and after some discussion with product the team agreed to push the release back until the testing looked better.',
            '“Probably”, “the team agreed”. Passive. Did they drive it?',
          ],
          buzz: [
            'I {b:took a principled stand}, {b:drove alignment} across the organisation, and made sure we did {b:the right thing for the customer} rather than optimising for a date on a slide.',
            'A stand on what, exactly? No decision I can evaluate.',
          ],
          senior: [
            '{d:I said no to the full launch} and {d:offered a smaller one}: ship on the date to {n:5% of merchants} with {m:client retries switched off}, and everyone else {n:nine days later}.',
            'Said no and brought an option that kept the date for some. Senior judgement.',
          ],
        },
      },
      mechanism: {
        why: 'Three things an interviewer can probe: the fix, the proof it holds, and the gate.',
        voices: {
          pm: [
            'We set up a {p:daily war room}, tracked the open items in a {p:RAID log} with owners and due dates, and sent a {p:status update} to stakeholders every evening until go-live.',
            'Meetings and logs. What changed in the code?',
          ],
          mid: [
            '{o:I fixed the bug} in the adapter, added some more {m:tests around the retry logic}, and we ran the whole test suite again a few times before releasing, just to make sure everything passed.',
            'Fixed it. How do they know it stays fixed?',
          ],
          buzz: [
            'We hardened the service with {b:industry best practices} for resilience, {b:shifted quality left}, and made the platform {b:robust and scalable} so that it could support future growth with confidence.',
            '“Best practices.” Which one? I cannot tell whether they did the work.',
          ],
          senior: [
            'I passed the {m:idempotency key} through the adapter so the {m:provider drops duplicate retries}, added a {m:test that replays the timeout}, and {m:gated the wider rollout} on {n:zero duplicate charges for a week}.',
            'Root cause, regression test, and an explicit gate for the rollout. Complete.',
          ],
        },
      },
      result: {
        why: 'A result with its cost attached shows the decision was a trade, not luck.',
        voices: {
          pm: [
            'The launch was delivered within the {p:revised timeline}, and the {p:stakeholders were satisfied} with how the risk had been {p:communicated and managed}. It was recorded as a success in the {p:project closure report}.',
            'Stakeholders satisfied. And the customers? Any number at all?',
          ],
          mid: [
            'In the end it went out {n:about a week late}, but it worked fine and we did not have any problems after that, so I think it was the right thing to do.',
            '“Worked fine.” No measure, and the cost is not acknowledged.',
          ],
          buzz: [
            'It was a {b:huge win}: we {b:protected the brand}, delighted customers and {b:set a new quality bar} for the whole organisation, and it became a reference point for how launches should run.',
            'Superlatives. I cannot verify any of it.',
          ],
          senior: [
            'No duplicate charges across {n:1.2 million payments} in the first month. {t:The price was nine days of campaign for most merchants} and {t:one unhappy partner}, and {d:I would make that trade again}.',
            'Outcome with a number, and it names what it cost. Owns the trade.',
          ],
        },
      },
    },
  ),

  question(
    {
      id: 'build-buy',
      short: 'Build or buy',
      question: 'Your team wants to build its own vector database. What do you do?',
      probing: 'Can you turn a fight about preferences into a measured, reversible decision?',
    },
    {
      frame: {
        why: 'It replaces “should we build” with numbers the options can be tested against.',
        voices: {
          pm: [
            'I would start by {p:gathering requirements} from the {p:stakeholders} and putting together a {p:build-versus-buy analysis}, with {p:cost, timeline and resourcing} for each option, so that the eventual decision is transparent, defensible and properly governed.',
            'A document. Fine, but what is the technical question?',
          ],
          mid: [
            'Building a vector database is a lot of work and there are good open-source ones already, so I would be sceptical and suggest that we look carefully at the existing options before we think about writing our own.',
            'Reasonable instinct. Nothing about our workload.',
          ],
          buzz: [
            'I would make sure we take a {b:strategic, first-principles view} rather than a tactical one, and choose a {b:future-proof solution} that scales with our {b:AI roadmap} and keeps our options open.',
            'First principles of what? No workload, no number.',
          ],
          senior: [
            'First I would pin down the workload: about {n:3 million chunks}, {m:filtered by tenant}, with a target of {n:recall above 0.95} at {n:p95 under 80 milliseconds}. Then the question becomes {d:whether anything we already run meets that}.',
            'Turned an opinion fight into a measurable question. Knows the workload.',
          ],
        },
      },
      decision: {
        why: 'A decision with a written exit condition is reversible, which is what makes it safe to take quickly.',
        voices: {
          pm: [
            'I would present the options to the {p:steering committee} with a recommendation, get {p:sign-off}, and then update the {p:roadmap} and the {p:resource plan} so that the dependent teams can adjust their own milestones and budgets accordingly and the change is properly tracked.',
            'The committee decides. Where is their own call?',
          ],
          mid: [
            'I would recommend an existing one, {s:pgvector} or a managed service, because it is faster and less risky than writing our own, and we can always build something ourselves later on if it turns out that we really need to.',
            'Probably right, but asserted rather than shown. No condition to revisit.',
          ],
          buzz: [
            'I would {b:empower the team to innovate} while guiding them towards the option with the best {b:long-term total cost of ownership}, so that we stay focused on our {b:core competencies} as a business.',
            'So, build or not? The question was avoided.',
          ],
          senior: [
            '{d:My call would be pgvector} on {s:the Postgres we already operate}, with the {m:trigger to revisit written down}: past {n:50 million vectors}, or if filtered recall drops below target. {d:We build only} the {s:permission-aware retrieval layer}, because that part is ours.',
            'Clear call, written revisit trigger, builds only the differentiator.',
          ],
        },
      },
      mechanism: {
        why: 'Real queries and a ground truth make the benchmark mean something, and letting the builders run it ends the argument without a fight.',
        voices: {
          pm: [
            'We would run a structured evaluation with a {p:weighted scoring matrix} across the agreed criteria, {p:document the decision} and its rationale, and {p:communicate it} to all the affected teams through the usual channels and forums.',
            'A scoring matrix of opinions. Was anything measured?',
          ],
          mid: [
            'I would do a quick {m:proof of concept} with one of the libraries, load in some of our data, and see whether the performance is good enough for our use case before we commit to anything.',
            'A proof of concept, good. “Good enough” against what?',
          ],
          buzz: [
            'We would {b:benchmark rigorously} against {b:industry standards}, adopt a {b:modern, cloud-native architecture}, and make sure the solution is {b:enterprise-ready} and aligned with where the vector ecosystem is heading.',
            'Which benchmark? Whose queries? Sounds borrowed.',
          ],
          senior: [
            'A {n:two-day spike}, {m:time-boxed}: load our real chunks, {m:replay 500 logged queries} with their tenant filters, and {m:measure recall against exact search}. {d:The engineers who want to build it run it}, so the result is theirs.',
            'Time-boxed, real queries, a ground truth. And the sceptics run it. Smart.',
          ],
        },
      },
      result: {
        why: 'It reports a measured outcome, names what was given up, and shows the people cost was handled.',
        voices: {
          pm: [
            'The decision would be {p:documented and communicated}, the project would stay on track against the {p:baseline schedule and budget}, and we would have a clear record of why the option was chosen if anyone asked later.',
            'On track against a plan. Does search work?',
          ],
          mid: [
            'We would save a lot of engineering time and could focus on the actual product instead of on infrastructure, which is usually the better use of a small team like ours, at least for now.',
            'True in general. No number, no downside.',
          ],
          buzz: [
            'It {b:accelerates time to value} and positions us to {b:leverage best-in-class technology} as the ecosystem matures, while freeing the team to focus on {b:differentiated, high-impact work}.',
            'Slideware. Nothing I could check.',
          ],
          senior: [
            'Last time, the spike measured {n:0.97 recall at 60 milliseconds} and search shipped in {n:three weeks instead of a quarter}. {t:What we gave up was fine control over the index.} The team’s urge to build went into the {m:evaluation harness}.',
            'Has done it. Numbers, the cost, and the team stayed motivated.',
          ],
        },
      },
    },
  ),

  question(
    {
      id: 'eval-gap',
      short: 'Evaluation gap',
      question:
        'Offline evaluation looked great and production quality dropped. Walk me through it.',
      probing: 'Do you diagnose before you tune, and do you know that an evaluation set ages?',
    },
    {
      frame: {
        why: 'It states a testable hypothesis and puts the offline and online numbers next to each other.',
        voices: {
          pm: [
            'This sounds like a gap in our {p:quality management process}, so I would {p:open an issue}, bring the {p:stakeholders} together and review the {p:acceptance criteria} we had agreed at the start of the project, to see where expectations diverged.',
            'A process review. But why did quality drop? No hypothesis.',
          ],
          mid: [
            'Offline metrics do not always match production, so I would {m:look at the logs} and at some example conversations, and try to work out what is different about the real traffic compared with our tests.',
            'Right direction, vague. Different how?',
          ],
          buzz: [
            'That is the {b:classic offline-online gap}. You need a {b:holistic, data-centric approach} to evaluation across the {b:whole model lifecycle}, because models are only ever as good as the data behind them.',
            'Knows the name of the problem. Not what to do about it.',
          ],
          senior: [
            '{d:My first assumption} is that the {m:evaluation set stopped looking like production}. We scored {n:92% on 400 curated questions} while resolution in production fell {n:from 71% to 58%}, so I would {d:compare the two distributions before touching the model}.',
            'A hypothesis first, with both numbers side by side. Does not blame the model.',
          ],
        },
      },
      decision: {
        why: 'Freezing changes is a decision with a cost, and random sampling is what makes the diagnosis trustworthy.',
        voices: {
          pm: [
            'I would raise a {p:change request} to revisit the {p:evaluation phase}, and agree a {p:recovery plan and timeline} with the {p:business owner}, so that expectations are reset and the revised plan is formally approved by them before the next steering meeting.',
            'A change request to revisit a phase. Not an engineering decision.',
          ],
          mid: [
            'I would try improving the prompt, and maybe a bigger model or a higher retrieval count, to see whether the quality comes back up, and keep iterating like that until the numbers look right again.',
            'Tuning before diagnosing. This is how teams lose a month.',
          ],
          buzz: [
            'I would {b:double down on continuous evaluation} and bring in a {b:state-of-the-art LLM-as-judge framework}, so that we have a {b:scalable, automated way to measure quality} going forward.',
            'Tooling as the answer. A judge of what, against which ground truth?',
          ],
          senior: [
            '{d:I froze prompt and model changes}, {t:which cost a week of visible progress}, pulled {n:200 production conversations at random}, and {m:two of us labelled them}. {d:Diagnosis first}: tuning against the wrong test set only makes the offline number prettier.',
            'Stopped the thrash, sampled real traffic, made a clear priority call.',
          ],
        },
      },
      mechanism: {
        why: 'Each cause gets a mechanism that keeps working after the incident is over.',
        voices: {
          pm: [
            'We would add a {p:quality gate} to the {p:governance process}, schedule a {p:recurring review meeting} to monitor the model’s performance, assign an owner for model quality in the {p:RACI}, and report the trend to the {p:steering committee} each month.',
            'A meeting to monitor. What does the meeting look at?',
          ],
          mid: [
            'I would add {m:more test cases} to the evaluation set for the failures we found, fix the ones we can in the prompt, and set up {m:some monitoring} on the logs so that we notice sooner if it happens again.',
            'Patches this failure. Will not catch the next drift.',
          ],
          buzz: [
            'We would implement {b:end-to-end observability} and an {b:MLOps flywheel}, so that every interaction feeds back into the system, the data advantage compounds, and quality {b:improves continuously} without manual effort.',
            'A flywheel. Which metric, what threshold, who gets paged?',
          ],
          senior: [
            'Two causes. {n:A third of real questions} were about a product launched after the set was built, and the {s:index refresh} had silently skipped a new source. Now the {m:golden set is resampled from production weekly}, new documents are {m:searchable within 15 minutes}, and {m:resolution rate has an alert}.',
            'Two root causes, each with a standing fix: set refresh, freshness target, online alert.',
          ],
        },
      },
      result: {
        why: 'Saying the offline score went down, and why that is good news, is the kind of honesty a panel remembers.',
        voices: {
          pm: [
            'Quality returned to an {p:acceptable level}, the issue was closed, and we captured the {p:lessons learned} and updated the {p:process documentation} so that future projects include an evaluation checkpoint in the plan.',
            '“Acceptable.” To whom? No number.',
          ],
          mid: [
            'After the changes the answers got better again and the users were happier with it, and we have not really seen the same kind of complaints since then, so it seems to have worked.',
            'Better by how much? Measured how?',
          ],
          buzz: [
            'We turned a setback into a {b:best-in-class evaluation capability} that is now a {b:competitive advantage}, and it has fundamentally changed how the organisation thinks about AI quality.',
            'Spin. Skips what it cost and what the real number is now.',
          ],
          senior: [
            'Resolution was {n:back at 70% within two weeks}. The {n:offline score fell to 84%}, which was simply the honest number, and {t:the standing cost is about four hours of labelling a week}. {d:I would rather pay that} than trust a flattering test set again.',
            'Recovery number, admits the offline score dropped, prices the ongoing cost. Honest.',
          ],
        },
      },
    },
  ),

  question(
    {
      id: 'agent-date',
      short: 'A date for an agent',
      question:
        'A stakeholder wants a date for an agent that can issue refunds. What do you tell them?',
      probing: 'Can you give the business a date without pretending AI risk is a scheduling problem?',
      angle: {
        title: 'The Singapore angle',
        body: `The senior answer has the shape of IMDA’s ${IMDA.name} (${IMDA.launched}; voluntary guidance): “${boundRisks}” and “${accountable}”. Naming it once, after the mechanisms, tells a Singapore panel you know the local reference. Leading with it would sound like compliance rather than engineering.`,
      },
    },
    {
      frame: {
        why: 'It finds the variable that actually sets the date: how much the agent may do unsupervised.',
        voices: {
          pm: [
            'I would {p:work backwards from the requested date}, build a {p:work breakdown structure} and a {p:schedule with milestones}, and identify the {p:dependencies and resources} we need, so that I can confirm whether the date is feasible.',
            'A schedule for an unbounded thing. Has not asked what the agent may do.',
          ],
          mid: [
            'AI work is hard to estimate because you do not know how good the model will be until you try it, so I would say it depends on how it performs and give a rough range instead of committing to a single date up front.',
            'Honest but unhelpful. Depends on what, measured how?',
          ],
          buzz: [
            'I would align on the {b:north-star vision} first and then define an {b:agile, iterative roadmap} to {b:deliver value incrementally}, so that we fail fast, learn quickly and build stakeholder confidence along the way.',
            'Could be about any project. Nothing on refunds or risk.',
          ],
          senior: [
            'I would answer with a question: {d:a date for what level of autonomy?} An agent that {m:drafts refunds for a person to approve} is {n:a few weeks} of work. One that moves money by itself is {m:gated on evidence}, not on a calendar.',
            'Reframed the ask: autonomy is the variable. Sees that moving money is the risk.',
          ],
        },
      },
      decision: {
        why: 'The stakeholder gets a date to plan around, and the risky part is tied to evidence instead of optimism.',
        voices: {
          pm: [
            'I would {p:manage expectations} by communicating a {p:realistic timeline with contingency} built in, and record the {p:risks and assumptions} behind the date so that they are visible to the sponsor at {p:sign-off}.',
            'Padding the date. Nothing about what gets built has changed.',
          ],
          mid: [
            'I would ask for more time so that we can test it properly before letting it issue refunds on its own, because a mistake with real money would be much worse for us than a late launch.',
            'More time for what? No scope decision, no criteria.',
          ],
          buzz: [
            'I would push for a {b:human-in-the-loop, responsible AI approach} that {b:balances innovation with trust and safety}, and make sure {b:governance is built in from day one} rather than bolted on afterwards.',
            'The right words. Which actions need the human? Above what amount?',
          ],
          senior: [
            '{d:I would commit to week six} for a version where {m:every refund is approved by a person}, and give {d:a condition instead of a date} for the rest: the agent approves {n:up to S$50} by itself {m:once two gates pass}.',
            'A firm date for the bounded version, conditions for autonomy. The stakeholder can plan.',
          ],
        },
      },
      mechanism: {
        why: 'Every risk has a control you could point to in the codebase, and the limit does not depend on the model behaving.',
        voices: {
          pm: [
            'We would set up a {p:governance board} for the agent, define a {p:RACI} for its decisions, add the approval steps to the {p:standard operating procedure}, train the operations team on it, and review any exceptions in a {p:weekly meeting}.',
            'An org chart for the risk. What stops a bad refund at 2 a.m.?',
          ],
          mid: [
            'We would add some {m:validation on the refund amount}, write {m:tests for the main scenarios}, and try it on a few internal accounts first to check that nothing obviously wrong happens before turning it on for customers.',
            'A sensible start. Nothing on prompts, retries or rollback.',
          ],
          buzz: [
            'We would put {b:robust guardrails} and {b:enterprise-grade governance} around the agent, with {b:full observability} across every interaction, so that it is safe, explainable and auditable by design from the first day.',
            '“Guardrails.” Enforced where? By the model, or outside it?',
          ],
          senior: [
            'The gates: {n:97% agreement with past decisions on 300 real tickets}, and {n:zero unauthorised refunds} under a {m:prompt-injection suite}. The {m:cap lives in code outside the model}, the refund call carries an {m:idempotency key}, {m:every tool call is logged}, and rollout goes {n:5, 25, 100 percent} with {m:an off switch}.',
            'Evidence gates with numbers. Limit enforced outside the model. Idempotency, audit trail, staged rollout, off switch.',
          ],
        },
      },
      result: {
        why: 'It gives the stakeholder value early, prices the caution, and defines the number that sends you back a stage.',
        voices: {
          pm: [
            'The stakeholder would have a {p:committed date}, a clear {p:communication plan}, and visibility of progress through {p:regular status reports}, with any change to scope or timeline going through the agreed {p:change process}.',
            'Visibility of progress. Towards what level of risk?',
          ],
          mid: [
            'It would take longer, but it would be safer and we would avoid problems with wrong refunds, and once we are confident in how it behaves we could gradually let it do more by itself.',
            'Safer by how much? What does the stakeholder get in the meantime?',
          ],
          buzz: [
            'We would {b:unlock transformative efficiency gains} while keeping the organisation {b:safe, compliant and future-ready}, and set the foundation for {b:scaling agentic AI across other business functions}.',
            'A brochure sentence.',
          ],
          senior: [
            'Operations gets drafted refunds in {n:week six}: most of the typing gone, {m:a person still pressing approve}. {t:The cost is a slower road to full automation} and {t:two reviewers on the queue}. If wrong refunds pass {n:0.5%} at any stage, {m:we step back one}.',
            'Value early, the cost named, and a number that sends it backwards.',
          ],
        },
      },
    },
  ),

  question(
    {
      id: 'slip',
      short: 'A project that slipped',
      question: 'Tell me about a project that slipped.',
      probing: 'Ownership. Is the miss yours, and did a habit change because of it?',
    },
    {
      frame: {
        why: 'It gives both dates, names the planning mistake as their own, and puts a number on what was found.',
        voices: {
          pm: [
            'We had a {s:ledger migration} on an {n:eight-week schedule}. Around week six we identified a {p:schedule variance against the baseline}, caused by an {p:unplanned dependency} that had not been captured in the original plan.',
            '“Schedule variance.” Who missed the dependency, and why?',
          ],
          mid: [
            'We were migrating a database and it turned out to be more complicated than we expected, with some data that did not match between the old and new systems, so it took quite a lot longer than we had originally planned.',
            'Every migration answer ever. What was complicated?',
          ],
          buzz: [
            'It was a {b:complex, mission-critical transformation} with {b:many moving parts} and a lot of legacy complexity, and we hit some {b:unforeseen technical challenges} that nobody could reasonably have predicted.',
            'Unforeseen by whom? No detail survives this sentence.',
          ],
          senior: [
            '{o:I led} the move of {s:merchant payouts to a new ledger}, planned at {n:eight weeks}. It took {n:thirteen}. {o:The slip was mine}: I scheduled the {m:dual-write comparison} last, and in week six it showed {n:0.3% of rows disagreeing}.',
            'Owns the miss in the first breath. Specific cause, specific number.',
          ],
        },
      },
      decision: {
        why: 'How fast the bad news travelled, and what was protected, are both senior decisions.',
        voices: {
          pm: [
            'I raised a {p:change request}, {p:re-baselined the plan}, and communicated the {p:revised timeline} to all stakeholders through the {p:steering committee}, making sure the impact on downstream milestones was understood and formally accepted.',
            'Re-baselined. What did they choose to cut, and what to keep?',
          ],
          mid: [
            'I let my manager know we would be late, and we kept working on it until all the issues were fixed. We worked some long days, but I did not want to release something that was wrong.',
            'Told the manager and kept going. No trade made.',
          ],
          buzz: [
            'I {b:took full accountability}, {b:re-energised the team} around the mission, and course-corrected with a {b:relentless focus on execution}, turning a difficult moment into an opportunity to raise our game.',
            'Says “accountability” without saying what they did.',
          ],
          senior: [
            '{d:I told my manager that afternoon} that the date was gone, with {n:a new range} and the reason. Then {d:I cut scope instead of the safety check}: {t:reporting moved to a later phase}, and the rule of {m:seven clean days of comparison} stayed.',
            'Bad news the same day, with a range. Cut scope, kept the correctness gate.',
          ],
        },
      },
      mechanism: {
        why: 'Progress is measured by the thing that matters, and the rollout order limits the damage of being wrong.',
        voices: {
          pm: [
            'We increased the {p:reporting cadence}, added the issue to the {p:risk register} with a mitigation plan, and tracked the recovery through {p:weekly milestone reviews} until the variance was closed and the plan was reported as back to green on the dashboard.',
            'More reporting. How was the 0.3% actually closed?',
          ],
          mid: [
            'We went through the differences one at a time, fixed the bugs that caused them, and {m:re-ran the migration scripts} until the numbers matched, which took a while because new differences kept appearing.',
            'Worked the list. How did they know when they were done?',
          ],
          buzz: [
            'We adopted a {b:zero-defect mindset} and applied {b:engineering excellence practices} to {b:de-risk the remainder of the delivery}, with a laser focus on data integrity and operational readiness.',
            'A mindset is not a mechanism.',
          ],
          senior: [
            '{m:Both ledgers took every write} and a {m:nightly job compared them}. The {m:mismatch count became our measure of progress}, not tickets closed, and merchants moved over in {m:cohorts, smallest first}, so a wrong payout could only ever be small.',
            'Dual writes, nightly comparison, progress measured in mismatches, cohorts ordered by blast radius.',
          ],
        },
      },
      result: {
        why: 'A slip story lands when the lesson is a changed habit you can describe, not a document.',
        voices: {
          pm: [
            'The project was delivered against the {p:revised baseline}, and we documented the {p:lessons learned} for future projects, including a recommendation to allow more contingency for data migrations in the estimating guidelines.',
            'Lessons “documented”. Which lesson? What changed?',
          ],
          mid: [
            'We finished {n:about a month late}, but the migration worked and there were no major issues afterwards, so in the end I think taking the extra time was the right thing to do.',
            'No reflection. Would it slip the same way again?',
          ],
          buzz: [
            'Ultimately it was a {b:great learning experience} that made the team {b:stronger and more resilient}, and it reinforced our culture of ownership and continuous improvement.',
            'Learning what? I cannot tell whether anything changed.',
          ],
          senior: [
            '{n:Five weeks late}, and {n:zero incorrect payouts across 40,000 merchants}. {d:What I do differently now}: {m:the riskiest comparison runs in week one}, not week six, and I give {m:dates as a range} with the assumption that would break them.',
            'States the miss plainly, the outcome that mattered, and a habit that changed.',
          ],
        },
      },
    },
  ),
]

export const QUESTION_BY_ID: Record<string, Question> = Object.fromEntries(
  QUESTIONS.map((q) => [q.id, q]),
)

/** The senior variant of a segment. Every segment has exactly one. */
export function strongest(segment: Segment): Variant {
  return segment.variants.find((v) => v.kind === 'senior')!
}
