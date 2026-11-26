import {
  PUBLISH_SCOPE_RECHECK_CLAIM_TTL_MS,
  PUBLISH_SCOPE_RECHECK_MAX,
} from "@chatbotx.io/utils/publish-destination"

/** Workspace id -> when this tab last asked for a permission re-check (ms). */
export type RecheckAskedAt = ReadonlyMap<string, number>

export type RecheckAskDecision = {
  /** The ids to ask for; empty when nothing should be asked now. */
  ids: string[]
  /** The record to keep. */
  next: RecheckAskedAt
}

/**
 * Whether the Connect tab asks the server to re-read the destinations'
 * permissions now: only with ids to ask for, and at most once per workspace per
 * 10 minutes per tab (the server's own claim window), at most 100 ids.
 */
export const decideRecheckAsk = (input: {
  askedAt: RecheckAskedAt
  ids: readonly string[]
  nowMs: number
  workspaceId: string
}): RecheckAskDecision => {
  const { askedAt, ids, nowMs, workspaceId } = input
  const last = askedAt.get(workspaceId)
  const isRecent =
    last !== undefined && nowMs - last < PUBLISH_SCOPE_RECHECK_CLAIM_TTL_MS
  if (ids.length === 0 || isRecent) {
    return { ids: [], next: askedAt }
  }
  return {
    ids: ids.slice(0, PUBLISH_SCOPE_RECHECK_MAX),
    next: new Map(askedAt).set(workspaceId, nowMs),
  }
}
