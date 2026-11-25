import type { PullRequest } from '../types'
import { at, parseDiff, src } from './locate'

/*
 * PR 1: "Add idempotency to the refund endpoint".
 * The ledger and store clients are fictional internal libraries; their
 * contracts are whatever the Docs tab says they are.
 */

const HANDLER = src(`
import { ledger } from '../clients/ledger'
import { store } from '../clients/store'
import type { Request, Response } from '../http'
import { log } from '../log'
import { toMinorUnits } from './money'

const KEY_TTL_S = 24 * 60 * 60

type RefundBody = {
  chargeId: string
  amount: number
  currency: 'SGD'
  reason?: string
}

export async function createRefund(req: Request<RefundBody>, res: Response) {
  const key = req.header('Idempotency-Key')
  if (!key) {
    return res.status(400).json({ error: 'Idempotency-Key header is required' })
  }

  const { chargeId, amount, currency, reason } = req.body
  if (!chargeId || !(amount > 0)) {
    return res.status(422).json({ error: 'chargeId and amount are required' })
  }

  const cacheKey = \`refund:\${req.merchantId}:\${key}\`
  const existing = await store.get(cacheKey)
  if (existing) {
    log.info('refund.replayed', { key })
    return res.status(200).json(JSON.parse(existing))
  }

  const charge = await ledger.getCharge(chargeId)
  if (charge.merchantId !== req.merchantId) {
    return res.status(404).json({ error: 'charge not found' })
  }

  const refund = await ledger.refund(
    { chargeId, amount: toMinorUnits(amount), currency, reason },
    { idempotent: true, timeoutMs: 5000 },
  )

  const body = { id: refund.id, status: refund.status, amount, currency }
  await store.set(cacheKey, JSON.stringify(body), { ttlSeconds: KEY_TTL_S })

  log.info('refund.created', { key, refundId: refund.id })
  return res.status(201).json(body)
}
`)

const MONEY = src(`
/** Minor units per major unit, by currency. */
const MINOR_UNITS: Record<string, number> = {
  SGD: 100,
  USD: 100,
  JPY: 1,
}

/** Convert a decimal amount such as 12.50 into minor units such as 1250. */
export function toMinorUnits(amount: number, currency = 'SGD'): number {
  const factor = MINOR_UNITS[currency] ?? 100
  return Math.floor(amount * factor)
}

/** Format minor units for display: 1250 becomes "S$12.50". */
export function formatAmount(minor: number, currency = 'SGD'): string {
  const factor = MINOR_UNITS[currency] ?? 100
  const digits = factor === 1 ? 0 : 2
  const symbol = currency === 'SGD' ? 'S$' : currency + ' '
  return symbol + (minor / factor).toFixed(digits)
}

/** True when two decimal amounts are the same number of minor units. */
export function sameAmount(a: number, b: number, currency = 'SGD'): boolean {
  return toMinorUnits(a, currency) === toMinorUnits(b, currency)
}
`)

const RACE_FIX = parseDiff(`
    const cacheKey = \`refund:\${req.merchantId}:\${key}\`
-   const existing = await store.get(cacheKey)
-   if (existing) {
-     log.info('refund.replayed', { key })
-     return res.status(200).json(JSON.parse(existing))
-   }
+   const claimed = await store.set(cacheKey, IN_PROGRESS, {
+     ttlSeconds: KEY_TTL_S,
+     onlyIfAbsent: true,
+   })
+   if (!claimed) {
+     const record = JSON.parse((await store.get(cacheKey)) ?? IN_PROGRESS)
+     if (record.state === 'in_progress') {
+       return res.status(409).json({ error: 'request in progress' })
+     }
+     return res.status(200).json(record.body)
+   }

    // charge lookup and ledger.refund, unchanged

-   await store.set(cacheKey, JSON.stringify(body), { ttlSeconds: KEY_TTL_S })
+   const done = JSON.stringify({ state: 'completed', body })
+   await store.set(cacheKey, done, { ttlSeconds: KEY_TTL_S })
`)

const FLOAT_FIX = parseDiff(`
  type RefundBody = {
    chargeId: string
-   amount: number
+   /** Integer minor units: 1999 means S$19.99. */
+   amountMinor: number
    currency: 'SGD'
    reason?: string
  }

-   if (!chargeId || !(amount > 0)) {
+   if (!chargeId || !Number.isInteger(amountMinor) || amountMinor <= 0) {
      return res.status(422).json({ error: 'chargeId and amount are required' })
    }

    const refund = await ledger.refund(
-     { chargeId, amount: toMinorUnits(amount), currency, reason },
+     { chargeId, amount: amountMinor, currency, reason },
`)

const OPTION_FIX = parseDiff(`
    const refund = await ledger.refund(
      { chargeId, amount: toMinorUnits(amount), currency, reason },
-     { idempotent: true, timeoutMs: 5000 },
+     { idempotencyKey: \`\${req.merchantId}:\${key}\`, timeoutMs: 5000 },
    )
`)

export const refunds: PullRequest = {
  id: 'refunds',
  ladderId: 'bugbash/refunds',
  number: 2417,
  title: 'Add idempotency to POST /v1/refunds',
  tab: { title: 'Idempotent refunds', sub: 'TypeScript · payments · 2 files' },
  tags: ['Bug bash round', '45 min', 'TypeScript'],
  ticket: {
    id: 'PAY-2417',
    paragraphs: [
      'Merchants retry `POST /v1/refunds` when it times out. Twice this quarter, a retry produced a **second refund**.',
      'A teammate asked the assistant to make the endpoint safe to retry, and it opened a pull request. You are the reviewer. Find what is wrong before it ships.',
    ],
  },
  teammatePrompt:
    'add idempotency to the refund endpoint so retries are safe. make it production ready',
  description: {
    summary: 'Makes POST /v1/refunds fully safe to retry.',
    bullets: [
      'Clients send an Idempotency-Key header. We look the key up first and replay the stored response for a repeated request.',
      'Amounts are converted from dollars to cents with a shared helper before the ledger call.',
      'The ledger call itself is marked idempotent, so the operation is exactly-once end to end.',
      'Validates input and scopes keys per merchant.',
    ],
    closing: 'All 14 existing tests pass. Safe to merge.',
  },
  files: [
    { id: 'handler', path: 'src/refunds/handler.ts', lang: 'ts', code: HANDLER },
    { id: 'money', path: 'src/refunds/money.ts', lang: 'ts', code: MONEY },
  ],
  docs: {
    intro:
      'The contracts of what this PR calls. In the room, this is the tab you are allowed to open, and the one most candidates never do.',
    entries: [
      {
        title: 'ledger.refund(params, options?)',
        lang: 'ts',
        signature: src(`
refund(
  params: RefundParams,
  options?: CallOptions,
): Promise<Refund>

type RefundParams = {
  chargeId: string
  amount: number
  currency: string
  reason?: string
}

type CallOptions = {
  idempotencyKey?: string
  timeoutMs?: number
  [extra: string]: unknown
}
`),
        notes: [
          '`amount` is an integer in minor units (cents). A non-integer is rejected with `invalid_amount`.',
          'Pass `idempotencyKey` to make the call safe to retry. The ledger keeps the first result under that key for 24 hours and returns it for any repeat.',
          'Unknown fields in `options` are accepted and ignored.',
          'Rejects with `amount_exceeds_refundable` when the amount is more than the charge has left to refund.',
          'On a timeout the outcome is unknown: the refund may have been applied. Retry with the same `idempotencyKey`.',
        ],
      },
      {
        title: 'store.get(key) · store.set(key, value, options)',
        lang: 'ts',
        signature: src(`
get(key: string): Promise<string | null>

set(
  key: string,
  value: string,
  options: SetOptions,
): Promise<boolean>

type SetOptions = {
  ttlSeconds: number
  onlyIfAbsent?: boolean
}
`),
        notes: [
          '`set` with `onlyIfAbsent: true` is atomic. It resolves `true` if it wrote the key and `false` if the key already existed.',
          'A `get` followed by a `set` is two separate round trips. Other callers can run between them.',
        ],
      },
      {
        title: 'ledger.getCharge(id)',
        notes: [
          'Resolves `{ id, merchantId, amount, refundableAmount, currency }`. Amounts are integers in minor units.',
        ],
      },
      {
        title: 'Runtime',
        notes: [
          'The refunds service runs 12 pods behind a load balancer.',
          'Merchant SDKs retry after a 500 ms timeout, sending the same `Idempotency-Key`.',
          'Handlers may throw. The router turns ledger errors into 4xx responses and anything else into a 500.',
        ],
      },
    ],
  },
  categories: [
    'Race condition',
    'Money precision',
    'API contract misuse',
    'Missing authorisation',
    'Swallowed error',
    'Resource leak',
  ],
  flagBudget: 5,
  bugs: [
    {
      id: 'refunds-race',
      title: 'The idempotency check is a read, then a write, with the refund in between',
      category: 'Race condition',
      severity: 'critical',
      fn: 'createRefund()',
      locations: [
        at(
          'handler',
          HANDLER,
          'const existing = await store.get(cacheKey)',
          'return res.status(200).json(JSON.parse(existing))',
          1,
        ),
        at('handler', HANDLER, 'await store.set(cacheKey, JSON.stringify(body)'),
      ],
      summary:
        'The handler reads the key with `store.get`, calls the ledger, and only then writes the key with `store.set`. Two requests carrying the same key can both read "absent" before either one writes, and both go on to refund.',
      plausible:
        'It reads exactly like the textbook description of idempotency, and it passes every test that sends one request at a time. The bug only exists when two requests overlap, which is precisely what a retry is.',
      impact:
        'A duplicate refund on every timeout and retry: the exact incident the ticket was opened to stop.',
      trace: {
        lanes: [
          { id: 'r1', label: 'Request 1', sub: 'original', tone: 'trace' },
          { id: 'r2', label: 'Request 2', sub: 'client retry', tone: 'info' },
          { id: 'store', label: 'Key store', sub: 'shared by 12 pods' },
          { id: 'ledger', label: 'Ledger' },
        ],
        initialState: { key: 'absent', refunds: 0 },
        broken: [
          {
            from: 'r1',
            to: 'store',
            label: 'GET key → absent',
            detail:
              'The first request looks the idempotency key up. Nothing is stored under it yet.',
          },
          {
            from: 'r1',
            to: 'ledger',
            label: 'refund S$120',
            detail:
              'No key, so it asks the ledger to refund S$120 of a S$400 charge. The ledger takes about 800 ms.',
          },
          {
            from: 'r2',
            to: 'store',
            label: 'GET key → absent',
            tone: 'warn',
            detail:
              "The merchant's SDK gave up after 500 ms and retried with the same key. Request 1 has not written the key yet, so this lookup comes back empty too.",
          },
          {
            from: 'r2',
            to: 'ledger',
            label: 'refund S$120',
            tone: 'bad',
            detail: 'So the retry asks the ledger for the same refund again.',
          },
          {
            from: 'ledger',
            to: 'r1',
            label: 'rf_1 succeeded',
            dashed: true,
            detail: 'The first refund goes through.',
            state: { refunds: 1 },
          },
          {
            from: 'ledger',
            to: 'r2',
            label: 'rf_2 succeeded',
            dashed: true,
            tone: 'bad',
            detail: 'And so does the second. The charge had S$400 to give, so the ledger has no reason to object.',
            state: { refunds: 2 },
          },
          {
            from: 'r1',
            to: 'store',
            label: 'SET key = rf_1',
            detail: 'Request 1 finally records its response under the key.',
            state: { key: 'rf_1' },
          },
          {
            from: 'r2',
            to: 'store',
            label: 'SET key = rf_2',
            tone: 'bad',
            detail:
              'Request 2 overwrites it. The stored response now points at the second refund, and the first is invisible to any later retry.',
            state: { key: 'rf_2' },
          },
        ],
        fixed: [
          {
            from: 'r1',
            to: 'store',
            label: 'SET key IF ABSENT → won',
            tone: 'ok',
            detail: 'One atomic operation claims the key before anything else happens.',
            state: { key: 'in_progress' },
          },
          {
            from: 'r1',
            to: 'ledger',
            label: 'refund S$120',
            detail: 'Only the request that won the claim is allowed to talk to the ledger.',
          },
          {
            from: 'r2',
            to: 'store',
            label: 'SET key IF ABSENT → lost',
            tone: 'ok',
            detail:
              'The retry tries to claim the same key and loses, because the check and the claim are now the same operation.',
          },
          {
            from: 'r2',
            label: '409: still in progress',
            tone: 'ok',
            detail: 'It never reaches the ledger. The client is told to try again shortly.',
          },
          {
            from: 'ledger',
            to: 'r1',
            label: 'rf_1 succeeded',
            dashed: true,
            detail: 'One refund.',
            state: { refunds: 1 },
          },
          {
            from: 'r1',
            to: 'store',
            label: 'SET key = completed rf_1',
            detail: 'The claim is replaced by the finished response.',
            state: { key: 'completed rf_1' },
          },
          {
            from: 'r2',
            to: 'store',
            label: 'later retry: GET → rf_1',
            tone: 'ok',
            detail: 'The next retry finds the completed record and replays the stored response.',
          },
        ],
        brokenOutcome:
          'S$240 refunded where S$120 was asked for. The key was checked both times and protected nothing.',
        fixedOutcome: 'One refund. Every retry, early or late, ends at the same answer.',
      },
      fix: {
        path: 'src/refunds/handler.ts',
        lang: 'ts',
        ...RACE_FIX,
        note: 'The claim and the check are one atomic operation, made before any money moves. If the ledger call throws, release the claim so a retry can run.',
      },
      prompts: [
        {
          kind: 'vague',
          prompt: "The idempotency doesn't work under concurrency, fix it.",
          outcome: {
            files: 1,
            added: 16,
            removed: 2,
            happened:
              'It adds a module-level `Set` of keys that are being processed, and returns 409 when the key is already in it.',
            damage:
              'The set lives in one pod. You run 12, so the retry lands on a different pod and sails through. The unit test it added passes, because tests run in one process.',
            reviewMinutes: 10,
            verdict: 'weak',
            interviewer:
              'You named a symptom and let the assistant choose the mechanism. They cannot tell whether you know why it breaks.',
          },
        },
        {
          kind: 'delegate',
          prompt:
            'Rewrite the refund handler to be production ready, with proper idempotency, retries and error handling.',
          outcome: {
            files: 4,
            added: 214,
            removed: 46,
            happened:
              'A new `IdempotencyService`, a retry wrapper, a custom error hierarchy and a different response shape.',
            damage:
              'Inside the new service the claim is still a `get` followed by a `set`, now three calls deep. The retry wrapper calls the ledger again on timeout, which adds a second way to refund twice.',
            reviewMinutes: 40,
            verdict: 'risky',
            interviewer:
              'A five-line fix became a rewrite you now have to review against the clock, and the original bug survived the move.',
          },
        },
        {
          kind: 'scoped',
          prompt:
            'In createRefund, the key is read with store.get before the ledger call and written with store.set after it, so two concurrent requests with the same key both miss. Replace the read with a single store.set(cacheKey, IN_PROGRESS, { ttlSeconds, onlyIfAbsent: true }) made before the ledger call. If it returns false, respond 409 while the stored state is in_progress, or with the stored body once it is completed. Keep the route, the response shape and every other file unchanged. Add a test that sends two requests with the same key at once and asserts ledger.refund is called exactly once.',
          outcome: {
            files: 2,
            added: 41,
            removed: 7,
            happened: 'Exactly that change in the handler, plus the concurrent test.',
            damage:
              'Nothing broken. One gap it did not raise and you should: if the ledger call throws, the in-progress claim blocks every retry until its TTL runs out.',
            reviewMinutes: 6,
            verdict: 'strong',
            interviewer:
              'Function, invariant, constraint, proof. The assistant did the typing, the engineering was yours, and you still read the diff.',
          },
        },
      ],
    },
    {
      id: 'refunds-float',
      title: 'Money goes through floating point and gets floored',
      category: 'Money precision',
      severity: 'high',
      fn: 'toMinorUnits()',
      locations: [
        at('money', MONEY, 'export function toMinorUnits(', 'return Math.floor(amount * factor)', 1),
        at('handler', HANDLER, '  amount: number'),
        at('handler', HANDLER, '{ chargeId, amount: toMinorUnits(amount), currency, reason },'),
      ],
      summary:
        'The API accepts a decimal amount, and `toMinorUnits` multiplies it by 100 and floors the result. In binary floating point `19.99 * 100` is `1998.9999999999998`, so the ledger is asked for 1998 cents.',
      plausible:
        'The helper has a doc comment, handles zero-decimal currencies, and works for the amounts people type into tests: 10, 12.50, 100.',
      impact:
        'About one two-decimal amount in twenty comes out a cent short. The customer is under-refunded, and the response still echoes the original amount, so nobody notices until reconciliation.',
      trace: {
        lanes: [
          { id: 'client', label: 'Merchant', sub: 'POST /v1/refunds' },
          { id: 'handler', label: 'Refund handler', sub: 'amount handling', tone: 'trace' },
          { id: 'ledger', label: 'Ledger' },
        ],
        broken: [
          {
            from: 'client',
            to: 'handler',
            label: 'amount: 19.99',
            detail:
              'The merchant refunds S$19.99. JSON numbers are binary floating point, and 19.99 has no exact binary form.',
          },
          {
            from: 'handler',
            label: '19.99 × 100',
            detail: 'toMinorUnits() multiplies by 100. The result lands a hair under 1999.',
            state: { 'amount × 100': '1998.9999999999998' },
          },
          {
            from: 'handler',
            label: 'Math.floor → 1998',
            tone: 'bad',
            detail: 'Flooring throws the hair away, and a whole cent goes with it.',
            state: { minor: 1998 },
          },
          {
            from: 'handler',
            to: 'ledger',
            label: 'refund 1998',
            tone: 'bad',
            detail: "1998 is an integer, so the ledger's validation passes. It refunds S$19.98.",
          },
          {
            from: 'ledger',
            to: 'handler',
            label: 'rf_1: 1998 refunded',
            dashed: true,
            tone: 'bad',
            detail: 'The customer receives one cent less than they were promised.',
            state: { 'customer receives': 'S$19.98' },
          },
          {
            from: 'handler',
            to: 'client',
            label: '201 { amount: 19.99 }',
            dashed: true,
            tone: 'bad',
            detail:
              'The response echoes the number the merchant sent. Merchant, ledger and customer now disagree by a cent, and nothing has logged it.',
            state: { 'merchant is told': 'S$19.99' },
          },
        ],
        fixed: [
          {
            from: 'client',
            to: 'handler',
            label: 'amountMinor: 1999',
            tone: 'ok',
            detail:
              'The API takes integer minor units. There is nothing to convert, so there is nothing to round.',
          },
          {
            from: 'handler',
            label: 'Number.isInteger(1999) ✓',
            tone: 'ok',
            detail: 'A decimal amount is now a 422 at the door, not a guess further in.',
            state: { minor: 1999 },
          },
          {
            from: 'handler',
            to: 'ledger',
            label: 'refund 1999',
            tone: 'ok',
            detail: 'The same integer the merchant sent goes straight to the ledger.',
          },
          {
            from: 'ledger',
            to: 'handler',
            label: 'rf_1: 1999 refunded',
            dashed: true,
            tone: 'ok',
            detail: 'The customer receives the full amount.',
            state: { 'customer receives': 'S$19.99' },
          },
          {
            from: 'handler',
            to: 'client',
            label: '201 { amountMinor: 1999 }',
            dashed: true,
            tone: 'ok',
            detail: 'Everyone holds the same number.',
            state: { 'merchant is told': 'S$19.99' },
          },
        ],
        brokenOutcome:
          'A cent short on about one two-decimal amount in twenty, invisible until someone reconciles.',
        fixedOutcome:
          'Integers in, integers through, integers out. The only place a decimal point appears is the screen.',
      },
      fix: {
        path: 'src/refunds/handler.ts',
        lang: 'ts',
        ...FLOAT_FIX,
        note: 'No conversion means no rounding. It is a breaking change to the request body, so version the field or accept both for a while.',
      },
      prompts: [
        {
          kind: 'delegate',
          prompt: 'Make all the money handling in this service robust and production ready.',
          outcome: {
            files: 6,
            added: 188,
            removed: 31,
            happened:
              'It introduces a `Money` class, pulls in a decimal library, and changes every call site in the service.',
            damage:
              'A new dependency nobody reviewed, a class whose constructor still accepts floats, and a public API that still takes `amount: 19.99`. Three unrelated endpoints changed inside a refund PR.',
            reviewMinutes: 35,
            verdict: 'risky',
            interviewer:
              'The blast radius grew from one function to the whole service, and the place where the float enters is untouched.',
          },
        },
        {
          kind: 'scoped',
          prompt:
            'Money must be integer minor units end to end. In RefundBody replace amount: number with amountMinor: number. Validate it with Number.isInteger(amountMinor) && amountMinor > 0 and return 422 otherwise. Pass it straight to ledger.refund and stop calling toMinorUnits in the handler. Do not touch formatAmount or other endpoints. Add tests for 1999 (accepted, forwarded unchanged) and 19.99 (rejected with 422).',
          outcome: {
            files: 2,
            added: 22,
            removed: 6,
            happened: 'The body type, the validation and the call site change, with two tests.',
            damage:
              'Nothing broken. It is a breaking API change, which you call out yourself: version the field, or accept both during a migration window.',
            reviewMinutes: 5,
            verdict: 'strong',
            interviewer:
              'You fixed the representation, not the symptom, and you named what the fix costs before anyone asked.',
          },
        },
        {
          kind: 'vague',
          prompt: "There's a rounding bug in the money conversion, fix it.",
          outcome: {
            files: 1,
            added: 1,
            removed: 1,
            happened: 'It changes `Math.floor` to `Math.round`.',
            damage:
              'That repairs 19.99 and leaves the cause alone. The API still takes floats, `sameAmount` still compares them, and the next person to do arithmetic on an amount brings the bug back.',
            reviewMinutes: 5,
            verdict: 'weak',
            interviewer:
              'It works for the example you gave. You have not shown that you know the representation is the bug, not the rounding mode.',
          },
        },
      ],
    },
    {
      id: 'refunds-option',
      title: '`idempotent: true` is not an option the ledger client has',
      category: 'API contract misuse',
      severity: 'high',
      fn: 'createRefund()',
      locations: [
        at('handler', HANDLER, 'const refund = await ledger.refund('),
        at('handler', HANDLER, '{ idempotent: true, timeoutMs: 5000 },'),
      ],
      summary:
        "The call passes `{ idempotent: true }`. The client's real option is `idempotencyKey: string`, and it accepts unknown fields without complaint. The ledger call has no idempotency at all.",
      plausible:
        'The name is exactly what you would guess, the options type accepts extra fields so the compiler is satisfied, and the PR description says the call is idempotent. Only the docs say otherwise.',
      impact:
        'When the ledger call times out after applying the refund, our own key is never stored, the merchant retries, and the ledger refunds again.',
      trace: {
        lanes: [
          { id: 'handler', label: 'Refund handler', tone: 'trace' },
          { id: 'client', label: 'Ledger client', sub: 'library' },
          { id: 'core', label: 'Ledger service' },
        ],
        initialState: { refunds: 0 },
        broken: [
          {
            from: 'handler',
            to: 'client',
            label: 'refund(…, { idempotent: true })',
            detail: 'The handler believes it has asked for an idempotent refund.',
          },
          {
            from: 'client',
            label: 'unknown option: ignored',
            tone: 'warn',
            detail:
              'The client has no option called idempotent. It accepts unknown fields and drops them (see Docs).',
          },
          {
            from: 'client',
            to: 'core',
            label: 'POST /refunds (no key)',
            detail: 'The request reaches the ledger with nothing that identifies the intent.',
          },
          {
            from: 'core',
            label: 'rf_1 applied',
            detail: 'The refund is applied.',
            state: { refunds: 1 },
          },
          {
            from: 'core',
            to: 'client',
            label: 'response lost: 5s timeout',
            dashed: true,
            tone: 'warn',
            detail: 'The refund happened. The response did not make it back in time.',
          },
          {
            from: 'client',
            to: 'handler',
            label: 'throws TimeoutError',
            dashed: true,
            tone: 'warn',
            detail:
              "The handler throws before it stores the merchant's key, so our own record says nothing happened.",
          },
          {
            from: 'handler',
            to: 'client',
            label: 'merchant retries: refund(…)',
            detail: 'The merchant retries. Our key is absent, so the handler calls the ledger again.',
          },
          {
            from: 'client',
            to: 'core',
            label: 'POST /refunds (no key, again)',
            tone: 'bad',
            detail: 'With no key, the ledger cannot know this is the same intent.',
          },
          {
            from: 'core',
            label: 'rf_2 applied',
            tone: 'bad',
            detail: 'A second refund for one request.',
            state: { refunds: 2 },
          },
        ],
        fixed: [
          {
            from: 'handler',
            to: 'client',
            label: 'refund(…, { idempotencyKey })',
            tone: 'ok',
            detail: 'The handler passes the option the client actually has.',
          },
          {
            from: 'client',
            to: 'core',
            label: 'POST /refunds  key m_81:k_7f',
            detail: "The merchant-scoped key travels with the request as the ledger's own idempotency key.",
          },
          {
            from: 'core',
            label: 'rf_1 applied, saved under key',
            detail: 'The ledger applies the refund and remembers the result under that key.',
            state: { refunds: 1 },
          },
          {
            from: 'core',
            to: 'client',
            label: 'response lost: 5s timeout',
            dashed: true,
            tone: 'warn',
            detail: 'The same timeout as before. This time it is survivable.',
          },
          {
            from: 'client',
            to: 'handler',
            label: 'throws TimeoutError',
            dashed: true,
            tone: 'warn',
            detail: 'The handler still throws, and the merchant still retries.',
          },
          {
            from: 'handler',
            to: 'client',
            label: 'merchant retries: same key',
            detail: 'The retry carries the same key down to the ledger.',
          },
          {
            from: 'core',
            label: 'key seen: replay rf_1',
            tone: 'ok',
            detail: 'The ledger recognises the intent and returns the first refund instead of making another.',
            state: { refunds: 1 },
          },
          {
            from: 'core',
            to: 'handler',
            label: 'rf_1',
            dashed: true,
            tone: 'ok',
            detail: 'The retry gets the original refund back.',
          },
        ],
        brokenOutcome:
          'Two refunds for one request. The safety the PR description promised was a field nobody reads.',
        fixedOutcome:
          'One refund, however many times the call is retried. The timeout becomes a delay instead of a duplicate.',
      },
      fix: {
        path: 'src/refunds/handler.ts',
        lang: 'ts',
        ...OPTION_FIX,
        note: 'The ledger now recognises a retry of the same intent and replays the first refund instead of making another.',
      },
      prompts: [
        {
          kind: 'scoped',
          prompt:
            'ledger.refund has no `idempotent` option. Per the docs its option is idempotencyKey: string, and unknown fields are ignored. In createRefund pass { idempotencyKey: `${req.merchantId}:${key}`, timeoutMs: 5000 } and change nothing else. Add a test with a fake ledger that asserts the idempotencyKey it received equals the merchant-scoped key.',
          outcome: {
            files: 2,
            added: 14,
            removed: 1,
            happened: 'A one-line change and one test.',
            damage:
              'Nothing broken. You confirm one thing in the docs before accepting it: the ledger keeps keys for 24 hours, which matches our own key lifetime.',
            reviewMinutes: 3,
            verdict: 'strong',
            interviewer:
              'You went to the docs, quoted the contract, and asked for the smallest change that satisfies it.',
          },
        },
        {
          kind: 'vague',
          prompt: 'Make sure the ledger call is idempotent.',
          outcome: {
            files: 1,
            added: 3,
            removed: 1,
            happened:
              'It keeps `idempotent: true`, adds `retries: 3` beside it, and writes a comment saying the call is now safely retried.',
            damage:
              '`retries` is not a real option either. There are now two ignored fields and a comment asserting a guarantee that does not exist.',
            reviewMinutes: 8,
            verdict: 'weak',
            interviewer:
              'The assistant guessed an API and you did not make it check. That is the failure this round exists to catch.',
          },
        },
        {
          kind: 'delegate',
          prompt: 'Rewrite the ledger integration so refunds are exactly-once.',
          outcome: {
            files: 3,
            added: 131,
            removed: 12,
            happened:
              'It wraps the client in a new `ExactlyOnceLedger` that keeps its own table of calls it has made and skips repeats.',
            damage:
              'A second idempotency layer with its own storage and its own race, built because it never read that the ledger already takes a key. The phrase "exactly-once" appears in four comments.',
            reviewMinutes: 30,
            verdict: 'risky',
            interviewer: 'You paid for a subsystem to avoid reading one paragraph of documentation.',
          },
        },
      ],
    },
  ],
  decoys: [
    {
      ...at('handler', HANDLER, "const key = req.header('Idempotency-Key')", 'Idempotency-Key header is required', 1),
      why: 'Requiring the header is right. A missing key is a client error, not something to paper over with a generated one.',
    },
    {
      ...at('handler', HANDLER, 'if (!chargeId || !(amount > 0)) {', 'chargeId and amount are required', 1),
      why: 'This rejects zero, negatives and NaN. It is loose about types, but that is not what loses money here. What happens to the amount afterwards is.',
    },
    {
      ...at('handler', HANDLER, 'const cacheKey = '),
      why: 'Scoping the key by merchant is right: two merchants can choose the same key without colliding.',
    },
    {
      ...at('handler', HANDLER, 'const charge = await ledger.getCharge(chargeId)'),
      why: 'The handler never compares the amount with the charge, and it does not need to: the ledger rejects anything above the refundable balance (see Docs).',
    },
    {
      ...at('handler', HANDLER, 'if (charge.merchantId !== req.merchantId) {', "error: 'charge not found'", 1),
      why: "Answering 404 instead of 403 is deliberate. It does not confirm that another merchant's charge exists.",
    },
    {
      ...at('handler', HANDLER, 'const KEY_TTL_S = 24 * 60 * 60'),
      why: 'Twenty-four hours is a normal lifetime for an idempotency key, and it matches what the ledger keeps.',
    },
    {
      ...at('money', MONEY, 'const MINOR_UNITS: Record<string, number> = {', 'JPY: 1,', 1),
      why: 'The currency table is right, including zero-decimal JPY.',
    },
    {
      ...at('money', MONEY, 'export function formatAmount(', 'return symbol + (minor / factor).toFixed(digits)', 1),
      why: 'Dividing for display is safe: toFixed rounds, and nothing computes with the string afterwards.',
    },
    {
      ...at('money', MONEY, 'export function sameAmount(', 'return toMinorUnits(a, currency) === toMinorUnits(b, currency)', 1),
      why: 'sameAmount() inherits whatever toMinorUnits() does. Fix the conversion and this is fine.',
    },
  ],
  takeaway: {
    headline:
      'The assistant wrote code that describes idempotency. Your job was to check whether anything enforces it.',
    points: [
      {
        title: 'Read the side effects before the syntax',
        body: 'Find every line that moves money or writes state, then ask what sits between the check and the act. Here a network call sat between reading the key and writing it. No amount of reading each line on its own shows that. Reading the order does.',
      },
      {
        title: 'Atomic means one operation, not two careful ones',
        body: 'Check-then-act is only safe when the store does both in a single step: insert-if-absent, a unique constraint, a conditional write. If you cannot name the primitive that makes it atomic, it is not.',
      },
      {
        title: 'Verify the contract, do not trust the name',
        body: '`idempotent: true` reads perfectly and does nothing. Generated code is most dangerous where it is most plausible, so open the docs for every call that carries a guarantee. In the room, "let me check what this client actually accepts" is the signal.',
      },
      {
        title: 'Money is integers, or it is a bug waiting for the right amount',
        body: 'Keep minor units from the request body to the ledger. A fix that changes the rounding mode treats the symptom. A fix that removes the float treats the cause.',
      },
    ],
    facts: [
      { label: 'Bugs in this PR', value: '3' },
      { label: 'Tests that caught them', value: '0 of 14' },
      { label: 'Amounts under S$100 floored short', value: '≈ 6%' },
      { label: 'Smallest correct fix', value: '1 line' },
    ],
    traps: [
      'Approving because the tests pass. They send one request at a time.',
      'Typing "fix the bug" and merging what comes back.',
      'Spending your flags on style while the money path goes unread.',
    ],
    sayIt:
      'Before I look at style I want to trace the money: where the key is read, where the refund is sent, where the key is written, and what a second request could do in between.',
  },
}
