import { CONTACT_SYNC_COOLDOWN_MS } from "./constants"

export type ContactSyncBlockedReason = "running" | "cooldown"

export type ContactSyncAvailability = {
  canSync: boolean
  blockedReason: ContactSyncBlockedReason | null
  /** When a new sync may start; `null` while a run is live or when allowed now. */
  nextSyncAt: Date | null
  activeRunId: string | null
}

/**
 * Whether a workspace may start a sync now. Pure: the caller reads the live
 * run and the latest run that reached its source (under the workspace lock
 * when the answer decides an insert).
 */
export const resolveContactSyncAvailability = (input: {
  liveRunId: string | null
  latestFetchedRunCreatedAt: Date | null
  now: Date
}): ContactSyncAvailability => {
  if (input.liveRunId) {
    return {
      canSync: false,
      blockedReason: "running",
      nextSyncAt: null,
      activeRunId: input.liveRunId,
    }
  }
  const nextSyncAt = input.latestFetchedRunCreatedAt
    ? new Date(
        input.latestFetchedRunCreatedAt.getTime() + CONTACT_SYNC_COOLDOWN_MS,
      )
    : null
  if (nextSyncAt && nextSyncAt.getTime() > input.now.getTime()) {
    return {
      canSync: false,
      blockedReason: "cooldown",
      nextSyncAt,
      activeRunId: null,
    }
  }
  return {
    canSync: true,
    blockedReason: null,
    nextSyncAt: null,
    activeRunId: null,
  }
}
