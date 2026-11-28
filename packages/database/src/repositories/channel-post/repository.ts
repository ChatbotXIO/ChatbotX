import {
  CHANNEL_POST_LIVE_STALE_AFTER_MS,
  type ChannelPostContentType,
  type ChannelPostLiveObservationSource,
  type ChannelPostLiveStatus,
} from "@chatbotx.io/utils/channel-post"
import { CHANNEL_POST_COMMENTS_REPORTED_BITS } from "@chatbotx.io/utils/post-metrics"
import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "../../client"
import {
  channelPostModel,
  inboxModel,
  socialPostTargetModel,
} from "../../schema"
import { likeContains } from "../../utils"

export type ChannelPostMetadata = {
  caption: string | null
  mediaType: string | null
  permalink: string | null
  publishedAt: Date | null
  thumbnail: string | null
}

/** What a publish already knows about the post it just made. */
export type PublishedChannelPostKnown = {
  caption: string | null
  contentType: ChannelPostContentType | null
  permalink: string | null
  publishedAt: Date | null
  thumbnail: string | null
}

export type ChannelPostFilterCursor = {
  id: string
  // PostgreSQL timestamps carry microseconds while JavaScript Dates carry
  // milliseconds. Keep node-postgres's raw value through the cursor so a
  // keyset boundary never rounds and skips posts created in the same ms.
  sortAt: string
}

/** One reading of a broadcast's state, to be recorded on its post. */
export type ChannelPostLiveObservation = {
  caption?: string | null
  channel: string
  externalPostId: string
  inboxId: string
  integrationId: string
  observedAt: Date
  permalink?: string | null
  publishedAt?: Date | null
  source: ChannelPostLiveObservationSource
  sourceAccountId: string
  status: Extract<ChannelPostLiveStatus, "live" | "ended">
  workspaceId: string
}

/** When a live broadcast is read again; none once it is over. */
const liveRecheckAtFor = (
  status: ChannelPostLiveObservation["status"],
  observedAt: Date,
): Date | null =>
  status === "live"
    ? new Date(observedAt.getTime() + CHANNEL_POST_LIVE_STALE_AFTER_MS)
    : null

/**
 * When a stored row may take an observation. Only a strictly newer one wins,
 * and a `comment` is weak evidence: it may start a live status (the row has
 * none) or end one, but never reopen an ended broadcast or refresh a live one.
 */
const liveObservationGuard = (
  input: Pick<ChannelPostLiveObservation, "source" | "status">,
) => {
  const newer = sql`(${channelPostModel.liveStatusObservedAt} IS NULL OR ${channelPostModel.liveStatusObservedAt} < excluded."liveStatusObservedAt")`
  if (input.source !== "comment") {
    return newer
  }
  if (input.status === "ended") {
    // A comment only ends a broadcast; on an ended row it changes nothing.
    return sql`${newer} AND ${channelPostModel.liveStatus} IS DISTINCT FROM excluded."liveStatus"`
  }
  return sql`${newer} AND ${channelPostModel.liveStatus} IS NULL`
}

const channelPostScope = (workspaceId: string) =>
  eq(channelPostModel.workspaceId, workspaceId)

/** A post as the send path reads it: what it takes to build and check one share. */
export type ChannelPostForShare = {
  caption: string | null
  channel: string
  contentType: ChannelPostContentType | null
  externalPostId: string
  id: string
  inboxId: string
  /** Whether the post belongs to the inbox the caller asked about. */
  inboxMatches: boolean
  permalink: string | null
  thumbnail: string | null
}

export const channelPostRepository = {
  /**
   * The live post `channelPostId` of the workspace, for a send on `inboxId`.
   * A post the platform confirmed gone (`removedAt`) is not returned, so it can
   * no longer be sent. The post of another inbox is still returned, with
   * `inboxMatches: false`, so the caller can tell "not found" from "wrong inbox".
   */
  async findForInbox(
    input: { channelPostId: string; inboxId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ChannelPostForShare | null> {
    const [row] = await tx
      .select({
        caption: channelPostModel.caption,
        channel: channelPostModel.channel,
        contentType: channelPostModel.contentType,
        externalPostId: channelPostModel.externalPostId,
        id: channelPostModel.id,
        inboxId: channelPostModel.inboxId,
        permalink: channelPostModel.permalink,
        thumbnail: channelPostModel.thumbnail,
      })
      .from(channelPostModel)
      .where(
        and(
          channelPostScope(input.workspaceId),
          eq(channelPostModel.id, input.channelPostId),
          isNull(channelPostModel.removedAt),
        ),
      )
      .limit(1)
    return row ? { ...row, inboxMatches: row.inboxId === input.inboxId } : null
  },

  async findByExternalId(
    input: { channel: string; externalPostId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<{
    hideComments: boolean
    hidePhoneComments: boolean
    id: string
    integrationId: string
    liveStatus: ChannelPostLiveStatus | null
    metadataFetchedAt: Date | null
    skipComments: boolean
  } | null> {
    const [row] = await tx
      .select({
        hideComments: channelPostModel.hideComments,
        hidePhoneComments: channelPostModel.hidePhoneComments,
        id: channelPostModel.id,
        integrationId: channelPostModel.integrationId,
        liveStatus: channelPostModel.liveStatus,
        metadataFetchedAt: channelPostModel.metadataFetchedAt,
        skipComments: channelPostModel.skipComments,
      })
      .from(channelPostModel)
      .where(
        and(
          channelPostScope(input.workspaceId),
          eq(channelPostModel.channel, input.channel),
          eq(channelPostModel.externalPostId, input.externalPostId),
        ),
      )
      .limit(1)

    return row ?? null
  },

  /**
   * The stored caption of a post, or `null` when the post is not tracked or
   * its metadata was never fetched. A post whose metadata was fetched but has
   * no caption answers `""`, so a caller can tell "no hashtags" from "unknown".
   */
  async findCaptionByExternalId(
    input: { channel: string; externalPostId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [row] = await tx
      .select({
        caption: channelPostModel.caption,
        metadataFetchedAt: channelPostModel.metadataFetchedAt,
      })
      .from(channelPostModel)
      .where(
        and(
          channelPostScope(input.workspaceId),
          eq(channelPostModel.channel, input.channel),
          eq(channelPostModel.externalPostId, input.externalPostId),
        ),
      )
      .limit(1)

    if (!row?.metadataFetchedAt) {
      return null
    }
    return row.caption ?? ""
  },

  async insertBare(
    input: {
      channel: string
      externalPostId: string
      inboxId: string
      integrationId: string
      sourceAccountId: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [row] = await tx
      .insert(channelPostModel)
      .values({ ...input, metadataAttemptedAt: new Date() })
      .onConflictDoNothing({
        target: [
          channelPostModel.workspaceId,
          channelPostModel.channel,
          channelPostModel.externalPostId,
        ],
      })
      .returning({ id: channelPostModel.id })

    return row?.id ?? null
  },

  /**
   * Creates the row of a post we just published, or reuses the one a sync
   * already made, and fills only the columns still NULL with what the publish
   * knows: synced data is never overwritten. Always returns the row id.
   */
  async upsertPublished(
    input: {
      channel: string
      externalPostId: string
      inboxId: string
      integrationId: string
      known: PublishedChannelPostKnown
      sourceAccountId: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const { known, ...identity } = input
    const [row] = await tx
      .insert(channelPostModel)
      .values({ ...identity, ...known, metadataAttemptedAt: new Date() })
      .onConflictDoUpdate({
        target: [
          channelPostModel.workspaceId,
          channelPostModel.channel,
          channelPostModel.externalPostId,
        ],
        set: {
          caption: sql`COALESCE(${channelPostModel.caption}, excluded."caption")`,
          contentType: sql`COALESCE(${channelPostModel.contentType}, excluded."contentType")`,
          permalink: sql`COALESCE(${channelPostModel.permalink}, excluded."permalink")`,
          publishedAt: sql`COALESCE(${channelPostModel.publishedAt}, excluded."publishedAt")`,
          thumbnail: sql`COALESCE(${channelPostModel.thumbnail}, excluded."thumbnail")`,
        },
      })
      .returning({ id: channelPostModel.id })

    return row?.id ?? null
  },

  /**
   * Records what a live signal says about a broadcast: creates the post when it
   * is not stored yet, or updates it when the observation is newer than the
   * stored one (and, for a comment, only as `liveObservationGuard` allows).
   * Marks the post as a live broadcast unless it is already some other kind
   * (only an unknown or plain video becomes `live`). Returns whether the row
   * was written.
   */
  async recordLiveObservation(
    input: ChannelPostLiveObservation,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const { observedAt, source, status, ...identity } = input
    const rows = await tx
      .insert(channelPostModel)
      .values({
        caption: identity.caption ?? null,
        channel: identity.channel,
        contentType: "live",
        externalPostId: identity.externalPostId,
        inboxId: identity.inboxId,
        integrationId: identity.integrationId,
        liveStatus: status,
        liveRecheckAt: liveRecheckAtFor(status, observedAt),
        liveStatusObservedAt: observedAt,
        metadataAttemptedAt: new Date(),
        permalink: identity.permalink ?? null,
        publishedAt: identity.publishedAt ?? null,
        sourceAccountId: identity.sourceAccountId,
        workspaceId: identity.workspaceId,
      })
      .onConflictDoUpdate({
        target: [
          channelPostModel.workspaceId,
          channelPostModel.channel,
          channelPostModel.externalPostId,
        ],
        set: {
          caption: sql`COALESCE(${channelPostModel.caption}, excluded."caption")`,
          contentType: sql`CASE WHEN ${channelPostModel.contentType} IS NULL OR ${channelPostModel.contentType} = 'video' THEN 'live'::"channelPostContentType" ELSE ${channelPostModel.contentType} END`,
          liveRecheckAt: sql`excluded."liveRecheckAt"`,
          liveStatus: sql`excluded."liveStatus"`,
          liveStatusObservedAt: sql`excluded."liveStatusObservedAt"`,
          permalink: sql`COALESCE(${channelPostModel.permalink}, excluded."permalink")`,
          publishedAt: sql`COALESCE(${channelPostModel.publishedAt}, excluded."publishedAt")`,
        },
        setWhere: liveObservationGuard({ source, status }),
      })
      .returning({ id: channelPostModel.id })
    return rows.length > 0
  },

  /**
   * Claims the next batch of live broadcasts that are due for a re-read, before
   * any integration is looked at: one statement takes the due rows (oldest
   * `liveRecheckAt` first, `FOR UPDATE SKIP LOCKED`, so two scanners never take
   * the same row) and moves each one's `liveRecheckAt` a window ahead. A row
   * whose re-read fails therefore goes to the back of the line and cannot
   * starve the others. The give-up window counts from the later of the
   * broadcast's sort time and its last live observation, so a stream that is
   * still being seen live is never given up on. A broadcast past `giveUpBefore`
   * has its `liveRecheckAt` cleared in the same statement and is returned this
   * one last time for a final re-read; nothing queues it again, so an answer
   * of `unknown` leaves it as it is for good. A removed broadcast is cleared
   * and not returned. Served by the partial index on `("liveRecheckAt", "id")`,
   * so the batch limit bounds the rows examined.
   */
  async claimLiveRechecks(
    input: {
      giveUpBefore: Date
      limit: number
      now: Date
      recheckAfterMs: number
    },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string }[]> {
    const nextAt = new Date(input.now.getTime() + input.recheckAfterMs)
    const result = await tx.execute<{ id: string; workspaceId: string }>(sql`
      WITH due AS (
        SELECT "id" FROM "ChannelPost"
        WHERE "liveStatus" = 'live'
          AND "liveRecheckAt" IS NOT NULL
          AND "liveRecheckAt" <= ${input.now}::timestamptz
        ORDER BY "liveRecheckAt", "id"
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      ), claimed AS (
        UPDATE "ChannelPost" AS p SET
          "liveRecheckAt" = CASE
            WHEN p."removedAt" IS NULL AND GREATEST(COALESCE(p."publishedAt", p."createdAt"), p."liveStatusObservedAt") >= ${input.giveUpBefore}::timestamptz
            THEN ${nextAt}::timestamptz
          END
        FROM due
        WHERE p."id" = due."id"
        RETURNING p."id", p."workspaceId", (p."removedAt" IS NULL) AS "readable"
      )
      SELECT "id", "workspaceId" FROM claimed WHERE "readable"
    `)
    return result.rows.map((row) => ({
      id: String(row.id),
      workspaceId: String(row.workspaceId),
    }))
  },

  /**
   * Counts one more comment on a post whose channel reports no comment count
   * (webhook-counted), in ONE statement: the comments count and the engagement
   * total go up by one and the comments bits of `metricsKnownMask` are set (the known bit and the
   * current-definition bit, so a later read is not a fake gain), so a
   * count that was unknown (stored as 0) becomes a known one. Scoped by
   * `workspaceId`.
   */
  async incrementCommentsCount(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(channelPostModel)
      .set({
        commentsCount: sql`${channelPostModel.commentsCount} + 1`,
        engagementCount: sql`${channelPostModel.engagementCount} + 1`,
        metricsKnownMask: sql`${channelPostModel.metricsKnownMask} | ${CHANNEL_POST_COMMENTS_REPORTED_BITS}::integer`,
      })
      .where(
        and(
          eq(channelPostModel.id, input.id),
          channelPostScope(input.workspaceId),
        ),
      )
  },

  /** Counts one more comment carrying a phone number, atomically. */
  async incrementPhoneCommentsCount(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(channelPostModel)
      .set({
        phoneCommentsCount: sql`${channelPostModel.phoneCommentsCount} + 1`,
      })
      .where(
        and(
          eq(channelPostModel.id, input.id),
          channelPostScope(input.workspaceId),
        ),
      )
  },

  /**
   * Sets the phone-comment count to a value counted from the comments
   * themselves (the repair of a count that fell short); a post already at the
   * value is not written.
   */
  async setPhoneCommentsCount(
    input: { count: number; id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(channelPostModel)
      .set({ phoneCommentsCount: input.count })
      .where(
        and(
          eq(channelPostModel.id, input.id),
          channelPostScope(input.workspaceId),
          sql`${channelPostModel.phoneCommentsCount} IS DISTINCT FROM ${input.count}`,
        ),
      )
      .returning({ id: channelPostModel.id })
    return rows.length > 0
  },

  async updateIntegrationIfChanged(
    input: {
      channel: string
      externalPostId: string
      inboxId: string
      integrationId: string
      sourceAccountId: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const result = await tx.execute<Record<string, unknown>>(sql`
      UPDATE "ChannelPost"
      SET
        "integrationId" = ${input.integrationId}::bigint,
        "inboxId" = ${input.inboxId}::bigint,
        "sourceAccountId" = ${input.sourceAccountId},
        "updatedAt" = NOW()
      WHERE "workspaceId" = ${input.workspaceId}::bigint
        AND "channel" = ${input.channel}
        AND "externalPostId" = ${input.externalPostId}
        AND "integrationId" IS DISTINCT FROM ${input.integrationId}::bigint
      RETURNING "id"
    `)

    return (result.rowCount ?? 0) > 0
  },

  async claimMetadataRetry(
    input: {
      id: string
      maxRetryAgeMs: number
      retryIntervalMs: number
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    // Bounded by post age: a post whose metadata never resolves within
    // `maxRetryAgeMs` stops being retried, so a deleted/inaccessible post can
    // no longer spend the inline fetch budget on every future comment. The
    // bare row remains usable (the picker falls back to the external id).
    const result = await tx.execute<Record<string, unknown>>(sql`
      UPDATE "ChannelPost"
      SET "metadataAttemptedAt" = NOW(), "updatedAt" = NOW()
      WHERE "id" = ${input.id}::bigint
        AND "workspaceId" = ${input.workspaceId}::bigint
        AND "metadataFetchedAt" IS NULL
        AND "createdAt" > NOW() - (${input.maxRetryAgeMs}::bigint * INTERVAL '1 millisecond')
        AND "metadataAttemptedAt" < NOW() - (${input.retryIntervalMs}::int * INTERVAL '1 millisecond')
      RETURNING "id"
    `)

    return (result.rowCount ?? 0) > 0
  },

  /**
   * Fills the metadata of a bare post (the first-comment fetch). Fenced on
   * `metadataFetchedAt IS NULL`: a listing sync that finished meanwhile wrote
   * fuller, newer values and stamped it, so a slower fetch must not overwrite
   * them. Returns whether the row was written.
   */
  async saveMetadata(
    input: { id: string; metadata: ChannelPostMetadata; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const updated = await tx
      .update(channelPostModel)
      .set({
        ...input.metadata,
        // A thumbnail the sync already re-hosted is never replaced by "none".
        thumbnail: sql`COALESCE(${input.metadata.thumbnail}::text, ${channelPostModel.thumbnail})`,
        metadataFetchedAt: new Date(),
      })
      .where(
        and(
          eq(channelPostModel.id, input.id),
          channelPostScope(input.workspaceId),
          isNull(channelPostModel.metadataFetchedAt),
        ),
      )
      .returning({ id: channelPostModel.id })
    return updated.length > 0
  },

  async markMetadataAttempt(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(channelPostModel)
      .set({ metadataAttemptedAt: new Date() })
      .where(
        and(
          eq(channelPostModel.id, input.id),
          channelPostScope(input.workspaceId),
        ),
      )
  },

  async listFilterOptions(
    input: {
      cursor?: ChannelPostFilterCursor
      inboxId?: string
      limit: number
      search?: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    const channelPostSortAt = sql<string>`COALESCE(${channelPostModel.publishedAt}, ${channelPostModel.createdAt})`
    const conditions = [channelPostScope(input.workspaceId)]
    if (input.inboxId) {
      conditions.push(eq(channelPostModel.inboxId, input.inboxId))
    }
    if (input.search) {
      conditions.push(
        ilike(channelPostModel.caption, likeContains(input.search)),
      )
    }
    if (input.cursor) {
      const cursorCondition = or(
        lt(channelPostSortAt, input.cursor.sortAt),
        and(
          eq(channelPostSortAt, input.cursor.sortAt),
          lt(channelPostModel.id, input.cursor.id),
        ),
      )
      if (cursorCondition) {
        conditions.push(cursorCondition)
      }
    }

    return await tx
      .select({
        caption: channelPostModel.caption,
        createdAt: channelPostModel.createdAt,
        externalPostId: channelPostModel.externalPostId,
        id: channelPostModel.id,
        inboxId: channelPostModel.inboxId,
        inboxName: inboxModel.name,
        channel: channelPostModel.channel,
        permalink: channelPostModel.permalink,
        publishedAt: channelPostModel.publishedAt,
        sortAt: channelPostSortAt,
        thumbnail: channelPostModel.thumbnail,
      })
      .from(channelPostModel)
      .innerJoin(inboxModel, eq(inboxModel.id, channelPostModel.inboxId))
      .where(and(...conditions))
      // `id DESC NULLS LAST` (not drizzle's default NULLS FIRST) so the order
      // matches ChannelPost_workspaceId_sortAt_id_idx exactly and the planner
      // serves it from the index with no Sort node. id is NOT NULL, so NULLS
      // placement changes nothing about the result.
      .orderBy(
        desc(channelPostSortAt),
        sql`${channelPostModel.id} DESC NULLS LAST`,
      )
      .limit(input.limit)
  },

  async findByIds(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const ids = Array.from(new Set(input.ids))
    if (ids.length === 0) {
      return []
    }

    return await tx
      .select({
        caption: channelPostModel.caption,
        commentsCount: channelPostModel.commentsCount,
        externalPostId: channelPostModel.externalPostId,
        id: channelPostModel.id,
        inboxId: channelPostModel.inboxId,
        inboxName: inboxModel.name,
        channel: channelPostModel.channel,
        metricsKnownMask: channelPostModel.metricsKnownMask,
        permalink: channelPostModel.permalink,
        publishedAt: channelPostModel.publishedAt,
        thumbnail: channelPostModel.thumbnail,
      })
      .from(channelPostModel)
      .innerJoin(inboxModel, eq(inboxModel.id, channelPostModel.inboxId))
      .where(
        and(
          channelPostScope(input.workspaceId),
          inArray(channelPostModel.id, ids),
        ),
      )
  },

  /**
   * Whether a target published from Posts produced this stored post. The join
   * is scoped to the workspace on both sides, so a post id of another workspace
   * never matches.
   */
  async isPublishedFromPosts(
    input: { channelPostId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: socialPostTargetModel.id })
      .from(socialPostTargetModel)
      .innerJoin(
        channelPostModel,
        eq(channelPostModel.id, socialPostTargetModel.channelPostId),
      )
      .where(
        and(
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.channelPostId, input.channelPostId),
          channelPostScope(input.workspaceId),
        ),
      )
      .limit(1)

    return row !== undefined
  },
}
