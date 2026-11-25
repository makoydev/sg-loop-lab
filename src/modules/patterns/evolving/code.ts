/*
 * The Python shown in the lab: the three Part 1 shapes, the data-driven
 * solution as it grows through the four parts, and what the other shapes turn
 * into. All money is integer minor units (cents) once the units are known.
 */

export type Shape = 'branches' | 'table' | 'classes'
export type PartNumber = 1 | 2 | 3 | 4

/* ── Part 1: three shapes for the same flat fee ───────────────────────── */

/**
 * The three ways to write Part 1. Until the candidate asks about units, the
 * natural assumption is dollars as floats, which is what `cents: false` shows.
 */
export function shapeSnippet(shape: Shape, cents: boolean): string {
  const [sgd, usd, myr] = cents ? ['50', '100', '150'] : ['0.50', '1.00', '1.50']
  // Once the units are known, the first line of the file says so.
  const head = cents ? '# amounts and fees are integer cents\n' : ''
  if (shape === 'branches') {
    return `${head}def payout_fee(currency, amount):
    if currency == "SGD":
        return ${sgd}
    elif currency == "USD":
        return ${usd}
    elif currency == "MYR":
        return ${myr}
    raise ValueError(currency)`
  }
  if (shape === 'table') {
    return `${head}FEES = {
    "SGD": ${sgd},
    "USD": ${usd},
    "MYR": ${myr},
}

def payout_fee(currency, amount):
    return FEES[currency]`
  }
  return `${head}class FeeStrategy(ABC):
    @abstractmethod
    def fee(self, amount): ...

class FlatFee(FeeStrategy):
    def __init__(self, fee):
        self._fee = fee

    def fee(self, amount):
        return self._fee

class FeeRegistry:
    def __init__(self):
        self._strategies = {}

    def register(self, currency, strategy):
        self._strategies[currency] = strategy

    def resolve(self, currency):
        return self._strategies[currency]

registry = FeeRegistry()
registry.register("SGD", FlatFee(${sgd}))
registry.register("USD", FlatFee(${usd}))
registry.register("MYR", FlatFee(${myr}))

def payout_fee(currency, amount):
    return registry.resolve(currency).fee(amount)`
}

/* ── the data-driven solution, part by part ───────────────────────────── */

const FEES_TIERED = `FEES = {
    "SGD": [(100_000, 50, 0, 50), (None, 0, 80, 2_000)],
    "USD": [(100_000, 100, 0, 100), (None, 0, 80, 2_500)],
    "MYR": [(300_000, 150, 0, 150), (None, 0, 80, 6_000)],
}`

const BAND_HELPERS = `def round_half_up(n, d):
    return (n + d // 2) // d

def band_fee(bands, amount):
    for up_to, flat, bps, cap in bands:
        if up_to is None or amount <= up_to:
            pct = round_half_up(amount * bps, 10_000)
            return min(cap, flat + pct)`

const OVERRIDES = `OVERRIDES = {
    ("m_kopi_co", "SGD"): [(None, 0, 50, 1_500)],
}
FREE_PER_MONTH = 3`

/** `fees.py` after each part, for the table shape with a pure fee function. */
export const SOLUTION: Record<PartNumber, string> = {
  // Part 1 is exactly the table snippet the candidate chose, units known.
  1: shapeSnippet('table', true),

  2: `# amounts and fees are integer cents
# band: (up_to, flat, bps, cap)
${FEES_TIERED}

${BAND_HELPERS}

def payout_fee(currency, amount):
    return band_fee(FEES[currency], amount)`,

  3: `# amounts and fees are integer cents
# band: (up_to, flat, bps, cap)
${FEES_TIERED}
${OVERRIDES}

${BAND_HELPERS}

def payout_fee(currency, amount, merchant, used):
    if used < FREE_PER_MONTH:
        return 0
    bands = OVERRIDES.get((merchant, currency))
    return band_fee(bands or FEES[currency], amount)`,

  4: `from collections import Counter
from datetime import date

# amounts and fees are integer cents
# band: (up_to, flat, bps, cap)
${FEES_TIERED}
FEES_NOV15 = {**FEES, "SGD": [(None, 0, 60, 1_800)]}
${OVERRIDES}

# newest first: (effective_from, fees, overrides)
SCHEDULES = [
    (date(2026, 11, 15), FEES_NOV15, OVERRIDES),
    (date(2026, 1, 1), FEES, OVERRIDES),
]

${BAND_HELPERS}

def schedule_on(day):
    return next(s for s in SCHEDULES if s[0] <= day)

def payout_fee(currency, amount, merchant, used, day):
    if used < FREE_PER_MONTH:
        return 0
    _, fees, overrides = schedule_on(day)
    bands = overrides.get((merchant, currency))
    return band_fee(bands or fees[currency], amount)

def statement(payouts):  # sorted by day
    total, used = 0, Counter()
    for p in payouts:
        key = (p.merchant, p.day.year, p.day.month)
        total += payout_fee(p.currency, p.amount,
                            p.merchant, used[key], p.day)
        used[key] += 1
    return total`,
}

/** Part 3 on the table shape when the free-payout count is hidden in a global. */
export const SOLUTION_HIDDEN_COUNTER = `# amounts and fees are integer cents
# band: (up_to, flat, bps, cap)
${FEES_TIERED}
${OVERRIDES}
USED = Counter()  # merchant -> free payouts used

${BAND_HELPERS}

def payout_fee(currency, amount, merchant):
    if USED[merchant] < FREE_PER_MONTH:
        USED[merchant] += 1
        return 0
    bands = OVERRIDES.get((merchant, currency))
    return band_fee(bands or FEES[currency], amount)`

/* ── Part 3 decision: where the free-payout count lives ───────────────── */

export const QUOTA_SNIPPET = {
  counter: `USED = Counter()  # merchant -> free payouts used

def payout_fee(currency, amount, merchant):
    if USED[merchant] < FREE_PER_MONTH:
        USED[merchant] += 1
        return 0
    ...`,
  argument: `# the caller counts; this function only computes
def payout_fee(currency, amount, merchant, used):
    if used < FREE_PER_MONTH:
        return 0
    ...`,
}

/* ── what the other shapes turn into ──────────────────────────────────── */

/** Excerpts of the code after each twist, for the shapes that fight the change. */
export const EXCERPT: Record<'branches' | 'classes', Record<2 | 3 | 4, string>> = {
  branches: {
    2: `def payout_fee(currency, amount):
    if currency == "SGD":
        if amount <= 100_000:
            return 50
        else:
            pct = round_half_up(amount * 80, 10_000)
            return min(2_000, pct)
    elif currency == "USD":
        if amount <= 100_000:
            return 100
        else:
            pct = round_half_up(amount * 80, 10_000)
            return min(2_500, pct)
    elif currency == "MYR":
        if amount <= 300_000:
            return 150
        else:
            ...  # the same again, third time`,
    3: `def payout_fee(currency, amount, merchant, used):
    if used < 3:
        return 0
    if merchant == "m_kopi_co":
        if currency == "SGD":
            pct = round_half_up(amount * 50, 10_000)
            return min(1_500, pct)
        elif currency == "USD":
            if amount <= 100_000:
                return 100
            else:
                ...  # copy of the default USD tiers
        elif currency == "MYR":
            ...      # copy of the default MYR tiers
    else:
        if currency == "SGD":
            if amount <= 100_000:
                return 50
            else:
                ...  # and the defaults, all over again`,
    4: `def payout_fee(currency, amount, merchant, used, day):
    if used < 3:
        return 0
    if day >= date(2026, 11, 15):
        if merchant == "m_kopi_co":
            if currency == "SGD":
                ...  # new numbers
            elif currency == "USD":
                ...
        else:
            if currency == "SGD":
                ...  # new numbers, again
    else:
        if merchant == "m_kopi_co":
            if currency == "SGD":
                ...  # every old branch, kept
        else:
            ...      # for the old dates`,
  },
  classes: {
    2: `class TieredFee(FeeStrategy):
    def __init__(self, bands):
        self._bands = bands

    def fee(self, amount):
        for up_to, flat, bps, cap in self._bands:
            if up_to is None or amount <= up_to:
                pct = round_half_up(amount * bps, 10_000)
                return min(cap, flat + pct)

registry = FeeRegistry()
registry.register("SGD", TieredFee([...]))
registry.register("USD", TieredFee([...]))
registry.register("MYR", TieredFee([...]))
# FlatFee is now dead code`,
    3: `class MerchantOverride(FeeStrategy):
    def __init__(self, inner, overrides, merchant):
        ...

class FreeQuota(FeeStrategy):
    def __init__(self, inner, used):
        ...

class MerchantRegistry(FeeRegistry):
    def resolve(self, currency, merchant, used):
        base = super().resolve(currency)
        base = MerchantOverride(base, ..., merchant)
        return FreeQuota(base, used)

# fee(amount) has no room for merchant or used,
# so every class and every caller changes`,
    4: `class DatedRegistry:
    def __init__(self):
        self._registries = []  # (effective_from, registry)

    def register(self, effective_from, registry):
        ...

    def resolve(self, currency, merchant, used, day):
        registry = self._on(day)
        return registry.resolve(currency, merchant, used)

# plus a second copy of every registration
# for the schedule that starts on the 15th`,
  },
}
