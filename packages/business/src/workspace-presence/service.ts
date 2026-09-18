import { PRESENCE_TTL_MS } from "@chatbotx.io/partysocket-config/presence"
import { presenceStore } from "@chatbotx.io/redis"
import { logger } from "../logger"
import { workspaceMemberService } from "../workspace-member/service"

export { PRESENCE_TTL_MS } from "@chatbotx.io/partysocket-config/presence"

/**
 * Upper bound on how many members `listOnlineMembers` scans from Redis
 * before deduping. There is deliberately no ring-size cap here — that
 * happens after eligibility filtering, downstream (P2's ring tiers) — so a
 * large number of ineligible online members can never push an eligible one
 * out of this scan.
 */
export const PRESENCE_SCAN_LIMIT = 200

const presenceKey = (workspaceId: string): string =>
  `workspace:presence:${workspaceId}`

/**
 * The ONE place every Redis call in this service goes through — owner
 * decision: a Redis outage must never bubble an exception into a caller
 * (an inbound-call job, a page render, the presence-report route). Logs
 * with the structured `err` key and returns `fallback` instead, so a read
 * degrades to "nobody online"/"not online" and a write silently no-ops.
 * Never duplicated per method — see `listOnlineMembers`, `heartbeatMany`.
 */
/** Narrows an `unknown` catch value to a loggable `name`/`message` pair
 * without assuming it is an `Error` (LOW-8: a caller can throw anything). */
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
    // LOW-8: deliberately neutral — this catches EVERY failure from the
    // wrapped Redis call, not only a connectivity outage. A Lua script bug
    // (e.g. `NOSCRIPT`) or a bad argument throws here exactly the same way
    // a dropped connection does; logging every one of them as "Redis
    // unavailable" would misdirect on-call toward an infra outage that
    // isn't happening. `errName`/`errMessage` are pulled out as their own
    // fields (on top of the structured `err` key) so they're greppable/
    // alertable without depending on the logger's `err` serializer config.
    logger.error(
      { err, ...describeThrown(err), ...context },
      "workspace presence: Redis operation failed, degrading",
    )
    return fallback
  }
}

/**
 * Workspace-wide, platform-level presence — a user counts as "online" while
 * the realtime server keeps renewing their heartbeat (§3.2 of the parity
 * plan) on their behalf. Generalizes the old WhatsApp-only
 * `voip-presence-service`: channel-agnostic, over the existing generic
 * `presenceStore` (Redis). Any feature that needs "who has this workspace
 * open right now" (today: P2's VoIP ring targets) reads through
 * `listOnlineMembers`.
 *
 * Redis is the ONLY source of truth for whether a member is online RIGHT
 * NOW — its TTL ({@link PRESENCE_TTL_MS}) already answers that at read time
 * (`listOnlineMembers`), so there is no sweeper and no "mark offline" write
 * anywhere. On an offline -> online transition, this service also stamps
 * `WorkspaceMember.onlineSince = now()` (see
 * `workspaceMemberService.markOnlineBulk`) as a durable, coarse "when did
 * this member last come online" mirror for reporting — reporting an
 * ALREADY-online user never touches the database. That column is
 * monotonic and can never itself answer "is this member online now"; only
 * Redis can.
 *
 * The caller is the realtime server, not the browser: each `apps/realtime`
 * `workspaces` room POSTs the distinct set of currently-connected user ids
 * for that workspace on its own cadence
 * ({@link import("@chatbotx.io/partysocket-config/presence").PRESENCE_REPORT_INTERVAL_MS},
 * never per-browser-tab), which is what makes `heartbeatMany` a BATCH write
 * from the start — see
 * `apps/builder/src/app/api/workspace-presence/report/route.ts` for the
 * inbound side of that report and `docs/realtime.md` for the full flow.
 */
class WorkspacePresenceService {
  /**
   * Renews every id in `userIds` for the next {@link PRESENCE_TTL_MS} in
   * ONE Redis round-trip (`presenceStore.heartbeatMany`), then persists the
   * offline -> online transition for exactly the subset that was NOT
   * already live, in ONE bulk database write — never one UPDATE per user.
   * Best-effort end to end, never throws: a Redis write failure degrades
   * to "nobody newly live" (`withRedisFallback`) and a failed database
   * write is logged and swallowed — presence itself must stay a
   * non-blocking, best-effort signal, not something that can 500 the
   * presence-report route or retry-storm the realtime server. A no-op
   * when `userIds` is empty.
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
   * User ids with at least one live heartbeat in this workspace,
   * most-recently-renewed first, capped at {@link PRESENCE_SCAN_LIMIT}. No
   * ring-size cap — callers apply their own cap after filtering by
   * eligibility.
   *
   * Degrades to `[]` (never throws) on a Redis failure — see
   * `withRedisFallback`. For P2 ring targets this flows straight into the
   * existing "nobody online" path (`selectRingTargetsForCall` already
   * returns `{ tier: null, userIds: [] }` for an empty list), which
   * `handleConnect` already treats as a clean, immediate, fenced-safe
   * Meta-reject (`endReservedCall`) — never a hang or a double-reject.
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
