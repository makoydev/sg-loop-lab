import type { PullRequest } from '../types'
import { at, parseDiff, src } from './locate'

/*
 * PR 3: "Cache nearby-driver lookups".
 * The traffic and memory figures in the Docs tab and the traces are a small
 * teaching model chosen to be easy to follow, not measurements.
 */

const CACHE = src(`
import { db } from '../clients/db'
import { metrics } from '../metrics'

export type Driver = { id: string; lat: number; lng: number; etaSeconds: number }

type Entry = { drivers: Driver[]; expiresAt: number }

const TTL_MS = 5_000
const RADIUS_M = 1_500

const cache = new Map<string, Entry>()

function keyFor(lat: number, lng: number): string {
  return \`\${lat},\${lng}\`
}

async function queryNearby(lat: number, lng: number): Promise<Driver[]> {
  const params = { lat, lng, radiusM: RADIUS_M }
  try {
    return await db.query<Driver>('nearby_drivers', params)
  } catch {
    metrics.increment('nearby.db_error')
    return []
  }
}

export async function nearbyDrivers(lat: number, lng: number): Promise<Driver[]> {
  const key = keyFor(lat, lng)
  const hit = cache.get(key)

  if (hit && hit.expiresAt > Date.now()) {
    metrics.increment('nearby.cache_hit')
    return hit.drivers
  }

  metrics.increment('nearby.cache_miss')
  const drivers = await queryNearby(lat, lng)
  cache.set(key, { drivers, expiresAt: Date.now() + TTL_MS })
  return drivers
}

export function cacheStats(): { entries: number } {
  return { entries: cache.size }
}
`)

const STAMPEDE_FIX = parseDiff(`
- type Entry = { drivers: Driver[]; expiresAt: number }
+ type Entry = { drivers: Promise<Driver[]>; expiresAt: number }

    metrics.increment('nearby.cache_miss')
-   const drivers = await queryNearby(lat, lng)
-   cache.set(key, { drivers, expiresAt: Date.now() + TTL_MS })
-   return drivers
+   const drivers = queryNearby(lat, lng)
+   const jitter = Math.random() * TTL_MS * 0.2
+   cache.set(key, { drivers, expiresAt: Date.now() + TTL_MS + jitter })
+   return drivers
`)

const GROWTH_FIX = parseDiff(`
+ const MAX_ENTRIES = 5_000
+ const CELL = 1_000 // three decimal places, about 100 m
+
  function keyFor(lat: number, lng: number): string {
-   return \`\${lat},\${lng}\`
+   return \`\${Math.round(lat * CELL)},\${Math.round(lng * CELL)}\`
  }

    const hit = cache.get(key)
+   if (hit && hit.expiresAt <= Date.now()) cache.delete(key)

    metrics.increment('nearby.cache_miss')
    const drivers = await queryNearby(lat, lng)
+   if (cache.size >= MAX_ENTRIES) {
+     cache.delete(cache.keys().next().value!)
+   }
    cache.set(key, { drivers, expiresAt: Date.now() + TTL_MS })
`)

const FAILURE_FIX = parseDiff(`
  async function queryNearby(lat: number, lng: number): Promise<Driver[]> {
    const params = { lat, lng, radiusM: RADIUS_M }
-   try {
-     return await db.query<Driver>('nearby_drivers', params)
-   } catch {
-     metrics.increment('nearby.db_error')
-     return []
-   }
+   return db.query<Driver>('nearby_drivers', params)
  }

    metrics.increment('nearby.cache_miss')
-   const drivers = await queryNearby(lat, lng)
-   cache.set(key, { drivers, expiresAt: Date.now() + TTL_MS })
-   return drivers
+   try {
+     const drivers = await queryNearby(lat, lng)
+     cache.set(key, { drivers, expiresAt: Date.now() + TTL_MS })
+     return drivers
+   } catch (err) {
+     metrics.increment('nearby.db_error')
+     cache.delete(key)
+     throw err
+   }
`)

export const cache: PullRequest = {
  id: 'cache',
  ladderId: 'bugbash/cache',
  number: 512,
  title: 'Cache nearby-driver lookups to cut replica load',
  tab: { title: 'The driver cache', sub: 'TypeScript · dispatch · 1 file' },
  tags: ['Code comprehension', '45 min', 'TypeScript'],
  ticket: {
    id: 'DSP-512',
    paragraphs: [
      '`nearbyDrivers` is the hottest query on the read replica, and at peak it is slow enough that riders see the booking screen hang.',
      'A teammate asked the assistant for a cache and it opened this pull request: fifty lines, one file, **every test green**. You are the reviewer. A cache is the easiest thing in the world to get almost right.',
    ],
  },
  teammatePrompt: 'add a cache in front of the nearby drivers query to cut db load. keep it simple',
  description: {
    summary: 'Adds an in-memory cache in front of the nearby-drivers query.',
    bullets: [
      'Results are cached per location for 5 seconds, which removes the vast majority of replica queries.',
      'Entries expire automatically through a TTL, so memory use stays bounded.',
      'Database errors are handled gracefully: the function returns an empty list instead of throwing.',
      'Adds hit, miss and error metrics, plus a stats helper for dashboards.',
    ],
    closing: 'Simple, dependency-free and fully tested. Ready to merge.',
  },
  files: [{ id: 'cache', path: 'src/dispatch/nearbyCache.ts', lang: 'ts', code: CACHE }],
  docs: {
    intro:
      'What the PR calls, and the traffic it will meet in production. The PR description makes three claims about load, memory and errors. Check each against these.',
    entries: [
      {
        title: 'db.query<T>(name, params)',
        lang: 'ts',
        signature: src(`
query<T>(
  name: string,
  params: object,
): Promise<T[]>
`),
        notes: [
          'Runs a named read query on the replica. `nearby_drivers` takes about 40 ms at the median and 310 ms at p99.',
          'Rejects with `DbError` during a connection loss or a failover, which usually lasts well under a second.',
          'The replica runs 200 queries at a time. Anything beyond that waits in a queue.',
        ],
      },
      {
        title: 'Traffic',
        notes: [
          '`nearbyDrivers` is called about 9,000 times a second at peak, spread across 30 dispatch pods.',
          'Rider apps poll once a second while the booking screen is open.',
          'Coordinates arrive straight from GPS, with six or seven decimal places.',
        ],
      },
      {
        title: 'Runtime',
        notes: [
          'Each pod is a single Node.js process with a 1.5 GB heap. Module-level state lives as long as the pod does.',
          'A pod that runs out of heap is killed and restarted, and its in-flight requests are dropped.',
        ],
      },
    ],
  },
  categories: [
    'Cache stampede',
    'Unbounded memory',
    'Failure cached',
    'Wrong TTL unit',
    'Missing authorisation',
    'Off-by-one',
  ],
  flagBudget: 5,
  bugs: [
    {
      id: 'cache-stampede',
      title: 'Every request that misses runs its own copy of the query',
      category: 'Cache stampede',
      severity: 'high',
      fn: 'nearbyDrivers()',
      locations: [
        at('cache', CACHE, "metrics.increment('nearby.cache_miss')", 'return drivers'),
      ],
      summary:
        'Between the miss and the `cache.set` there is an `await`. Every request for the same key that arrives while that query is running also misses, and starts a query of its own.',
      plausible:
        'It is the cache-aside pattern exactly as tutorials write it, and with one request at a time it behaves perfectly.',
      impact:
        'Each time a hot entry expires, dozens of identical queries hit the replica together. The cache lowers the average load and concentrates the rest into synchronized bursts at peak.',
      trace: {
        lanes: [
          { id: 'riders', label: '40 riders', sub: 'same key, same instant' },
          { id: 'cache', label: 'Cache', tone: 'trace' },
          { id: 'db', label: 'DB replica', sub: '200 slots' },
        ],
        initialState: { 'DB queries': 0 },
        broken: [
          {
            from: 'riders',
            to: 'cache',
            label: 'get(key) × 40',
            detail: 'A hot entry expired a millisecond ago. Forty requests for it arrive together.',
          },
          {
            from: 'cache',
            to: 'riders',
            label: 'miss × 40',
            dashed: true,
            tone: 'warn',
            detail: 'All forty see a miss, because nobody has finished the query yet.',
          },
          {
            from: 'riders',
            to: 'db',
            label: 'nearby_drivers × 40',
            tone: 'bad',
            detail: 'Each one awaits its own copy of the same query.',
            state: { 'DB queries': 40 },
          },
          {
            from: 'db',
            label: '40 of 200 slots, one key',
            tone: 'bad',
            detail:
              'One key has just taken a fifth of the replica. A few hot keys expiring together take all of it, and everything else queues.',
          },
          {
            from: 'db',
            to: 'riders',
            label: '40 identical results',
            dashed: true,
            tone: 'bad',
            detail: 'Forty answers that are the same answer.',
          },
          {
            from: 'riders',
            to: 'cache',
            label: 'set(key) × 40',
            tone: 'bad',
            detail: 'Forty writes of the same value. In five seconds the entry expires and it all happens again.',
          },
        ],
        fixed: [
          {
            from: 'riders',
            to: 'cache',
            label: 'get(key) × 40',
            detail: 'The same forty requests at the same instant.',
          },
          {
            from: 'cache',
            label: 'miss: store the promise',
            tone: 'ok',
            detail:
              'The first caller starts the query and stores the promise itself, before awaiting it.',
          },
          {
            from: 'cache',
            to: 'db',
            label: 'nearby_drivers × 1',
            tone: 'ok',
            detail: 'One query reaches the replica.',
            state: { 'DB queries': 1 },
          },
          {
            from: 'cache',
            to: 'riders',
            label: '39 await the same promise',
            dashed: true,
            tone: 'ok',
            detail: 'The other thirty-nine find the in-flight promise in the cache and wait on it.',
          },
          {
            from: 'db',
            to: 'cache',
            label: 'one result',
            dashed: true,
            tone: 'ok',
            detail: 'The single query returns.',
          },
          {
            from: 'cache',
            to: 'riders',
            label: 'all 40 resolve',
            tone: 'ok',
            detail: 'Everyone gets the answer at the same moment, for the price of one query.',
          },
        ],
        brokenOutcome:
          'The cache made the average faster and the worst moment worse: every expiry is a synchronized burst.',
        fixedOutcome:
          'One query per key per expiry, however many riders are waiting. A little jitter on the TTL keeps hot keys from expiring together.',
      },
      fix: {
        path: 'src/dispatch/nearbyCache.ts',
        lang: 'ts',
        ...STAMPEDE_FIX,
        note: 'The promise is stored before it is awaited, so concurrent misses share one query. A rejected promise is cached too, which is the next thing to fix.',
      },
      prompts: [
        {
          kind: 'vague',
          prompt: 'The cache has a thundering herd problem, fix it.',
          outcome: {
            files: 1,
            added: 9,
            removed: 1,
            happened:
              'It adds one boolean `refreshing` flag. While it is set, other callers skip the cache and query the database directly.',
            damage:
              'One flag for every key, so refreshing a single key sends all other traffic straight to the database. Under load it is worse than before.',
            reviewMinutes: 10,
            verdict: 'weak',
            interviewer:
              'You knew the name of the problem. You did not say what must be true afterwards, so the assistant invented a mechanism.',
          },
        },
        {
          kind: 'delegate',
          prompt: 'Rewrite this cache properly using best practices.',
          outcome: {
            files: 3,
            added: 176,
            removed: 38,
            happened:
              'It swaps the Map for a third-party LRU package, adds a background refresh timer per key, and wraps everything in a class.',
            damage:
              'A timer per key that is never cleared is a new leak. The miss path still awaits the query before storing anything, so the stampede is intact inside the new class.',
            reviewMinutes: 35,
            verdict: 'risky',
            interviewer:
              'You asked for "best practices" and received more moving parts around the same bug.',
          },
        },
        {
          kind: 'scoped',
          prompt:
            'In nearbyDrivers(), concurrent misses for the same key must share one database query. Change Entry.drivers to Promise<Driver[]>, and on a miss store the promise returned by queryNearby(lat, lng) in the cache before awaiting it, so later callers get the same promise. Add up to 20% random jitter to expiresAt. No new dependencies, and keep the exported signature. Add a test that calls nearbyDrivers 40 times in the same tick and asserts db.query ran once.',
          outcome: {
            files: 2,
            added: 21,
            removed: 5,
            happened: 'The type change, the promise stored before the await, the jitter and the test.',
            damage:
              'Nothing broken. You spot the consequence it did not mention: a rejected promise is now cached as well, so failures must be evicted. That is the next bug in this file.',
            reviewMinutes: 5,
            verdict: 'strong',
            interviewer:
              'You stated the invariant as a test, forty callers and one query, and you saw what your own fix made worse.',
          },
        },
      ],
    },
    {
      id: 'cache-growth',
      title: 'The key is a raw GPS coordinate, and nothing is ever removed',
      category: 'Unbounded memory',
      severity: 'critical',
      fn: 'keyFor() and the module-level Map',
      locations: [
        at('cache', CACHE, 'function keyFor(lat: number, lng: number): string {', 'return `${lat},${lng}`', 1),
        at('cache', CACHE, 'const cache = new Map<string, Entry>()'),
        at('cache', CACHE, 'if (hit && hit.expiresAt > Date.now()) {'),
      ],
      summary:
        '`keyFor` uses the coordinates exactly as they arrive, six or seven decimals deep, so practically every request has a key of its own. Expiry is only checked when the same key is read again, and no entry is ever deleted.',
      plausible:
        'A Map with an expiry field looks like a complete cache, and the description says memory is bounded by the TTL. The leak needs real GPS input and time. A test with two fixed coordinates shows neither.',
      impact:
        'The hit rate sits near zero, and the Map gains an entry per request until the pod runs out of heap and restarts, dropping whatever it was serving.',
      trace: {
        lanes: [
          { id: 'rider', label: 'Rider apps', sub: '300 calls/s per pod' },
          { id: 'cache', label: 'Cache (Map)', tone: 'trace' },
          { id: 'heap', label: 'Pod heap', sub: '1.5 GB' },
        ],
        initialState: { entries: 0 },
        broken: [
          {
            from: 'rider',
            to: 'cache',
            label: 'key "1.3521431,103.8198274"',
            detail: 'A GPS fix with seven decimal places becomes the key.',
          },
          {
            from: 'cache',
            label: 'miss: insert entry 1',
            detail: 'Nothing under that exact coordinate, so it queries and stores.',
            state: { entries: 1 },
          },
          {
            from: 'rider',
            to: 'cache',
            label: 'key "1.3521433,103.8198271"',
            tone: 'warn',
            detail: 'The same rider one second later, three centimetres away.',
          },
          {
            from: 'cache',
            label: 'miss again: insert entry 2',
            tone: 'warn',
            detail: 'A different string, so a different entry. The cache has not saved a single query.',
            state: { entries: 2, 'hit rate': 'near 0%' },
          },
          {
            from: 'cache',
            label: 'expired entries stay put',
            tone: 'warn',
            detail:
              'Expiry is only checked when the same key is read again. No key is ever read again.',
          },
          {
            from: 'cache',
            to: 'heap',
            label: '300 new entries a second',
            tone: 'bad',
            detail:
              'At roughly 1 KB an entry, the heap fills in a little under an hour and a half at peak.',
            state: { entries: '1.5 million' },
          },
          {
            from: 'heap',
            label: 'out of memory: pod killed',
            tone: 'bad',
            detail: 'The pod restarts, drops its in-flight requests, and starts filling up again.',
          },
        ],
        fixed: [
          {
            from: 'rider',
            to: 'cache',
            label: 'key cell(1.352, 103.820)',
            tone: 'ok',
            detail:
              'Coordinates are rounded to three decimals, a cell about 100 metres across. Everyone standing in it shares a key.',
          },
          {
            from: 'cache',
            label: 'miss: insert',
            detail: 'The first rider in the cell pays for the query.',
            state: { entries: 1 },
          },
          {
            from: 'rider',
            to: 'cache',
            label: 'same cell, 3 cm away: hit',
            tone: 'ok',
            detail: 'The next poll, and every other rider in the cell, reuses it.',
            state: { 'hit rate': 'high' },
          },
          {
            from: 'cache',
            label: 'expired on read: delete',
            tone: 'ok',
            detail: 'An entry found to be expired is removed, not left behind.',
          },
          {
            from: 'cache',
            label: 'at 5,000 entries: evict oldest',
            tone: 'ok',
            detail: 'A hard cap means the Map can never outgrow the heap, whatever the traffic does.',
            state: { entries: 'at most 5,000' },
          },
          {
            from: 'cache',
            to: 'heap',
            label: 'memory stays flat',
            dashed: true,
            tone: 'ok',
            detail: 'A few megabytes, for as long as the pod lives.',
          },
        ],
        brokenOutcome:
          'A cache with a hit rate near zero that also leaks. On the dashboard it looks like pods restarting on a timer.',
        fixedOutcome:
          'Bounded by the number of cells you serve, not by the number of requests you have ever seen.',
      },
      fix: {
        path: 'src/dispatch/nearbyCache.ts',
        lang: 'ts',
        ...GROWTH_FIX,
        note: 'Two separate fixes: a key that nearby riders share, and a Map that deletes on expiry and has a hard ceiling.',
      },
      prompts: [
        {
          kind: 'scoped',
          prompt:
            'Two changes in nearbyCache.ts. First, keyFor must quantise coordinates to a grid: return `${Math.round(lat * 1000)},${Math.round(lng * 1000)}` so nearby riders share an entry. Second, bound the Map: delete an entry when it is read after expiry, and before inserting, if cache.size >= 5000 delete the oldest key (Map iteration order). No new dependencies. Add tests: two coordinates 3 cm apart produce one entry, and inserting 6,000 distinct cells leaves cacheStats().entries at 5,000.',
          outcome: {
            files: 2,
            added: 24,
            removed: 3,
            happened: 'Both changes and both tests.',
            damage:
              'Nothing broken. You flag the trade-off yourself: with a 100 m cell a rider can be shown a list computed for someone 100 m away. That is fine at a 1.5 km radius, and worth saying out loud.',
            reviewMinutes: 5,
            verdict: 'strong',
            interviewer:
              'You fixed the key and the bound separately, sized the cell against the product requirement, and proved the bound.',
          },
        },
        {
          kind: 'vague',
          prompt: 'Memory keeps growing, fix the leak.',
          outcome: {
            files: 1,
            added: 7,
            removed: 0,
            happened: 'It adds a `setInterval` that clears the whole Map every 60 seconds.',
            damage:
              'Memory is now capped by a timer that also empties every entry at once, producing a miss storm once a minute. The key is still a raw coordinate, so the hit rate is still near zero.',
            reviewMinutes: 6,
            verdict: 'weak',
            interviewer: 'The leak was the symptom. The cause is the key, and nobody mentioned the key.',
          },
        },
        {
          kind: 'delegate',
          prompt: 'Make this cache production grade, with eviction and monitoring.',
          outcome: {
            files: 4,
            added: 203,
            removed: 41,
            happened:
              'A generic `TtlCache<K, V>` class with LRU eviction, six metrics, a config file and a README.',
            damage:
              'A well-built cache, keyed by raw GPS coordinates. The eviction now works hard to manage entries that will never be read twice.',
            reviewMinutes: 30,
            verdict: 'risky',
            interviewer:
              'Good machinery, wrong problem. One sentence about key cardinality would have saved two hundred lines.',
          },
        },
      ],
    },
    {
      id: 'cache-failure',
      title: 'A database error is cached as "no drivers nearby"',
      category: 'Failure cached',
      severity: 'high',
      fn: 'queryNearby()',
      locations: [
        at('cache', CACHE, '} catch {', 'return []', 1),
        at('cache', CACHE, 'cache.set(key, { drivers, expiresAt: Date.now() + TTL_MS })'),
      ],
      summary:
        '`queryNearby` catches the database error and returns an empty list. The caller cannot tell that apart from a real empty result, so it caches it for the full five seconds.',
      plausible:
        'Catching the error and returning a safe default reads like defensive programming, and the description lists it as graceful error handling.',
      impact:
        'A failover lasting a few hundred milliseconds becomes five seconds of "no drivers nearby" for every rider polling that key. They close the app, and the only trace is a small error counter.',
      trace: {
        lanes: [
          { id: 'rider', label: 'Rider app', sub: 'polls every second' },
          { id: 'fn', label: 'nearbyDrivers()', tone: 'trace' },
          { id: 'db', label: 'DB replica' },
        ],
        broken: [
          {
            from: 'rider',
            to: 'fn',
            label: 'nearbyDrivers(lat, lng)',
            detail: 'A rider opens the booking screen.',
          },
          {
            from: 'fn',
            to: 'db',
            label: 'nearby_drivers',
            detail: 'Cache miss, so it queries the replica.',
          },
          {
            from: 'db',
            to: 'fn',
            label: 'DbError: failover',
            dashed: true,
            tone: 'bad',
            detail: 'The replica is failing over. It will be back in about 300 ms.',
          },
          {
            from: 'fn',
            label: 'catch: return []',
            tone: 'warn',
            detail:
              'queryNearby() turns the error into an empty list. An outage now looks exactly like an empty street.',
          },
          {
            from: 'fn',
            label: 'cache.set(key, [], 5s)',
            tone: 'bad',
            detail: 'The caller cannot tell the difference, so it caches the empty list like any other result.',
            state: { cached: '[] for 5s' },
          },
          {
            from: 'fn',
            to: 'rider',
            label: '[] → "No drivers nearby"',
            dashed: true,
            tone: 'bad',
            detail: 'The rider is told there is nobody around.',
          },
          {
            from: 'rider',
            to: 'fn',
            label: 'poll again, 1s later',
            detail: 'The app asks again a second later.',
          },
          {
            from: 'fn',
            to: 'rider',
            label: 'cache hit: [] again',
            dashed: true,
            tone: 'bad',
            detail:
              'The database recovered 700 ms ago. The cache keeps serving the failure until the TTL runs out.',
            state: { database: 'healthy again' },
          },
        ],
        fixed: [
          {
            from: 'rider',
            to: 'fn',
            label: 'nearbyDrivers(lat, lng)',
            detail: 'The same request.',
          },
          {
            from: 'fn',
            to: 'db',
            label: 'nearby_drivers',
            detail: 'Cache miss, so it queries the replica.',
          },
          {
            from: 'db',
            to: 'fn',
            label: 'DbError: failover',
            dashed: true,
            tone: 'bad',
            detail: 'The same failover.',
          },
          {
            from: 'fn',
            label: 'error: nothing cached',
            tone: 'ok',
            detail: 'A failure and an empty street are different facts. Only real answers are stored.',
            state: { cached: 'nothing' },
          },
          {
            from: 'fn',
            to: 'rider',
            label: '503 → app shows "retrying"',
            dashed: true,
            tone: 'warn',
            detail: 'The rider sees a short retry state, not a false statement.',
          },
          {
            from: 'rider',
            to: 'fn',
            label: 'poll again, 1s later',
            detail: 'The app asks again a second later.',
          },
          {
            from: 'fn',
            to: 'db',
            label: 'nearby_drivers',
            detail: 'Nothing was cached, so it asks the database, which is healthy again.',
          },
          {
            from: 'db',
            to: 'fn',
            label: '8 drivers',
            dashed: true,
            tone: 'ok',
            detail: 'A real answer, and now it is cached.',
            state: { cached: '8 drivers' },
          },
        ],
        brokenOutcome:
          'A 300 ms blip becomes five seconds of "no drivers nearby". Riders close the app, and the only evidence is a small error counter.',
        fixedOutcome:
          'The blip costs one retry. An empty list is only cached when the database actually said "empty".',
      },
      fix: {
        path: 'src/dispatch/nearbyCache.ts',
        lang: 'ts',
        ...FAILURE_FIX,
        note: 'Errors stay errors until the layer that knows what a rider should see. Whether that is a 503 or the last good list is a product call.',
      },
      prompts: [
        {
          kind: 'delegate',
          prompt: 'Improve the error handling in this file.',
          outcome: {
            files: 2,
            added: 88,
            removed: 9,
            happened:
              'It adds a retry loop with backoff inside queryNearby and a custom `NearbyError`, and still returns `[]` when the retries run out.',
            damage:
              'Three retries against a database that is failing over, multiplied by every caller, and the same cached empty list at the end. The outage lasts longer and the cache still lies.',
            reviewMinutes: 20,
            verdict: 'risky',
            interviewer:
              'More handling is not better handling. What the caller should see was never decided.',
          },
        },
        {
          kind: 'vague',
          prompt: 'Riders sometimes see no drivers when there are drivers, fix it.',
          outcome: {
            files: 1,
            added: 2,
            removed: 1,
            happened: 'It lowers `TTL_MS` from 5,000 to 1,000.',
            damage:
              'The wrong answer is now cached for one second instead of five, and the database takes five times the load. The failure is still stored as a result.',
            reviewMinutes: 5,
            verdict: 'weak',
            interviewer:
              'It shrank the symptom and paid for it in load, because the report described what a rider saw, not what the code did.',
          },
        },
        {
          kind: 'scoped',
          prompt:
            'queryNearby() must not turn a database error into an empty list. Remove its try/catch so the error propagates. In nearbyDrivers(), if the query rejects, increment nearby.db_error, delete that key from the cache so the failure is never served again, and rethrow. An empty array from a successful query is still cached. Add a test where db.query rejects once and then returns 8 drivers: the second call must reach the database and return 8.',
          outcome: {
            files: 2,
            added: 16,
            removed: 7,
            happened: 'The catch removed, eviction on rejection, and the test.',
            damage:
              'Nothing broken. You raise the product question: on an error the route could serve the last good list for a few seconds instead of a 503. That is a decision for the team, not the assistant.',
            reviewMinutes: 4,
            verdict: 'strong',
            interviewer:
              'You separated "failed" from "empty", which is the whole bug, and left the product call visibly open.',
          },
        },
      ],
    },
  ],
  decoys: [
    {
      ...at('cache', CACHE, 'export type Driver = '),
      why: 'The driver shape is fine. Nothing about the type causes trouble here.',
    },
    {
      ...at('cache', CACHE, 'const TTL_MS = 5_000', 'const RADIUS_M = 1_500'),
      why: 'Five seconds, in milliseconds, compared against Date.now(), also in milliseconds. The units agree, and the radius is a product decision.',
    },
    {
      ...at('cache', CACHE, "metrics.increment('nearby.cache_hit')", 'return hit.drivers'),
      why: 'Handing out the cached array is only a problem if a caller mutates it. Worth a comment in review, not a flag.',
    },
    {
      ...at('cache', CACHE, 'const key = keyFor(lat, lng)', 'const hit = cache.get(key)'),
      why: 'Looking the key up is fine. Look at what the key is made of, and at what happens after a miss.',
    },
    {
      ...at('cache', CACHE, 'export function cacheStats(): { entries: number } {', 'return { entries: cache.size }', 1),
      why: 'Exposing the entry count is useful. It is how you would notice the real problem in production.',
    },
    {
      ...at('cache', CACHE, 'const params = { lat, lng, radiusM: RADIUS_M }', "return await db.query<Driver>('nearby_drivers', params)"),
      why: 'The query call itself is right. What happens to its failures, two lines down, is not.',
    },
  ],
  takeaway: {
    headline:
      'A cache is a second source of truth that fails differently from the first. Review it at the moments the two disagree: on a miss, on an error, and at its size limit.',
    points: [
      {
        title: 'Ask what happens between the miss and the set',
        body: 'Any `await` between reading the cache and filling it is a window in which every other caller also misses. Storing the in-flight promise closes it: one query, many waiters.',
      },
      {
        title: 'Count the keys before you count the hits',
        body: 'Key cardinality decides both the hit rate and the memory. If the key contains something nearly unique, a raw coordinate, a timestamp, a full query string, you have built a slow leak with a hit rate of zero.',
      },
      {
        title: 'Failed is not the same as empty',
        body: 'A default returned from a catch block becomes data the moment someone caches it. Let errors stay errors until they reach the layer that knows what the user should see.',
      },
      {
        title: 'Bound everything that lives at module level',
        body: 'Module-level state lives as long as the process. Give it a maximum size and a deletion path on day one, and expose its size as a metric so the leak shows up before the restart does.',
      },
    ],
    facts: [
      { label: 'Bugs in this PR', value: '3' },
      { label: 'Queries per expiry, before', value: '1 per waiter' },
      { label: 'After single-flight', value: '1' },
      { label: 'Heap exhausted at peak', value: '≈ 80 min' },
    ],
    traps: [
      'Checking only the happy path of a cache: hit, miss, done.',
      'Reading `return []` in a catch block as safe.',
      'Fixing the leak with a timer and leaving the key alone.',
    ],
    sayIt:
      'For any cache I ask three things: what happens when many callers miss at once, how many distinct keys can exist, and what gets stored when the source fails.',
  },
}
