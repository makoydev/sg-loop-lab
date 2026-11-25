import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { QUESTIONS, strongest } from './content/mixer'
import { CV_ORDER, REFERENCE_ORDER } from './content/opening'
import Translator from './index'
import { XRay as MixerXRay, type Answer } from './mixer/MixerLab'
import { XRay as OpeningXRay } from './opening/OpeningLab'

/*
 * Render smoke tests: every tab and every X-Ray mounts and produces the
 * content it is supposed to. They run on the server renderer, so they catch
 * broken imports, bad props and render-time exceptions without a browser.
 */

const html = (element: ReturnType<typeof createElement>) => renderToString(element)

describe('Translator renders', () => {
  it('the opening tab, by default', () => {
    const out = html(createElement(Translator, {}))
    expect(out).toContain('PMP + CPMAI Translator')
    expect(out).toContain('tell me about yourself')
    expect(out).toContain('Project manager who used to code')
    expect(out).toContain('I hold a PMP')
  })

  it('the answer mixer, with every question listed and four unlabelled options per part', () => {
    const out = html(createElement(Translator, { sub: 'mixer' }))
    for (const q of QUESTIONS) expect(out).toContain(q.short)
    expect(out.match(/role="radio"/g)).toHaveLength(16)
    expect(out).not.toContain('PM-flavoured')
    expect(out).not.toContain('Buzzword trap')
    expect(out).toContain('Waiting for this part.')
  })

  it('the translation map, with all twelve phrases and six CPMAI phases', () => {
    const out = html(createElement(Translator, { sub: 'map' }))
    expect(out).toContain('Risk register')
    expect(out).toContain('Communication plan')
    expect(out).toContain('Failure modes, ranked by blast radius')
    expect(out).toContain('Model Operationalization')
    expect(out).toContain('data, before any model')
  })

  it('falls back to the opening for an unknown tab', () => {
    expect(html(createElement(Translator, { sub: 'nope' }))).toContain('tell me about yourself')
  })
})

describe('X-Rays render', () => {
  it('the opening replay, for the CV order, the reference and an empty opening', () => {
    for (const order of [CV_ORDER, REFERENCE_ORDER, []]) {
      const out = html(createElement(OpeningXRay, { order }))
      expect(out).toContain('How the impression forms')
      expect(out).toContain('Things a panel can write down')
    }
  })

  it('the answer comparison, for every question, with and without an answer', () => {
    for (const q of QUESTIONS) {
      const full: Answer = Object.fromEntries(q.segments.map((s) => [s.id, strongest(s).id]))
      for (const answer of [undefined, full]) {
        const out = html(createElement(MixerXRay, { question: q, answer, onQuestion: () => {} }))
        expect(out).toContain('The strongest answer')
        expect(out).toContain(q.segments[0]!.why)
      }
    }
  })
})
