import {
  type AnyColumn,
  and,
  asc,
  type DatabaseClient,
  db,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  max,
  or,
  sql,
} from "../../client"
import type {
  SocialPostFeedFilters,
  SocialPostFeedItemOutcome,
  SocialPostFeedMediaMode,
  SocialPostFeedMode,
  SocialPostFeedNoImageFallback,
  SocialPostFeedPostAs,
  SocialPostFeedRunSummary,
  SocialPostFeedStatus,
  SocialPostFeedTemplateSyntax,
  SocialPostFeedTemplatesByProvider,
} from "../../partials/social-post-feed"
import {
  socialPostFeedDestinationModel,
  socialPostFeedItemModel,
  socialPostFeedModel,
  workspaceModel,
} from "../../schema"
import { likeContains } from "../../utils"
import {
  PublishDestinationWorkspaceError,
  publishDestinationRepository,
} from "../publish-destination/repository"

// Built when a query runs, not when the module loads (a test that mocks the
// schema must be able to import the repositories).
const feedColumns = () => ({
  aiInstructions: socialPostFeedModel.aiInstructions,
  aiIntegrationId: socialPostFeedModel.aiIntegrationId,
  aiModel: socialPostFeedModel.aiModel,
  aiWrite: socialPostFeedModel.aiWrite,
  consecutiveFailures: socialPostFeedModel.consecutiveFailures,
  createdAt: socialPostFeedModel.createdAt,
  createdById: socialPostFeedModel.createdById,
  dailyCap: socialPostFeedModel.dailyCap,
  etag: socialPostFeedModel.etag,
  fetchArticleImage: socialPostFeedModel.fetchArticleImage,
  feedUrl: socialPostFeedModel.feedUrl,
  filters: socialPostFeedModel.filters,
  id: socialPostFeedModel.id,
  intervalMinutes: socialPostFeedModel.intervalMinutes,
  lastCheckedAt: socialPostFeedModel.lastCheckedAt,
  lastErrorCode: socialPostFeedModel.lastErrorCode,
  lastManualCheckAt: socialPostFeedModel.lastManualCheckAt,
  lastModified: socialPostFeedModel.lastModified,
  lastRunSummary: socialPostFeedModel.lastRunSummary,
  maxItemsPerRun: socialPostFeedModel.maxItemsPerRun,
  mediaField: socialPostFeedModel.mediaField,
  mediaLibraryFileIds: socialPostFeedModel.mediaLibraryFileIds,
  mediaMode: socialPostFeedModel.mediaMode,
  mode: socialPostFeedModel.mode,
  name: socialPostFeedModel.name,
  nextCheckAt: socialPostFeedModel.nextCheckAt,
  noImageFallback: socialPostFeedModel.noImageFallback,
  postAs: socialPostFeedModel.postAs,
  postLatestOnFirstCheck: socialPostFeedModel.postLatestOnFirstCheck,
  primedAt: socialPostFeedModel.primedAt,
  signatureId: socialPostFeedModel.signatureId,
  startedAt: socialPostFeedModel.startedAt,
  status: socialPostFeedModel.status,
  templateSyntax: socialPostFeedModel.templateSyntax,
  templatesByProvider: socialPostFeedModel.templatesByProvider,
  textTemplate: socialPostFeedModel.textTemplate,
  workspaceId: socialPostFeedModel.workspaceId,
})

const itemColumns = () => ({
  createdAt: socialPostFeedItemModel.createdAt,
  droppedDestinationIds: socialPostFeedItemModel.droppedDestinationIds,
  id: socialPostFeedItemModel.id,
  imageError: socialPostFeedItemModel.imageError,
  imageSource: socialPostFeedItemModel.imageSource,
  imageUrl: socialPostFeedItemModel.imageUrl,
  itemKey: socialPostFeedItemModel.itemKey,
  link: socialPostFeedItemModel.link,
  outcome: socialPostFeedItemModel.outcome,
  publishedAt: socialPostFeedItemModel.publishedAt,
  reason: socialPostFeedItemModel.reason,
  socialPostId: socialPostFeedItemModel.socialPostId,
  title: socialPostFeedItemModel.title,
})

export type SocialPostFeedRow = NonNullable<
  Awaited<ReturnType<typeof socialPostFeedRepository.findById>>
>

export type SocialPostFeedInsert = {
  aiInstructions?: string | null
  aiIntegrationId?: string | null
  aiModel?: string | null
  aiWrite?: boolean
  createdById: string | null
  dailyCap: number
  feedUrl: string
  fetchArticleImage?: boolean
  filters?: SocialPostFeedFilters | null
  intervalMinutes: number
  maxItemsPerRun: number
  mediaField?: string | null
  mediaLibraryFileIds?: string[]
  mediaMode?: SocialPostFeedMediaMode
  mode: SocialPostFeedMode
  name: string
  noImageFallback?: SocialPostFeedNoImageFallback
  postAs?: SocialPostFeedPostAs
  postLatestOnFirstCheck?: boolean
  signatureId: string | null
  startedAt: Date
  templateSyntax?: SocialPostFeedTemplateSyntax
  templatesByProvider?: SocialPostFeedTemplatesByProvider
  textTemplate: string
  workspaceId: string
}

export type SocialPostFeedPatch = Partial<
  Pick<
    SocialPostFeedInsert,
    | "aiInstructions"
    | "aiIntegrationId"
    | "aiModel"
    | "aiWrite"
    | "dailyCap"
    | "feedUrl"
    | "fetchArticleImage"
    | "filters"
    | "intervalMinutes"
    | "maxItemsPerRun"
    | "mediaField"
    | "mediaLibraryFileIds"
    | "mediaMode"
    | "mode"
    | "name"
    | "noImageFallback"
    | "postAs"
    | "postLatestOnFirstCheck"
    | "signatureId"
    | "templateSyntax"
    | "templatesByProvider"
    | "textTemplate"
  >
>

/**
 * What a changed address must forget: the validators and the priming of the
 * old address. Each keeps its value when the normalised URL is unchanged, and
 * the comparison runs in the same UPDATE as the change.
 */
export const feedUrlChangeResets = (feedUrl: string) => {
  const changed = sql`${socialPostFeedModel.feedUrl} IS DISTINCT FROM ${feedUrl}`
  const resetTo = (column: AnyColumn, value: ReturnType<typeof sql> | null) =>
    sql`CASE WHEN ${changed} THEN ${value ?? sql`NULL`} ELSE ${column} END`
  return {
    consecutiveFailures: resetTo(
      socialPostFeedModel.consecutiveFailures,
      sql`0`,
    ),
    etag: resetTo(socialPostFeedModel.etag, null),
    lastErrorCode: resetTo(socialPostFeedModel.lastErrorCode, null),
    lastModified: resetTo(socialPostFeedModel.lastModified, null),
    // A check still running for the old address no longer owns the feed: its
    // `finishRun` finds no matching lease, so it cannot write the old address's
    // validators, priming or counters over these resets.
    leaseExpiresAt: resetTo(socialPostFeedModel.leaseExpiresAt, null),
    primedAt: resetTo(socialPostFeedModel.primedAt, null),
    startedAt: resetTo(socialPostFeedModel.startedAt, sql`now()`),
  }
}

/**
 * Keeps `nextCheckAt` in step with an edit: a new address is checked at once,
 * and a shorter interval pulls a check that is further away than the new
 * interval forward (a longer one keeps the check already planned).
 */
export const feedScheduleChange = (patch: {
  feedUrl?: string
  intervalMinutes?: number
}) => {
  if (patch.feedUrl === undefined && patch.intervalMinutes === undefined) {
    return {}
  }
  const byInterval =
    patch.intervalMinutes === undefined
      ? sql`${socialPostFeedModel.nextCheckAt}`
      : sql`LEAST(${socialPostFeedModel.nextCheckAt}, now() + make_interval(mins => ${patch.intervalMinutes}::int))`
  const nextCheckAt =
    patch.feedUrl === undefined
      ? byInterval
      : sql`CASE WHEN ${socialPostFeedModel.feedUrl} IS DISTINCT FROM ${patch.feedUrl} THEN now() ELSE ${byInterval} END`
  return { nextCheckAt }
}

export type SocialPostFeedItemInsert = {
  droppedDestinationIds?: string[] | null
  feedId: string
  imageError?: string | null
  imageSource?: string | null
  imageUrl?: string | null
  itemKey: string
  link: string | null
  outcome: SocialPostFeedItemOutcome
  publishedAt: Date | null
  reason: string | null
  socialPostId?: string | null
  title: string | null
  workspaceId: string
}

/** What a finished check writes back, under the lease that ran it. */
export type SocialPostFeedRunResult = {
  consecutiveFailures: number
  etag: string | null
  lastErrorCode: string | null
  lastModified: string | null
  /** Set to check again sooner than the interval (a stale copy of the source). */
  nextCheckAt?: Date
  primedAt: Date | null
  status: SocialPostFeedStatus
  summary: SocialPostFeedRunSummary
}

export type SocialPostFeedItemCursor = { createdAt: Date; id: string }

export const socialPostFeedRepository = {
  async findById(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select(feedColumns())
      .from(socialPostFeedModel)
      .where(
        and(
          eq(socialPostFeedModel.id, input.id),
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  async list(
    input: {
      destinationIds?: string[]
      limit: number
      mode?: SocialPostFeedMode[]
      search?: string
      status?: SocialPostFeedStatus[]
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    const search = input.search?.trim()
    return await tx
      .select(feedColumns())
      .from(socialPostFeedModel)
      .where(
        and(
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
          input.status?.length
            ? inArray(socialPostFeedModel.status, input.status)
            : undefined,
          input.mode?.length
            ? inArray(socialPostFeedModel.mode, input.mode)
            : undefined,
          search
            ? or(
                ilike(socialPostFeedModel.name, likeContains(search)),
                ilike(socialPostFeedModel.feedUrl, likeContains(search)),
              )
            : undefined,
          input.destinationIds?.length
            ? exists(
                tx
                  .select({ one: sql`1` })
                  .from(socialPostFeedDestinationModel)
                  .where(
                    and(
                      eq(
                        socialPostFeedDestinationModel.feedId,
                        socialPostFeedModel.id,
                      ),
                      eq(
                        socialPostFeedDestinationModel.workspaceId,
                        input.workspaceId,
                      ),
                      inArray(
                        socialPostFeedDestinationModel.publishDestinationId,
                        input.destinationIds,
                      ),
                    ),
                  ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(socialPostFeedModel.name), asc(socialPostFeedModel.id))
      .limit(input.limit)
  },

  /** The workspace's IANA time zone (dates in a feed post are written in it). */
  async findWorkspaceTimezone(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<string> {
    const [row] = await tx
      .select({ timezone: workspaceModel.timezone })
      .from(workspaceModel)
      .where(eq(workspaceModel.id, workspaceId))
      .limit(1)
    return row?.timezone ?? "UTC"
  },

  /** Serialises feed creation in a workspace until the transaction ends. */
  async lockWorkspaceFeeds(
    workspaceId: string,
    tx: DatabaseClient,
  ): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended('post-feeds:' || ${workspaceId}::text, 0))`,
    )
  },

  async countByWorkspace(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      socialPostFeedModel,
      eq(socialPostFeedModel.workspaceId, workspaceId),
    )
  },

  async insert(values: SocialPostFeedInsert, tx: DatabaseClient = db) {
    const [row] = await tx
      .insert(socialPostFeedModel)
      .values(values)
      .returning({ id: socialPostFeedModel.id })
    return row ?? null
  },

  async update(
    input: { id: string; patch: SocialPostFeedPatch; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(socialPostFeedModel)
      .set({
        ...input.patch,
        ...(input.patch.feedUrl === undefined
          ? {}
          : feedUrlChangeResets(input.patch.feedUrl)),
        ...feedScheduleChange(input.patch),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(socialPostFeedModel.id, input.id),
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: socialPostFeedModel.id })
    return row ?? null
  },

  async delete(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .delete(socialPostFeedModel)
      .where(
        and(
          eq(socialPostFeedModel.id, input.id),
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: socialPostFeedModel.id })
    return rows.length > 0
  },

  /** Deletes several feeds of one workspace in one statement; returns the ids that existed. */
  async deleteMany(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await tx
      .delete(socialPostFeedModel)
      .where(
        and(
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
          inArray(socialPostFeedModel.id, input.ids),
        ),
      )
      .returning({ id: socialPostFeedModel.id })
    return rows.map((row) => row.id)
  },

  /** Pauses a feed; a running check finishes but its result no longer re-activates it. */
  async pause(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialPostFeedModel)
      .set({ status: "paused", updatedAt: new Date() })
      .where(
        and(
          eq(socialPostFeedModel.id, input.id),
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: socialPostFeedModel.id })
    return rows.length > 0
  },

  /** A paused or failed feed becomes active and is checked at `nextCheckAt`. */
  async resume(
    input: { id: string; nextCheckAt: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialPostFeedModel)
      .set({
        consecutiveFailures: 0,
        lastErrorCode: null,
        nextCheckAt: input.nextCheckAt,
        status: "active",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(socialPostFeedModel.id, input.id),
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
        ),
      )
      .returning({ id: socialPostFeedModel.id })
    return rows.length > 0
  },

  async replaceDestinations(
    input: { destinationIds: string[]; feedId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<void> {
    const [feed] = await tx
      .select({ id: socialPostFeedModel.id })
      .from(socialPostFeedModel)
      .where(
        and(
          eq(socialPostFeedModel.id, input.feedId),
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    if (!feed) {
      throw new PublishDestinationWorkspaceError()
    }
    await tx
      .delete(socialPostFeedDestinationModel)
      .where(
        and(
          eq(socialPostFeedDestinationModel.feedId, input.feedId),
          eq(socialPostFeedDestinationModel.workspaceId, input.workspaceId),
        ),
      )
    if (input.destinationIds.length === 0) {
      return
    }
    await publishDestinationRepository.assertInWorkspace(
      { ids: input.destinationIds, workspaceId: input.workspaceId },
      tx,
    )
    await tx.insert(socialPostFeedDestinationModel).values(
      input.destinationIds.map((publishDestinationId) => ({
        feedId: input.feedId,
        publishDestinationId,
        workspaceId: input.workspaceId,
      })),
    )
  },

  async listDestinations(
    input: { feedIds: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    if (input.feedIds.length === 0) {
      return []
    }
    return await tx
      .select({
        destinationId: socialPostFeedDestinationModel.publishDestinationId,
        feedId: socialPostFeedDestinationModel.feedId,
      })
      .from(socialPostFeedDestinationModel)
      .where(
        and(
          eq(socialPostFeedDestinationModel.workspaceId, input.workspaceId),
          inArray(socialPostFeedDestinationModel.feedId, input.feedIds),
        ),
      )
      .orderBy(asc(socialPostFeedDestinationModel.id))
  },

  /**
   * Active feeds that are due, each pushed to its next check in the same
   * statement (`nextCheckAt + interval`, from `now`), so a tick that loses its
   * job does not pick the feed up again before the next interval.
   */
  async claimDue(
    input: { limit: number; now: Date },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string }[]> {
    const result = await tx.execute<{ id: string; workspaceId: string }>(sql`
      UPDATE "SocialPostFeed" AS f
      SET "nextCheckAt" = ${input.now}::timestamptz
        + make_interval(mins => f."intervalMinutes")
      WHERE f."id" IN (
        SELECT s."id" FROM "SocialPostFeed" AS s
        WHERE s."status" = 'active'
          AND s."nextCheckAt" <= ${input.now}::timestamptz
        ORDER BY s."nextCheckAt" ASC, s."id" ASC
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING f."id"::text AS "id", f."workspaceId"::text AS "workspaceId"
    `)
    return result.rows
  },

  /** Takes the feed's check lease; null when another worker holds it or the feed is no longer active. */
  async claimRun(
    input: { id: string; leaseUntil: Date; now: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(socialPostFeedModel)
      .set({ leaseExpiresAt: input.leaseUntil })
      .where(
        and(
          eq(socialPostFeedModel.id, input.id),
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
          eq(socialPostFeedModel.status, "active"),
          or(
            sql`${socialPostFeedModel.leaseExpiresAt} IS NULL`,
            lt(socialPostFeedModel.leaseExpiresAt, input.now),
          ),
        ),
      )
      .returning(feedColumns())
    return row ?? null
  },

  /**
   * Stores the outcome of a check and releases the lease. Written only while
   * the lease is still the one that ran the check; a feed paused in the
   * meantime keeps `paused`.
   */
  async finishRun(
    input: {
      id: string
      leaseUntil: Date
      now: Date
      result: SocialPostFeedRunResult
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const { result } = input
    const rows = await tx
      .update(socialPostFeedModel)
      .set({
        consecutiveFailures: result.consecutiveFailures,
        etag: result.etag,
        lastCheckedAt: input.now,
        lastErrorCode: result.lastErrorCode,
        lastModified: result.lastModified,
        lastRunSummary: result.summary,
        leaseExpiresAt: null,
        ...(result.nextCheckAt ? { nextCheckAt: result.nextCheckAt } : {}),
        primedAt: result.primedAt,
        status: sql`CASE WHEN ${socialPostFeedModel.status} = 'paused'
          THEN ${socialPostFeedModel.status}
          ELSE ${result.status}::"socialPostFeedStatus" END`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(socialPostFeedModel.id, input.id),
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
          eq(socialPostFeedModel.leaseExpiresAt, input.leaseUntil),
        ),
      )
      .returning({ id: socialPostFeedModel.id })
    return rows.length > 0
  },

  /**
   * Fences a worker side effect: locks the feed row (`FOR SHARE`, so an edit
   * of the address waits for the transaction) and tells whether `leaseUntil`
   * is still the lease that owns it. Call it first in the transaction that
   * writes ledger rows or posts; a run that lost its lease (the address was
   * changed, or the lease expired and was taken over) must write nothing.
   */
  async lockLease(
    input: { id: string; leaseUntil: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .select({ id: socialPostFeedModel.id })
      .from(socialPostFeedModel)
      .where(
        and(
          eq(socialPostFeedModel.id, input.id),
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
          eq(socialPostFeedModel.leaseExpiresAt, input.leaseUntil),
        ),
      )
      .for("share")
    return rows.length > 0
  },

  /**
   * Makes an active feed due again at once: the feeds a tick claimed but could
   * not queue, and a feed whose address was changed under a running check (its
   * `finishRun` wrote nothing). `unleasedOnly` leaves a feed alone when another
   * check holds its lease.
   */
  async markDue(
    input: {
      id: string
      now: Date
      unleasedOnly?: boolean
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(socialPostFeedModel)
      .set({ nextCheckAt: input.now })
      .where(
        and(
          eq(socialPostFeedModel.id, input.id),
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
          eq(socialPostFeedModel.status, "active"),
          input.unleasedOnly
            ? sql`${socialPostFeedModel.leaseExpiresAt} IS NULL`
            : undefined,
        ),
      )
  },

  /** Records a manual "run now"; false inside the cool-down. */
  async markManualCheck(
    input: { cooldownBefore: Date; id: string; now: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialPostFeedModel)
      .set({ lastManualCheckAt: input.now })
      .where(
        and(
          eq(socialPostFeedModel.id, input.id),
          eq(socialPostFeedModel.workspaceId, input.workspaceId),
          eq(socialPostFeedModel.status, "active"),
          or(
            sql`${socialPostFeedModel.lastManualCheckAt} IS NULL`,
            lt(socialPostFeedModel.lastManualCheckAt, input.cooldownBefore),
          ),
        ),
      )
      .returning({ id: socialPostFeedModel.id })
    return rows.length > 0
  },

  /**
   * The newest `publishedAt` the feed's ledger has seen (the watermark of the
   * source); null when no recorded item has a date. A fetched copy whose newest
   * item is older than this is a stale copy of the source. Only rows written
   * since `since` count (the ledger of a previous address is not this source's
   * history) and a date after `notAfter` is ignored (a future date that the
   * publisher later fixed would otherwise make every later copy look stale).
   */
  async maxPublishedAt(
    input: { feedId: string; notAfter: Date; since: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<Date | null> {
    const [row] = await tx
      .select({ newest: max(socialPostFeedItemModel.publishedAt) })
      .from(socialPostFeedItemModel)
      .where(
        and(
          eq(socialPostFeedItemModel.feedId, input.feedId),
          eq(socialPostFeedItemModel.workspaceId, input.workspaceId),
          gte(socialPostFeedItemModel.createdAt, input.since),
          lte(socialPostFeedItemModel.publishedAt, input.notAfter),
        ),
      )
    return row?.newest ?? null
  },

  /** Which of these keys the ledger already knows. */
  async findKnownKeys(
    input: { feedId: string; itemKeys: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<Set<string>> {
    if (input.itemKeys.length === 0) {
      return new Set()
    }
    const rows = await tx
      .select({ itemKey: socialPostFeedItemModel.itemKey })
      .from(socialPostFeedItemModel)
      .where(
        and(
          eq(socialPostFeedItemModel.feedId, input.feedId),
          eq(socialPostFeedItemModel.workspaceId, input.workspaceId),
          inArray(socialPostFeedItemModel.itemKey, input.itemKeys),
        ),
      )
    return new Set(rows.map((row) => row.itemKey))
  },

  /** `null` when the item is already in the ledger (a concurrent or repeated run won). */
  async insertItem(values: SocialPostFeedItemInsert, tx: DatabaseClient = db) {
    const [row] = await tx
      .insert(socialPostFeedItemModel)
      .values(values)
      .onConflictDoNothing({
        target: [
          socialPostFeedItemModel.feedId,
          socialPostFeedItemModel.itemKey,
        ],
      })
      .returning({ id: socialPostFeedItemModel.id })
    return row ?? null
  },

  async insertItems(
    values: SocialPostFeedItemInsert[],
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (values.length === 0) {
      return
    }
    await tx
      .insert(socialPostFeedItemModel)
      .values(values)
      .onConflictDoNothing({
        target: [
          socialPostFeedItemModel.feedId,
          socialPostFeedItemModel.itemKey,
        ],
      })
  },

  async attachPost(
    input: { id: string; socialPostId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx
      .update(socialPostFeedItemModel)
      .set({ socialPostId: input.socialPostId, updatedAt: new Date() })
      .where(
        and(
          eq(socialPostFeedItemModel.id, input.id),
          eq(socialPostFeedItemModel.workspaceId, input.workspaceId),
        ),
      )
  },

  /** Items turned into posts since `since` (the daily cap is measured against it). */
  async countCreatedSince(
    input: { feedId: string; since: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    return await tx.$count(
      socialPostFeedItemModel,
      and(
        eq(socialPostFeedItemModel.feedId, input.feedId),
        eq(socialPostFeedItemModel.workspaceId, input.workspaceId),
        eq(socialPostFeedItemModel.outcome, "created"),
        gt(socialPostFeedItemModel.createdAt, input.since),
      ),
    )
  },

  /** Creation time of the post made since `since` at 0-based `offset` from the oldest (when the rolling cap frees a place), or null. */
  async oldestCreatedSince(
    input: {
      feedId: string
      offset?: number
      since: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<Date | null> {
    const [row] = await tx
      .select({ createdAt: socialPostFeedItemModel.createdAt })
      .from(socialPostFeedItemModel)
      .where(
        and(
          eq(socialPostFeedItemModel.feedId, input.feedId),
          eq(socialPostFeedItemModel.workspaceId, input.workspaceId),
          eq(socialPostFeedItemModel.outcome, "created"),
          gt(socialPostFeedItemModel.createdAt, input.since),
        ),
      )
      .orderBy(asc(socialPostFeedItemModel.createdAt))
      .limit(1)
      .offset(input.offset ?? 0)
    return row?.createdAt ?? null
  },

  /** One ledger row of a feed, with its key (the service never returns the key). */
  async findItem(
    input: { feedId: string; itemId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select({ ...itemColumns(), itemKey: socialPostFeedItemModel.itemKey })
      .from(socialPostFeedItemModel)
      .where(
        and(
          eq(socialPostFeedItemModel.id, input.itemId),
          eq(socialPostFeedItemModel.feedId, input.feedId),
          eq(socialPostFeedItemModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  /** Newest first; keyset on (createdAt, id). */
  async listItems(
    input: {
      cursor?: SocialPostFeedItemCursor
      feedId: string
      limit: number
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select(itemColumns())
      .from(socialPostFeedItemModel)
      .where(
        and(
          eq(socialPostFeedItemModel.feedId, input.feedId),
          eq(socialPostFeedItemModel.workspaceId, input.workspaceId),
          input.cursor
            ? or(
                lt(socialPostFeedItemModel.createdAt, input.cursor.createdAt),
                and(
                  eq(socialPostFeedItemModel.createdAt, input.cursor.createdAt),
                  lt(socialPostFeedItemModel.id, input.cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(
        desc(socialPostFeedItemModel.createdAt),
        desc(socialPostFeedItemModel.id),
      )
      .limit(input.limit)
  },

  /** Removes up to `limit` ledger rows of a feed older than `before`; returns how many. */
  async pruneItems(
    input: { before: Date; feedId: string; limit: number; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .delete(socialPostFeedItemModel)
      .where(
        inArray(
          socialPostFeedItemModel.id,
          tx
            .select({ id: socialPostFeedItemModel.id })
            .from(socialPostFeedItemModel)
            .where(
              and(
                eq(socialPostFeedItemModel.feedId, input.feedId),
                eq(socialPostFeedItemModel.workspaceId, input.workspaceId),
                lt(socialPostFeedItemModel.createdAt, input.before),
              ),
            )
            .limit(input.limit),
        ),
      )
      .returning({ id: socialPostFeedItemModel.id })
    return rows.length
  },
}
