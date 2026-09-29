import { PRESENCE_TTL_MS } from "@chatbotx.io/partysocket-config/presence"
import { presenceStore } from "@chatbotx.io/redis"
import { logger } from "../logger"
import { workspaceMemberService } from "../workspace-member/service"

export { PRESENCE_TTL_MS } from "@chatbotx.io/partysocket-config/presence"

/**
 * Upper bound on how many members listOnlineMembers scans from Redis before
 * deduping. No ring-size cap here — that happens downstream after eligibility
 * filtering — so a large number of ineligible online members can never push an
 * eligible one out of this scan.
 */
export const PRESENCE_SCAN_LIMIT = 200

const presenceKey = (workspaceId: string): string =>
  `workspace:presence:${workspaceId}`

/** Every Redis call in this service routes through here — an outage degrades to fallback (nobody-online / no-op) instead of bubbling to the caller. */
/** Narrows an unknown catch value to a loggable name/message pair. */
function describeThrown(err: unknown): {
  errName?: string
  errMessage?: string
} {
  if (err instanceof Error) {
    return { errName: err.name, errMessage: err.message }
  }
  return {}
}

async function withRedisFallback<T>(
  fallback: T,
  context: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    // Deliberately neutral: this catches every failure from the wrapped Redis
    // call, not only a connectivity outage. A Lua script bug or bad argument
    // throws the same way a dropped connection does, so labeling every one as
    // "Redis unavailable" would misdirect on-call. errName/errMessage are
    // pulled out as their own fields so they're greppable independent of the
    // logger's err serializer.
    logger.error(
      { err, ...describeThrown(err), ...context },
      "workspace presence: Redis operation failed, degrading",
    )
    return fallback
  }
}

/**
 * Redis TTL is the sole source of truth for online-ness — no sweeper or "mark offline" write.
 * An offline->online transition also stamps WorkspaceMember.onlineSince as a coarse durable mirror (not itself an "online now" signal).
 * Caller is the realtime server, not the browser — each room POSTs its whole connected set per cadence, hence heartbeatMany's batch write.
 */
class WorkspacePresenceService {
  /**
   * Renews all userIds in one Redis round-trip, then bulk-persists the offline->online
   * transition for the newly-live subset. Best-effort: failures degrade to no-op rather
   * than throw, since presence must stay a non-blocking signal.
   */
  async heartbeatMany(input: {
    workspaceId: string
    userIds: string[]
  }): Promise<void> {
    if (input.userIds.length === 0) {
      return
    }

    const { newlyLiveMembers } = await withRedisFallback(
      { newlyLiveMembers: [] as string[] },
      { workspaceId: input.workspaceId, userIds: input.userIds },
      () =>
        presenceStore.heartbeatMany(
          presenceKey(input.workspaceId),
          input.userIds,
          PRESENCE_TTL_MS,
        ),
    )

    if (newlyLiveMembers.length === 0) {
      return
    }

    try {
      await workspaceMemberService.markOnlineBulk({
        workspaceId: input.workspaceId,
        userIds: newlyLiveMembers,
      })
    } catch (err) {
      logger.error(
        { err, workspaceId: input.workspaceId, userIds: newlyLiveMembers },
        "workspace presence: failed to persist offline -> online transition",
      )
    }
  }

  /**
   * User ids with a live heartbeat, most-recently-renewed first, capped at PRESENCE_SCAN_LIMIT
   * (callers apply their own ring-size cap after eligibility filtering). Degrades to [] on Redis
   * failure, feeding ring targets into the existing "nobody online" Meta-reject path.
   */
  async listOnlineMembers(workspaceId: string): Promise<string[]> {
    return await withRedisFallback(
      [] as string[],
      { workspaceId },
      async () =>
        await presenceStore.liveMembers(
          presenceKey(workspaceId),
          PRESENCE_SCAN_LIMIT,
        ),
    )
  }
}

export const workspacePresenceService = new WorkspacePresenceService()
