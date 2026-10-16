import { sha256 } from "@noble/hashes/sha2.js"
import { utf8ToBytes } from "@noble/hashes/utils.js"

/**
 * Deterministic positive 63-bit id for a score event, derived from its
 * identifying parts. Paired with the source event's own timestamp it forms
 * the `LeaderboardScoreEvent` primary key, so a webhook redelivery or a job
 * retry collides with the first write instead of awarding twice.
 */
export function deterministicLeaderboardEventId(parts: string[]): string {
  // Pure-JS sha256 (not `node:crypto`): this module is reachable from the
  // builder's oRPC router, which instrumentation also loads in the Edge Runtime.
  const digest = sha256(utf8ToBytes(parts.join("\u0000")))
  const firstWord = new DataView(
    digest.buffer,
    digest.byteOffset,
    digest.byteLength,
  ).getBigUint64(0, false)
  const value = BigInt.asUintN(63, firstWord)
  return (value === 0n ? 1n : value).toString()
}
