/**
 * Finite-checked arithmetic for sparse float ordering keys.
 * Lower value sorts first. Locking, SQL and anchors live with the caller.
 */

/** Gap left at an open end of a list, and between respaced neighbours at an open bound. */
export const SPARSE_POSITION_STEP = 1024

function assertFiniteOrNull(name: string, value: number | null): void {
  if (value !== null && !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number or null`)
  }
}

function isStrictlyBetween(
  value: number,
  lower: number | null,
  upper: number | null,
): boolean {
  if (!Number.isFinite(value)) {
    return false
  }
  if (lower !== null && value <= lower) {
    return false
  }
  if (upper !== null && value >= upper) {
    return false
  }
  return true
}

/**
 * A position strictly between `before` (the neighbour above, smaller) and
 * `after` (the neighbour below, larger). `null` marks an open end. Returns
 * `null` when no representable value fits (equal or inverted neighbours,
 * exhausted float precision, overflow). Throws on non-finite input.
 */
export function positionBetween(
  before: number | null,
  after: number | null,
): number | null {
  assertFiniteOrNull("before", before)
  assertFiniteOrNull("after", after)

  let candidate: number
  if (before === null && after === null) {
    candidate = 0
  } else if (before === null) {
    candidate = (after as number) - SPARSE_POSITION_STEP
  } else if (after === null) {
    candidate = before + SPARSE_POSITION_STEP
  } else {
    // Halve first: (before + after) / 2 and after - before both overflow near MAX_VALUE.
    candidate = before / 2 + after / 2
  }

  return isStrictlyBetween(candidate, before, after) ? candidate : null
}

/**
 * `count` evenly spaced, strictly increasing values strictly inside
 * (`lower`, `upper`); `null` bounds are open ends spaced by
 * `SPARSE_POSITION_STEP`. Returns `null` when they do not fit. Throws on
 * non-finite bounds or a count that is not a non-negative integer.
 */
export function spreadPositions(
  lower: number | null,
  upper: number | null,
  count: number,
): number[] | null {
  assertFiniteOrNull("lower", lower)
  assertFiniteOrNull("upper", upper)
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("count must be a non-negative integer")
  }
  if (count === 0) {
    return []
  }

  let start: number
  let gap: number
  if (lower !== null && upper !== null) {
    gap = (upper - lower) / (count + 1)
    start = lower + gap
  } else if (lower !== null) {
    gap = SPARSE_POSITION_STEP
    start = lower + gap
  } else if (upper === null) {
    gap = SPARSE_POSITION_STEP
    start = 0
  } else {
    gap = SPARSE_POSITION_STEP
    start = upper - gap * count
  }

  const values: number[] = []
  let previous = lower
  for (let index = 0; index < count; index += 1) {
    const value = start + gap * index
    if (!isStrictlyBetween(value, previous, upper)) {
      return null
    }
    values.push(value)
    previous = value
  }
  return values
}
