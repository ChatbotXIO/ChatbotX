import { channelPostMetricBits } from "@chatbotx.io/utils/post-metrics"
import {
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
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
  sql,
} from "../../client"
import type {
  ChannelPostContentType,
  ChannelPostLiveStatus,
  ChannelPostManagementSort,
} from "../../partials/channel-post"
import {
  channelPostModel,
  channelPostToPostTopicModel,
  contactInboxPostModel,
  inboxModel,
  socialPostTargetModel,
} from "../../schema"
import { likeContains } from "../../utils"

/**
 * Keyset position in a management list. `sortValue` is the sort key of the
 * last row as text: a PostgreSQL timestamp with microseconds for `newest`
 * (a JavaScript Date would round and skip posts created in the same
 * millisecond) and a base-10 integer for the count sorts. The sort in use
 * decides how it is read, so one cursor type serves every sort.
 */
export type ChannelPostManagementCursor = {
  id: string
  /** The sort the cursor was minted under; a cursor is only valid for that sort. */
  sort: ChannelPostManagementSort
  sortValue: string
}

/**
 * One channel's rule for which posts it can send (`channelPostShare` in its
 * flow policy): the content types it takes, and whether it needs the permalink.
 */
export type ChannelPostShareCriterion = {
  channel: string
  contentTypes: ChannelPostContentType[]
  requirePermalink: boolean
}

export type ChannelPostManagementFilters = {
  /** Only posts created by these authors (`authorExternalId`). */
  authorIds?: string[]
  channels?: string[]
  contentTypes?: ChannelPostContentType[]
  /**
   * Keep only posts that have comments. Posts the comment path recorded and
   * no sync has measured yet (`metricsFetchedAt` is null) count as having
   * comments, because they exist only because a comment arrived. A post whose
   * sync reports no comment count (the bit is unknown, e.g. Facebook Reels)
   * counts when a commenter is recorded for it.
   */
  hasComments: boolean
  /** Only posts whose "hide all comments" switch is on (`true`) or off (`false`). */
  hideComments?: boolean
  hidePhoneComments?: boolean
  inboxIds?: string[]
  liveStatus?: ChannelPostLiveStatus
  publishedFrom?: Date
  publishedTo?: Date
  /** Matches the caption or permalink as text, or the external post id exactly. */
  search?: string
  /**
   * Keep only posts one of these channel rules can send. An empty list keeps
   * none: no channel can send posts.
   */
  shareable?: ChannelPostShareCriterion[]
  skipComments?: boolean
  topicIds?: string[]
}

/** The per-post comment switches an update may change; an omitted one is left as is. */
export type ChannelPostSettingsPatch = {
  hideComments?: boolean
  hidePhoneComments?: boolean
  skipComments?: boolean
}

type SortStrategy = {
  /** Keyset condition: rows strictly after the cursor in this sort's order. */
  after: (cursor: ChannelPostManagementCursor) => SQL
  /** Must match the index's column order exactly so no Sort node is planned. */
  orderBy: SQL
  sortKey: SQL
}

// Everything below that touches a table column is built when a query runs, not
// when the module loads: a module that only imports the repositories (and
// mocks the schema) must not execute it.
const sortAt = (): SQL =>
  sql`COALESCE(${channelPostModel.publishedAt}, ${channelPostModel.createdAt})`

const integerKeyAfter =
  (sortKey: SQL, comparison: SQL) => (cursor: ChannelPostManagementCursor) =>
    sql`(${sortKey}, ${channelPostModel.id}) ${comparison} (${cursor.sortValue}::bigint, ${cursor.id}::bigint)`

const descendingCountSort = (sortKey: SQL): SortStrategy => ({
  after: integerKeyAfter(sortKey, sql`<`),
  orderBy: sql`${sortKey} DESC NULLS LAST, ${channelPostModel.id} DESC NULLS LAST`,
  sortKey,
})

// A backward scan of the (col DESC NULLS LAST, id DESC NULLS LAST) index
// yields (col ASC NULLS FIRST, id ASC NULLS FIRST).
const ascendingCountSort = (sortKey: SQL): SortStrategy => ({
  after: integerKeyAfter(sortKey, sql`>`),
  orderBy: sql`${sortKey} ASC NULLS FIRST, ${channelPostModel.id} ASC NULLS FIRST`,
  sortKey,
})

const buildSortStrategies = (): Record<
  ChannelPostManagementSort,
  SortStrategy
> => {
  const newestKey = sortAt()
  const commentsCount = sql`${channelPostModel.commentsCount}`
  const phoneCommentsCount = sql`${channelPostModel.phoneCommentsCount}`
  const engagementCount = sql`${channelPostModel.engagementCount}`
  const sharesCount = sql`${channelPostModel.sharesCount}`
  return {
    newest: {
      after: (cursor) =>
        sql`(${newestKey}, ${channelPostModel.id}) < (${cursor.sortValue}::timestamptz, ${cursor.id}::bigint)`,
      orderBy: sql`${newestKey} DESC, ${channelPostModel.id} DESC NULLS LAST`,
      sortKey: newestKey,
    },
    mostComments: descendingCountSort(commentsCount),
    fewestComments: ascendingCountSort(commentsCount),
    mostPhones: descendingCountSort(phoneCommentsCount),
    fewestPhones: ascendingCountSort(phoneCommentsCount),
    mostEngagement: descendingCountSort(engagementCount),
    leastEngagement: ascendingCountSort(engagementCount),
    mostShares: descendingCountSort(sharesCount),
    fewestShares: ascendingCountSort(sharesCount),
  }
}

let sortStrategies: Record<ChannelPostManagementSort, SortStrategy> | undefined
const strategyFor = (sort: ChannelPostManagementSort): SortStrategy => {
  sortStrategies ??= buildSortStrategies()
  return sortStrategies[sort]
}

const managementColumns = () => ({
  authorExternalId: channelPostModel.authorExternalId,
  authorName: channelPostModel.authorName,
  caption: channelPostModel.caption,
  channel: channelPostModel.channel,
  commentsCount: channelPostModel.commentsCount,
  contentType: channelPostModel.contentType,
  engagementCount: channelPostModel.engagementCount,
  externalPostId: channelPostModel.externalPostId,
  hideComments: channelPostModel.hideComments,
  hidePhoneComments: channelPostModel.hidePhoneComments,
  id: channelPostModel.id,
  inboxId: channelPostModel.inboxId,
  inboxName: inboxModel.name,
  liveStatus: channelPostModel.liveStatus,
  mediaType: channelPostModel.mediaType,
  metricsFetchedAt: channelPostModel.metricsFetchedAt,
  permalink: channelPostModel.permalink,
  phoneCommentsCount: channelPostModel.phoneCommentsCount,
  publishedAt: channelPostModel.publishedAt,
  reactionsCount: channelPostModel.reactionsCount,
  sharesCount: channelPostModel.sharesCount,
  skipComments: channelPostModel.skipComments,
  thumbnail: channelPostModel.thumbnail,
  viewsCount: channelPostModel.viewsCount,
})

const workspaceScope = (workspaceId: string) =>
  and(
    eq(channelPostModel.workspaceId, workspaceId),
    // A post the platform confirmed gone is hidden, never deleted: comments
    // and contact history still point at its id.
    isNull(channelPostModel.removedAt),
  )

const AUTHOR_KEY_PATTERN = /^(\d+):(.+)$/s

/**
 * An author id is either the platform's id (matches that author on every
 * inbox) or an `authorKey` (`<inboxId>:<platform id>`, as listed by
 * `listAuthors`), which matches that author on that one inbox only.
 */
const authorIdsCondition = (authorIds: string[]): SQL | undefined => {
  const pairs = authorIds.flatMap((authorId) => {
    const match = AUTHOR_KEY_PATTERN.exec(authorId)
    return match?.[1] && match[2]
      ? [
          and(
            eq(channelPostModel.inboxId, match[1]),
            eq(channelPostModel.authorExternalId, match[2]),
          ),
        ]
      : []
  })
  const plain = inArray(channelPostModel.authorExternalId, authorIds)
  return pairs.length ? or(plain, ...pairs) : plain
}

const shareableCondition = (criteria: ChannelPostShareCriterion[]): SQL => {
  const perChannel = criteria
    .filter((criterion) => criterion.contentTypes.length > 0)
    .map((criterion) =>
      and(
        eq(channelPostModel.channel, criterion.channel),
        inArray(channelPostModel.contentType, criterion.contentTypes),
        criterion.requirePermalink
          ? and(
              isNotNull(channelPostModel.permalink),
              sql`btrim(${channelPostModel.permalink}) <> ''`,
            )
          : undefined,
      ),
    )
  return or(...perChannel) ?? sql`false`
}

const buildFilterConditions = (
  workspaceId: string,
  filters: ChannelPostManagementFilters,
): SQL[] => {
  const conditions: (SQL | undefined)[] = [workspaceScope(workspaceId)]

  if (filters.channels?.length) {
    conditions.push(inArray(channelPostModel.channel, filters.channels))
  }
  if (filters.inboxIds?.length) {
    conditions.push(inArray(channelPostModel.inboxId, filters.inboxIds))
  }
  if (filters.authorIds?.length) {
    conditions.push(authorIdsCondition(filters.authorIds))
  }
  if (filters.contentTypes?.length) {
    conditions.push(inArray(channelPostModel.contentType, filters.contentTypes))
  }
  if (filters.shareable) {
    conditions.push(shareableCondition(filters.shareable))
  }
  if (filters.hideComments !== undefined) {
    conditions.push(eq(channelPostModel.hideComments, filters.hideComments))
  }
  if (filters.hidePhoneComments !== undefined) {
    conditions.push(
      eq(channelPostModel.hidePhoneComments, filters.hidePhoneComments),
    )
  }
  if (filters.skipComments !== undefined) {
    conditions.push(eq(channelPostModel.skipComments, filters.skipComments))
  }
  if (filters.liveStatus) {
    conditions.push(eq(channelPostModel.liveStatus, filters.liveStatus))
  }
  if (filters.publishedFrom) {
    conditions.push(gte(sortAt(), filters.publishedFrom.toISOString()))
  }
  if (filters.publishedTo) {
    conditions.push(lte(sortAt(), filters.publishedTo.toISOString()))
  }
  if (filters.hasComments) {
    conditions.push(
      or(
        gt(channelPostModel.commentsCount, 0),
        isNull(channelPostModel.metricsFetchedAt),
        // A listing that reports no comment count (Facebook Reels) leaves the
        // count unknown, stored as 0: such a post still has the comments the
        // comment path recorded, found through (workspaceId, postId).
        and(
          sql`(${channelPostModel.metricsKnownMask} & ${channelPostMetricBits.comments}) = 0`,
          exists(
            db
              .select({ one: sql`1` })
              .from(contactInboxPostModel)
              .where(
                and(
                  eq(
                    contactInboxPostModel.workspaceId,
                    channelPostModel.workspaceId,
                  ),
                  eq(contactInboxPostModel.postId, channelPostModel.id),
                ),
              ),
          ),
        ),
        // A post published from ChatbotX always shows, comments or not.
        exists(
          db
            .select({ one: sql`1` })
            .from(socialPostTargetModel)
            .where(
              and(
                eq(socialPostTargetModel.channelPostId, channelPostModel.id),
                eq(
                  socialPostTargetModel.workspaceId,
                  channelPostModel.workspaceId,
                ),
              ),
            ),
        ),
      ),
    )
  }
  if (filters.search) {
    conditions.push(
      or(
        ilike(channelPostModel.caption, likeContains(filters.search)),
        ilike(channelPostModel.permalink, likeContains(filters.search)),
        eq(channelPostModel.externalPostId, filters.search),
      ),
    )
  }
  if (filters.topicIds?.length) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(channelPostToPostTopicModel)
          .where(
            and(
              eq(
                channelPostToPostTopicModel.channelPostId,
                channelPostModel.id,
              ),
              inArray(
                channelPostToPostTopicModel.postTopicId,
                filters.topicIds,
              ),
            ),
          ),
      ),
    )
  }

  return conditions.filter(
    (condition): condition is SQL => condition !== undefined,
  )
}

/** How many distinct authors the author picker lists. */
export const MAX_LISTED_POST_AUTHORS = 100

export type ChannelPostAuthor = {
  /** Unique per author per inbox: `<inboxId>:<authorExternalId>`; accepted by `authorIds`. */
  authorKey: string
  authorExternalId: string
  authorName: string | null
  channel: string
  inboxId: string
  inboxName: string
  postsCount: number
}

export const channelPostManagementRepository = {
  /**
   * The authors of a workspace's listed posts, most prolific first. A post with
   * no known author is left out. Grouped by inbox and the platform's author
   * id: a renamed author still shows once per inbox (under `max(authorName)`),
   * and the same person on two pages is two rows.
   */
  async listAuthors(
    input: { channels?: string[]; inboxIds?: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ChannelPostAuthor[]> {
    const conditions = [
      workspaceScope(input.workspaceId),
      isNotNull(channelPostModel.authorExternalId),
    ]
    if (input.channels?.length) {
      conditions.push(inArray(channelPostModel.channel, input.channels))
    }
    if (input.inboxIds?.length) {
      conditions.push(inArray(channelPostModel.inboxId, input.inboxIds))
    }
    const postsCount = sql<number>`count(*)::int`
    const authorName = sql<string | null>`max(${channelPostModel.authorName})`
    const rows = await tx
      .select({
        authorExternalId: channelPostModel.authorExternalId,
        authorName,
        channel: channelPostModel.channel,
        inboxId: channelPostModel.inboxId,
        inboxName: inboxModel.name,
        postsCount,
      })
      .from(channelPostModel)
      .innerJoin(inboxModel, eq(inboxModel.id, channelPostModel.inboxId))
      .where(and(...conditions))
      .groupBy(
        channelPostModel.inboxId,
        channelPostModel.authorExternalId,
        channelPostModel.channel,
        inboxModel.name,
      )
      .orderBy(desc(postsCount), asc(authorName))
      .limit(MAX_LISTED_POST_AUTHORS)
    return rows.flatMap((row) =>
      row.authorExternalId === null
        ? []
        : [
            {
              ...row,
              authorExternalId: row.authorExternalId,
              authorKey: `${row.inboxId}:${row.authorExternalId}`,
            },
          ],
    )
  },

  async list(
    input: {
      cursor?: ChannelPostManagementCursor
      filters: ChannelPostManagementFilters
      limit: number
      sort: ChannelPostManagementSort
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ) {
    const strategy = strategyFor(input.sort)
    const conditions = buildFilterConditions(input.workspaceId, input.filters)

    if (input.cursor) {
      conditions.push(strategy.after(input.cursor))
    }

    return await tx
      .select({
        ...managementColumns(),
        sortValue: sql<string>`${strategy.sortKey}::text`,
      })
      .from(channelPostModel)
      .innerJoin(inboxModel, eq(inboxModel.id, channelPostModel.inboxId))
      .where(and(...conditions))
      .orderBy(strategy.orderBy)
      .limit(input.limit)
  },

  async findById(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select(managementColumns())
      .from(channelPostModel)
      .innerJoin(inboxModel, eq(inboxModel.id, channelPostModel.inboxId))
      .where(
        and(
          workspaceScope(input.workspaceId),
          eq(channelPostModel.id, input.id),
        ),
      )
      .limit(1)

    return row ?? null
  },

  /** What a refresh of one post needs to reach its channel; `null` for a missing or removed post. */
  async findRefreshTarget(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .select({
        channel: channelPostModel.channel,
        externalPostId: channelPostModel.externalPostId,
        id: channelPostModel.id,
        inboxId: channelPostModel.inboxId,
        integrationId: channelPostModel.integrationId,
        liveStatus: channelPostModel.liveStatus,
        sourceAccountId: channelPostModel.sourceAccountId,
      })
      .from(channelPostModel)
      .where(
        and(
          workspaceScope(input.workspaceId),
          eq(channelPostModel.id, input.id),
        ),
      )
      .limit(1)

    return row ?? null
  },

  /**
   * Hides a post the channel confirmed is gone. The row stays: comments and
   * contact history still point at its id.
   */
  async markRemoved(
    input: { id: string; now: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(channelPostModel)
      .set({ removedAt: input.now, updatedAt: input.now })
      .where(
        and(
          workspaceScope(input.workspaceId),
          eq(channelPostModel.id, input.id),
        ),
      )
  },

  /** Sets the given switches on the posts; an empty patch changes nothing. */
  async updateSettings(
    input: {
      ids: string[]
      patch: ChannelPostSettingsPatch
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (
      input.ids.length === 0 ||
      Object.values(input.patch).every((value) => value === undefined)
    ) {
      return
    }
    await tx
      .update(channelPostModel)
      .set({ ...input.patch, updatedAt: new Date() })
      .where(
        and(
          workspaceScope(input.workspaceId),
          inArray(channelPostModel.id, input.ids),
        ),
      )
  },

  /**
   * Like `findExistingIds`, and row-locks the posts in id order until the
   * transaction ends. Writers that must not interleave on the same post (a
   * per-post cap checked after the write) take this first; the fixed order
   * keeps two overlapping bulk writers from deadlocking.
   */
  async lockExistingIds(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<string[]> {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await tx
      .select({ id: channelPostModel.id })
      .from(channelPostModel)
      .where(
        and(
          workspaceScope(input.workspaceId),
          inArray(channelPostModel.id, input.ids),
        ),
      )
      .orderBy(asc(channelPostModel.id))
      .for("update")

    return rows.map((row) => row.id)
  },

  /** The channel of each post, among `ids`, that exists in the workspace. */
  async findChannelsByIds(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await tx
      .selectDistinct({ channel: channelPostModel.channel })
      .from(channelPostModel)
      .where(
        and(
          workspaceScope(input.workspaceId),
          inArray(channelPostModel.id, input.ids),
        ),
      )

    return rows.map((row) => row.channel)
  },

  /** The ids, among `ids`, of posts that exist in the workspace (and are not removed). */
  async findExistingIds(
    input: { ids: string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await tx
      .select({ id: channelPostModel.id })
      .from(channelPostModel)
      .where(
        and(
          workspaceScope(input.workspaceId),
          inArray(channelPostModel.id, input.ids),
        ),
      )

    return rows.map((row) => row.id)
  },
}

export type ChannelPostManagementRow = NonNullable<
  Awaited<ReturnType<typeof channelPostManagementRepository.findById>>
>
