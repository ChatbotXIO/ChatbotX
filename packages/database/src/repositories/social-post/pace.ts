import type { PublishPauseReason } from "@chatbotx.io/utils/publish-limits"
import type { SocialContentType } from "@chatbotx.io/utils/social-account"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  sql,
} from "../../client"
import { publishDestinationModel, socialPostTargetModel } from "../../schema"

/** What the pace gate reads about a destination before a publish attempt. */
export type PublishDestinationPace = {
  lastPublishStartedAt: Date | null
  pausedUntil: Date | null
  pauseReason: PublishPauseReason | null
}

const toDate = (value: Date | string | null): Date | null =>
  value === null ? null : new Date(value)

/**
 * The publishing pace of a destination (docs/posts.md, "Publishing pace and
 * platform limits"): spacing between two publishes, the circuit breaker and the
 * counts of our own published posts. Every write is one conditional UPDATE, so
 * several workers racing on one destination never double-book a slot.
 */
export const socialPostPaceRepository = {
  async findPace(
    input: { destinationId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<PublishDestinationPace | null> {
    const [row] = await tx
      .select({
        lastPublishStartedAt: publishDestinationModel.lastPublishStartedAt,
        pausedUntil: publishDestinationModel.pausedUntil,
        pauseReason: publishDestinationModel.pauseReason,
      })
      .from(publishDestinationModel)
      .where(
        and(
          eq(publishDestinationModel.id, input.destinationId),
          eq(publishDestinationModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row
      ? {
          lastPublishStartedAt: toDate(row.lastPublishStartedAt),
          pausedUntil: toDate(row.pausedUntil),
          pauseReason: row.pauseReason,
        }
      : null
  },

  /**
   * Books the destination's next publish start: the one conditional UPDATE that
   * decides, atomically, whether the minimum gap since the last start has
   * passed. `false` (zero rows) means another publish started inside the gap;
   * the caller defers. Row-locked by the UPDATE, so two workers cannot both win.
   */
  async reservePublishSlot(
    input: {
      destinationId: string
      gapMs: number
      now: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const earliest = new Date(input.now.getTime() - input.gapMs)
    const rows = await tx
      .update(publishDestinationModel)
      .set({ lastPublishStartedAt: input.now })
      .where(
        and(
          eq(publishDestinationModel.id, input.destinationId),
          eq(publishDestinationModel.workspaceId, input.workspaceId),
          sql`(${publishDestinationModel.lastPublishStartedAt} IS NULL OR ${publishDestinationModel.lastPublishStartedAt} <= ${earliest})`,
        ),
      )
      .returning({ id: publishDestinationModel.id })
    return rows.length > 0
  },

  /**
   * Publish times (oldest first) of this destination's published targets in the
   * window, for the rolling-24h count. `contentTypes` narrows it (Facebook
   * Reels are counted apart from feed posts); removed posts still count.
   */
  async listPublishedSince(
    input: {
      contentTypes: readonly SocialContentType[] | null
      destinationId: string
      since: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<Date[]> {
    const rows = await tx
      .select({ publishedAt: socialPostTargetModel.publishedAt })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.publishDestinationId, input.destinationId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          gt(socialPostTargetModel.publishedAt, input.since),
          input.contentTypes
            ? inArray(socialPostTargetModel.contentType, [
                ...input.contentTypes,
              ])
            : undefined,
        ),
      )
      .orderBy(socialPostTargetModel.publishedAt)
    return rows.flatMap((row) => (row.publishedAt ? [row.publishedAt] : []))
  },

  /**
   * Counts one account-level limit answer and, at the threshold, pauses the
   * destination, in one statement. Returns the pause (`null` when not paused).
   */
  async recordLimitError(
    input: {
      destinationId: string
      now: Date
      pauseMs: number
      reason: PublishPauseReason
      threshold: number
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<{ pausedUntil: Date; reason: PublishPauseReason } | null> {
    const pauseUntil = new Date(input.now.getTime() + input.pauseMs)
    const [row] = await tx
      .update(publishDestinationModel)
      .set({
        // The streak restarts when it pauses: the first answer after the pause ends must not pause again at once.
        consecutiveLimitErrors: sql`CASE WHEN ${publishDestinationModel.consecutiveLimitErrors} + 1 >= ${input.threshold} THEN 0 ELSE ${publishDestinationModel.consecutiveLimitErrors} + 1 END`,
        pausedUntil: sql`CASE WHEN ${publishDestinationModel.consecutiveLimitErrors} + 1 >= ${input.threshold} THEN ${pauseUntil}::timestamptz ELSE ${publishDestinationModel.pausedUntil} END`,
        pauseReason: sql`CASE WHEN ${publishDestinationModel.consecutiveLimitErrors} + 1 >= ${input.threshold} THEN ${input.reason} ELSE ${publishDestinationModel.pauseReason} END`,
      })
      .where(
        and(
          eq(publishDestinationModel.id, input.destinationId),
          eq(publishDestinationModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({
        consecutiveLimitErrors: publishDestinationModel.consecutiveLimitErrors,
        pausedUntil: publishDestinationModel.pausedUntil,
        pauseReason: publishDestinationModel.pauseReason,
      })
    // The streak is 1.. below the threshold and restarts at 0 exactly when this call applied the pause.
    if (
      !(
        row &&
        row.consecutiveLimitErrors === 0 &&
        row.pausedUntil &&
        row.pauseReason
      )
    ) {
      return null
    }
    return { pausedUntil: new Date(row.pausedUntil), reason: row.pauseReason }
  },

  /**
   * An answer that is not an account-level limit ends the streak (it is only
   * "consecutive" limit answers that pause). An active pause is left alone.
   */
  async resetLimitStreak(
    input: { destinationId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(publishDestinationModel)
      .set({ consecutiveLimitErrors: 0 })
      .where(
        and(
          eq(publishDestinationModel.id, input.destinationId),
          eq(publishDestinationModel.workspaceId, input.workspaceId),
          sql`${publishDestinationModel.consecutiveLimitErrors} > 0`,
        ),
      )
  },

  /** A successful publish ends the streak and any pause. No-op when there is none. */
  async resetLimitErrors(
    input: { destinationId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(publishDestinationModel)
      .set({
        consecutiveLimitErrors: 0,
        pausedUntil: null,
        pauseReason: null,
      })
      .where(
        and(
          eq(publishDestinationModel.id, input.destinationId),
          eq(publishDestinationModel.workspaceId, input.workspaceId),
          sql`(${publishDestinationModel.consecutiveLimitErrors} > 0 OR ${publishDestinationModel.pausedUntil} IS NOT NULL)`,
        ),
      )
  },
}
