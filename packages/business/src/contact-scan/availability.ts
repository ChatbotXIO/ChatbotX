import type { CoexistRunStatus } from "@chatbotx.io/database/repositories"
import type { CoexistSyncRunModel } from "@chatbotx.io/database/types"
import { CONTACT_SCAN_COOLDOWN_MS, CONTACT_SCAN_ETA_MS } from "./constants"

export type ContactScanBlockedReason = "cooldown" | "running"

export type ContactScanAvailability =
  | { canScan: true }
  | {
      canScan: false
      blockedReason: ContactScanBlockedReason
      nextScanAt: Date
    }

/** No scan has ever been requested for this inbox — nothing to wait on. */
export const OPEN_CONTACT_SCAN_AVAILABILITY: ContactScanAvailability = {
  canScan: true,
}

type LatestRunForAvailability = Pick<
  CoexistSyncRunModel,
  "status" | "createdAt"
>

type Rule = (input: {
  createdAt: Date
  etaAt: Date
  now: Date
}) => ContactScanAvailability

const laterOf = (a: Date, b: Date): Date => (a.getTime() > b.getTime() ? a : b)

const cooldownEndsAt = (createdAt: Date): Date =>
  new Date(createdAt.getTime() + CONTACT_SCAN_COOLDOWN_MS)

/**
 * `succeeded` / `partial` / `failed` — the scan has settled. Blocked only
 * while the 24h cooldown (measured from `createdAt`) has not yet elapsed;
 * `nextScanAt` is whichever is later of the cooldown boundary or the ETA, so
 * a very fast settle still shows the operator the promised ETA.
 */
const settledRule: Rule = ({ createdAt, etaAt, now }) => {
  const canScan =
    now.getTime() - createdAt.getTime() >= CONTACT_SCAN_COOLDOWN_MS
  if (canScan) {
    return { canScan: true }
  }
  return {
    canScan: false,
    blockedReason: "cooldown",
    nextScanAt: laterOf(cooldownEndsAt(createdAt), etaAt),
  }
}

/**
 * `init` / `running` (and, defensively, `waiting` — a scan never sets it) —
 * the scan is still active. Always blocked: the UI must never offer a submit
 * the active-scan partial unique index would reject. A stuck run is released
 * by the sweeper, never by the UI re-evaluating this rule.
 */
const activeRule: Rule = ({ createdAt, etaAt }) => ({
  canScan: false,
  blockedReason: "running",
  nextScanAt: laterOf(cooldownEndsAt(createdAt), etaAt),
})

/**
 * One rule per stored `CoexistRunStatus` — `satisfies Record<...>` makes a
 * status added to the shared enum a compile error here instead of a silent
 * fallthrough.
 */
const rulesByStatus = {
  init: activeRule,
  running: activeRule,
  waiting: activeRule,
  succeeded: settledRule,
  partial: settledRule,
  failed: settledRule,
} satisfies Record<CoexistRunStatus, Rule>

/**
 * Pure: whether a new scan can be submitted for an inbox, given its latest
 * scan run (or `null` when none has ever been requested).
 */
export const resolveContactScanAvailability = (input: {
  latest: LatestRunForAvailability | null
  now: Date
}): ContactScanAvailability => {
  const { latest, now } = input
  if (!latest) {
    return OPEN_CONTACT_SCAN_AVAILABILITY
  }

  const etaAt = new Date(latest.createdAt.getTime() + CONTACT_SCAN_ETA_MS)
  const rule = rulesByStatus[latest.status]
  return rule({ createdAt: latest.createdAt, etaAt, now })
}
