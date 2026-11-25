import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BugXRay } from './BugXRay'
import { PULL_REQUESTS } from './data'
import BugBash from './index'
import { scoreReview, type Finding } from './logic'
import { PromptLab } from './PromptLab'
import { FindingCard, ReviewWorkspace } from './ReviewWorkspace'

/*
 * Server-render every view once. This cannot click anything, but it does run
 * each component's render path against real scenario data, so a missing field
 * or a bad lookup fails here instead of in the browser.
 */

const text = (html: string) =>
  html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')

const noop = () => {}

describe('the page', () => {
  it('renders each scenario, and falls back to the first for an unknown route', () => {
    for (const pr of PULL_REQUESTS) {
      const page = text(renderToString(createElement(BugBash, { sub: pr.id })))
      expect(page).toContain('AI-Assisted Bug Bash')
      expect(page).toContain(pr.title)
      expect(page).toContain(pr.teammatePrompt)
      expect(page).toContain(`Ticket ${pr.ticket.id}`)
      expect(page).toContain('Submit review')
      expect(page).toContain(pr.files[0]!.path)
      for (const tab of PULL_REQUESTS) expect(page).toContain(tab.tab.title)
    }
    const fallback = text(renderToString(createElement(BugBash, { sub: 'nope' })))
    expect(fallback).toContain(PULL_REQUESTS[0]!.title)
    expect(text(renderToString(createElement(BugBash, {})))).toContain(PULL_REQUESTS[0]!.title)
  })

  it('states where these rounds are reported without overclaiming', () => {
    const page = text(renderToString(createElement(BugBash, {})))
    expect(page).toContain('since October 2025')
    expect(page).toContain('reported to be piloting')
    expect(page).toContain('Formats vary by team, level and country')
  })

  it('does not give the answers away before a review is submitted', () => {
    for (const pr of PULL_REQUESTS) {
      const page = text(renderToString(createElement(BugBash, { sub: pr.id })))
      for (const bug of pr.bugs) {
        expect(page).not.toContain(bug.title.replace(/`/g, ''))
        expect(page).not.toContain(bug.impact)
      }
    }
  })
})

describe('the review workspace', () => {
  it('shows the code, the PR description, and an empty review', () => {
    for (const pr of PULL_REQUESTS) {
      const html = renderToString(
        createElement(ReviewWorkspace, { pr, onSolved: noop, onReview: noop }),
      )
      const page = text(html)
      expect(page).toContain(pr.description.summary)
      expect(page).toContain(`${pr.flagBudget} of ${pr.flagBudget} flags left`)
      expect(page).toContain('No flags yet')
      // every line of the first file is a clickable, labelled row
      const rows = html.match(/role="button"/g) ?? []
      expect(rows.length).toBe(pr.files[0]!.code.split('\n').length)
    }
  })
})

describe('finding cards', () => {
  const pr = PULL_REQUESTS[0]!
  const bug = pr.bugs[0]!
  const render = (finding: Finding, revealed: boolean) =>
    text(renderToString(createElement(FindingCard, { pr, finding, revealed, onShow: noop })))

  it('keeps a missed bug hidden until it is revealed', () => {
    const hidden = render({ bug, status: 'missed' }, false)
    expect(hidden).toContain('Still in there')
    expect(hidden).not.toContain(bug.category)
    const shown = render({ bug, status: 'missed' }, true)
    expect(shown).toContain('Missed')
    expect(shown).toContain(bug.category)
  })

  it('explains a right line with the wrong name, and a confirmed finding', () => {
    const flag = { fileId: 'handler', line: bug.locations[0]!.lines[0], diagnosis: 'Resource leak' }
    const spotted = render({ bug, status: 'spotted', flag }, false)
    expect(spotted).toContain('Right line, wrong name')
    expect(spotted).toContain('"Resource leak"')
    const unnamed = render({ bug, status: 'spotted', flag: { ...flag, diagnosis: null } }, false)
    expect(unnamed).toContain('did not say why')
    const named = render({ bug, status: 'diagnosed', flag }, false)
    expect(named).toContain('Found and named')
    expect(named).toContain('Why it slips through')
  })
})

describe('the x-ray', () => {
  it('renders every pull request with and without a prior review', () => {
    for (const pr of PULL_REQUESTS) {
      const fresh = text(renderToString(createElement(BugXRay, { pr, review: null })))
      expect(fresh).toContain('Watch it break')
      for (const bug of pr.bugs) expect(fresh).toContain(bug.category)
      expect(fresh).toContain(pr.bugs[0]!.trace.broken[0]!.detail)
      expect(fresh).not.toContain('you missed this')

      // After a review that found only the first bug, it opens on the first missed one.
      const first = pr.bugs[0]!
      const review = scoreReview(pr, [
        {
          fileId: first.locations[0]!.fileId,
          line: first.locations[0]!.lines[0],
          diagnosis: first.category,
        },
      ])
      const after = text(renderToString(createElement(BugXRay, { pr, review })))
      expect(after).toContain('you found this')
      expect(after).toContain('you missed this')
      expect(after).toContain(pr.bugs[1]!.trace.broken[0]!.detail)
    }
  })
})

describe('the prompt lab', () => {
  it('offers all three prompts for every bug and hides their verdicts until opened', () => {
    for (const pr of PULL_REQUESTS) {
      for (const bug of pr.bugs) {
        const page = text(renderToString(createElement(PromptLab, { bug })))
        for (const option of bug.prompts) expect(page).toContain(option.prompt)
        expect(page).toContain('no model is called')
        expect(page).not.toContain('Strong signal')
        expect(page).not.toContain('A scoped ask')
      }
    }
  })
})
