# Loop Lab

Explorable interview prep for senior software engineering loops in Singapore, as they are run in late 2026.

**Live: https://makoydev.github.io/sg-loop-lab/**

Nothing in here is a flashcard. Every lab makes you attempt the problem first, and when you get stuck it lets you look inside the machine: step an algorithm, scrub a race condition, replay an incident against your own design.

It runs entirely in the browser. No account, no backend, no API keys. Progress is kept in `localStorage` on your device.

## Run it

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

```bash
npm run check      # type-check, lint, tests, production build
npm test           # 321 unit tests on the simulation logic
npm run build      # static site in dist/
npm run preview    # serve the production build
```

The build is a plain static site with relative asset paths and hash routing, so `dist/` can be dropped on any static host or sub-path without configuration.

Every push to `main` runs `npm run check` in GitHub Actions and, if it passes, publishes `dist/` to GitHub Pages. The workflow is `.github/workflows/ci.yml`.

## How every lab works

Each scenario is a four-rung hint ladder. Rungs unlock one at a time, so the answer is never one click from the question. Solving the challenge unlocks the rest.

| Rung | What you do |
| --- | --- |
| **Struggle** | Attempt the problem cold, on "paper". |
| **Nudge** | One conceptual push. Never the answer. |
| **X-Ray** | Open the mechanism on "film": step it, scrub it, inject faults. |
| **Takeaway** | The insight as a senior engineer would say it, with the traps and a line to say out loud. |

## The labs

**Loop Calibrator** (`#/`). Pick one of four kinds of Singapore employer (regional tech, global tech and fintech, banks, public-good tech) and watch the interview mix re-cut itself across five kinds of round. Shows the usual sequence, what is really graded, where six years of experience gets levelled down, and where a PMP and CPMAI help. Splits a weekly hour budget across the labs.

**Pattern & Concurrency Lab** (`#/patterns`)

- *Rate limiter.* Place requests on a timeline to sneak twice the limit past a fixed-window limiter. The X-Ray runs the same stream through four limiters with the code in step.
- *Top-K heap.* Be the heap: decide what gets on the board and sift it into place by hand. The X-Ray shows the gate rising over a stream.
- *Flash-sale race.* You are the scheduler: interleave two checkout workers until one phone sells twice. Then try to break the atomic update, a TTL lock and a fencing token. The X-Ray enumerates every possible interleaving.
- *The requirement changed.* A four-part problem against a 45-minute clock. Your Part 1 choices decide what Parts 2 to 4 cost.

**AI-Assisted Bug Bash** (`#/bugbash`). Review three pull requests an assistant wrote: an idempotent refund endpoint, a RAG support agent, a driver-location cache. Flag lines, name the problem, check the dependency's docs. The X-Ray plays an execution trace of each bug, as merged and with the fix. A prompt lab compares a vague follow-up, an over-delegating one and a scoped one. Assistant output is scripted; no model is called.

**System Design Sandbox** (`#/design`)

- *Flash sale at midnight.* A live architecture for 600,000 buyers and 5,000 phones. Change the design and a deterministic simulation moves latency, oversell, duplicates and the monthly bill. The X-Ray is four interviewer pushbacks, each with the dashboard signals and alerts you would want.
- *The refund agent.* A bank's support agent that can issue refunds. Controls are grouped under the four dimensions of IMDA's agentic AI framework, with a materiality read-out in the MAS vocabulary. Replay five incidents (prompt injection, a stale policy, a provider outage, a retry, a cross-customer probe) against your own design.

**PMP + CPMAI Translator** (`#/translator`)

- *The first 90 seconds.* Reorder and cut the lines of a "tell me about yourself" until the panel hears an engineer who can lead.
- *The answer mixer.* Assemble answers to five leadership questions from unlabelled variants while an interviewer's notepad fills in.
- *Translation map.* Twelve delivery concepts in the form an engineering panel rewards, and the six CPMAI phases as moves in an AI system design round.

## Accuracy

Interview formats and regulatory guidance both move. Everything factual was checked on 25 Nov 2026 and is graded by source quality on the in-app **Sources & caveats** page (`#/sources`). In short:

- Regulatory facts (IMDA's Model AI Governance Framework for Agentic AI, MAS' Guidelines on AI Risk Management) live in one file, `src/lib/facts.ts`. Dates were confirmed across several sources; practice-level detail is paraphrased from summaries. Read the originals before quoting them.
- What is known about each employer's loop is candidate-reported. The Calibrator's round weightings are estimates for planning prep, not data.
- Numbers in the sandboxes come from small deterministic teaching models. They move in the right direction for the right reasons. They are not benchmarks.

## Stack

- Vite 8, React 19, TypeScript 7 (strict)
- Tailwind CSS 4, with the design tokens in `src/styles/index.css`
- Motion for layout and presence animation; SVG with SMIL for flowing traffic
- Vitest for the simulation logic, oxlint for linting
- Self-hosted fonts (Fraunces, IBM Plex Sans, IBM Plex Mono), so it works offline

## Layout

```
src/
  App.tsx              shell, line-map navigation, hash routes
  styles/index.css     tokens: the "paper" and "film" surfaces, lab colours
  lib/                 router, storage, playback, highlighter, facts
  components/          HintLadder, Film, Scrubber, CodePanel, SequenceTrace,
                       FlowDiagram, Meter, Scorecard, Takeaway, ui primitives
  modules/
    calibrator/        landing page and sources
    patterns/          rate-limiter, top-k, race, evolving
    bugbash/           review workspace, traces, prompt lab, three PRs
    design/            flash-sale, agent
    translator/        opening, mixer, map
```

Each scenario keeps its behaviour in a pure `logic.ts` with a `logic.test.ts` beside it. The interface only renders what the logic computes, which is what makes the visualizers scrubbable and the claims in them testable. The race lab, for example, proves its "this cannot be broken" claims by exhaustively enumerating every interleaving.

## Licence

MIT, see [`LICENSE`](LICENSE). The bundled fonts (Fraunces, IBM Plex Sans, IBM Plex Mono) are under the SIL Open Font License 1.1.
