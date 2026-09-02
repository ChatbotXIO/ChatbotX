const FULL_TURN_DEG = 360

function normalizeDeg(deg: number): number {
  return ((deg % FULL_TURN_DEG) + FULL_TURN_DEG) % FULL_TURN_DEG
}

/**
 * Computes the absolute CSS rotation (degrees, monotonically increasing from
 * `currentRotationDeg` so the wheel always spins forward, never snaps back)
 * needed so `targetSegmentIndex`'s center lands under the fixed top pointer.
 *
 * Segment `i` (of `segmentCount`) is authored with its center at
 * `i * (360 / segmentCount)` degrees clockwise from the top — rotating the
 * disc by `r` moves that center to `i * sweep + r` in world space, so landing
 * it at the pointer (0deg) requires `r ≡ -i * sweep (mod 360)`.
 */
export function computeLuckyWheelTargetRotationDeg(
  currentRotationDeg: number,
  segmentCount: number,
  targetSegmentIndex: number,
  extraFullSpins: number,
  jitterDeg = 0,
): number {
  if (segmentCount <= 0) {
    return currentRotationDeg
  }
  const sweep = FULL_TURN_DEG / segmentCount
  const targetCenterDeg = targetSegmentIndex * sweep
  const desiredFinalMod = normalizeDeg(
    FULL_TURN_DEG - targetCenterDeg + jitterDeg,
  )
  const currentMod = normalizeDeg(currentRotationDeg)
  const forwardDelta = normalizeDeg(desiredFinalMod - currentMod)
  return currentRotationDeg + forwardDelta + extraFullSpins * FULL_TURN_DEG
}

/**
 * A random offset (degrees) so the pointer doesn't land dead-center on every
 * spin, kept within `paddingDeg` of each segment boundary so it never
 * visually crosses into a neighboring wedge.
 */
export function randomLuckyWheelJitterDeg(
  segmentCount: number,
  paddingDeg: number,
): number {
  if (segmentCount <= 0) {
    return 0
  }
  const sweep = FULL_TURN_DEG / segmentCount
  const maxOffset = Math.max(0, sweep / 2 - paddingDeg)
  return (Math.random() * 2 - 1) * maxOffset
}
