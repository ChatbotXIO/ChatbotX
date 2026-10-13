import { createHash } from "node:crypto"

/**
 * Deterministic positive 63-bit id for a score event, derived from its
 * identifying parts. Paired with the source event's own timestamp it forms
 * the `LeaderboardScoreEvent` primary key, so a webhook redelivery or a job
 * retry collides with the first write instead of awarding twice.
 */
export function deterministicLeaderboardEventId(parts: string[]): string {
  const digest = createHash("sha256").update(parts.join("\u0000")).digest()
  const value = BigInt.asUintN(63, digest.readBigUInt64BE(0))
  return (value === 0n ? 1n : value).toString()
}
