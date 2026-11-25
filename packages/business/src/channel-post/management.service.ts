import {
  type DatabaseClient,
  db,
  isForeignKeyViolationError,
} from "@chatbotx.io/database/client"
import {
  type ChannelPostContentType,
  type ChannelPostLiveStatus,
  type ChannelPostManagementSort,
  type ChannelType,
  channelPostContentTypes,
  channelPostLiveStatuses,
  channelTypes,
} from "@chatbotx.io/database/partials"
import {
  type ChannelPostManagementCursor,
  type ChannelPostManagementFilters,
  type ChannelPostManagementRow,
  type ChannelPostSettingsPatch,
  channelPostManagementRepository,
  postTopicRepository,
} from "@chatbotx.io/database/repositories"
import {
  isPostManagementChannel,
  POST_CHANNEL_CAPABILITIES,
} from "@chatbotx.io/utils/channel"
import { isValidPostgresTimestampWithOffset } from "@chatbotx.io/utils/postgres-timestamp"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import { logger } from "../logger"
import { resolveTenantSettings } from "../platform/settings"
import { getPublicFileUrl } from "../utils"

/** Most topics one post may carry; bounds every list payload. */
export const MAX_TOPICS_PER_POST = 20
/** Most posts one bulk update may touch. */
export const MAX_BULK_UPDATE_POSTS = 100

// The sorted counts are bigint columns, so a cursor may carry up to int64.
const COUNT_SORT_VALUE = /^\d{1,19}$/
const MAX_COUNT_SORT_VALUE = 9_223_372_036_854_775_807n

export type ChannelPostTopicLabel = {
  color: string | null
  id: string
  name: string
}

export type ChannelPostManagementItem = {
  authorExternalId: string | null
  authorName: string | null
  caption: string | null
  channel: ChannelType
  commentsCount: number
  contentType: ChannelPostContentType | null
  engagementCount: number
  externalPostId: string
  hideComments: boolean
  hidePhoneComments: boolean
  id: string
  inboxId: string
  inboxName: string
  liveStatus: ChannelPostLiveStatus | null
  mediaType: string | null
  metricsFetchedAt: Date | null
  permalink: string | null
  phoneCommentsCount: number
  publishedAt: Date | null
  reactionsCount: number
  sharesCount: number
  skipComments: boolean
  thumbnailUrl: string | null
  topics: ChannelPostTopicLabel[]
  viewsCount: number | null
}

export type ListManagedChannelPostsInput = {
  cursor?: ChannelPostManagementCursor
  filters: ChannelPostManagementFilters
  limit: number
  sort: ChannelPostManagementSort
  workspaceId: string
}

/**
 * Whether `cursor` can be replayed under `sort`: it must have been minted
 * under that same sort (replaying a `mostComments` cursor under
 * `fewestComments` would page the wrong way) and its key must be valid for
 * the SQL cast (an impossible date or an out-of-range integer would fail the
 * whole request in PostgreSQL).
 */
const isCursorForSort = (
  sort: ChannelPostManagementSort,
  cursor: ChannelPostManagementCursor,
): boolean => {
  if (cursor.sort !== sort) {
    return false
  }
  if (sort === "newest") {
    return isValidPostgresTimestampWithOffset(cursor.sortValue)
  }
  return (
    COUNT_SORT_VALUE.test(cursor.sortValue) &&
    BigInt(cursor.sortValue) <= MAX_COUNT_SORT_VALUE
  )
}

/** `null` stays `null`; a stored value outside the enum (never written by us) reads as `null`. */
const parseOptional = <Value extends string>(
  schema: {
    safeParse: (value: unknown) => { data?: Value; success: boolean }
  },
  value: string | null,
): Value | null => {
  if (value === null) {
    return null
  }
  const parsed = schema.safeParse(value)
  return parsed.success && parsed.data !== undefined ? parsed.data : null
}

const hasSettingChange = (patch: ChannelPostSettingsPatch): boolean =>
  Object.values(patch).some((value) => value !== undefined)

const assertTopicCount = (field: string, topicIds: string[]): void => {
  if (topicIds.length > MAX_TOPICS_PER_POST) {
    throw validationException(
      field,
      `A post can have at most ${MAX_TOPICS_PER_POST} topics.`,
    )
  }
}

const assertUniqueIds = (field: string, ids: string[]): void => {
  if (new Set(ids).size !== ids.length) {
    throw validationException(field, "Ids must be unique.")
  }
}

export type ChannelPostAuthorItem = {
  authorKey: string
  authorExternalId: string
  authorName: string | null
  channel: string
  inboxId: string
  inboxName: string
  postsCount: number
}

class ChannelPostManagementService extends BaseService {
  /**
   * The authors of the workspace's listed posts (at most 100), most prolific
   * first, for the author filter. Posts with no known author are left out.
   */
  async listAuthors(input: {
    channels?: string[]
    inboxIds?: string[]
    workspaceId: string
  }): Promise<{ items: ChannelPostAuthorItem[] }> {
    return {
      items: await channelPostManagementRepository.listAuthors(input),
    }
  }

  async list(input: ListManagedChannelPostsInput): Promise<{
    items: ChannelPostManagementItem[]
    nextCursor?: ChannelPostManagementCursor
  }> {
    if (input.cursor && !isCursorForSort(input.sort, input.cursor)) {
      throw validationException(
        "cursor",
        "The cursor does not belong to this sort order.",
      )
    }

    const rows = await channelPostManagementRepository.list({
      ...input,
      limit: input.limit + 1,
    })
    const pageRows = rows.slice(0, input.limit)
    const last = pageRows.at(-1)
    const items = await this.toItems(pageRows, input.workspaceId)

    return {
      items,
      ...(rows.length > input.limit && last
        ? {
            nextCursor: {
              id: last.id,
              sort: input.sort,
              sortValue: last.sortValue,
            },
          }
        : {}),
    }
  }

  async get(input: {
    id: string
    workspaceId: string
  }): Promise<ChannelPostManagementItem> {
    const row = await channelPostManagementRepository.findById(input)
    if (!row) {
      throw notFoundException("Post not found.")
    }
    const [item] = await this.toItems([row], input.workspaceId)
    if (!item) {
      // Only a retired channel value can drop the row from the mapping.
      throw notFoundException("Post not found.")
    }
    return item
  }

  async update(input: {
    id: string
    settings?: ChannelPostSettingsPatch
    topicIds?: string[]
    workspaceId: string
  }): Promise<ChannelPostManagementItem> {
    const settings = input.settings ?? {}
    const topicIds = input.topicIds
    if (topicIds) {
      assertTopicCount("topicIds", topicIds)
      assertUniqueIds("topicIds", topicIds)
    }

    if (topicIds || hasSettingChange(settings)) {
      await this.writeChanges({
        channelPostIds: [input.id],
        hasSettings: hasSettingChange(settings),
        topicField: "topicIds",
        topicIds: topicIds ?? [],
        workspaceId: input.workspaceId,
        write: async (tx) => {
          await channelPostManagementRepository.updateSettings(
            {
              ids: [input.id],
              patch: settings,
              workspaceId: input.workspaceId,
            },
            tx,
          )
          if (topicIds) {
            await postTopicRepository.replaceForPosts(
              { channelPostIds: [input.id], topicIds },
              tx,
            )
          }
        },
      })
    }
    // `get` answers 404 for a missing post, so a no-change update needs no check.
    return await this.get({ id: input.id, workspaceId: input.workspaceId })
  }

  async bulkUpdate(input: {
    addTopicIds?: string[]
    ids: string[]
    removeTopicIds?: string[]
    settings?: ChannelPostSettingsPatch
    workspaceId: string
  }): Promise<{ updatedCount: number }> {
    assertUniqueIds("ids", input.ids)
    if (input.ids.length > MAX_BULK_UPDATE_POSTS) {
      throw validationException(
        "ids",
        `At most ${MAX_BULK_UPDATE_POSTS} posts can be updated at once.`,
      )
    }
    const add = input.addTopicIds ?? []
    const remove = input.removeTopicIds ?? []
    const settings = input.settings ?? {}
    if (
      add.length === 0 &&
      remove.length === 0 &&
      !hasSettingChange(settings)
    ) {
      throw validationException("ids", "Nothing to update.")
    }
    assertTopicCount("addTopicIds", add)
    assertTopicCount("removeTopicIds", remove)
    assertUniqueIds("addTopicIds", add)
    assertUniqueIds("removeTopicIds", remove)
    if (add.some((topicId) => remove.includes(topicId))) {
      throw validationException(
        "removeTopicIds",
        "A topic cannot be both added and removed.",
      )
    }
    await this.writeChanges({
      channelPostIds: input.ids,
      hasSettings: hasSettingChange(settings),
      topicField: "addTopicIds",
      topicIds: [...add, ...remove],
      workspaceId: input.workspaceId,
      write: async (tx) => {
        await channelPostManagementRepository.updateSettings(
          { ids: input.ids, patch: settings, workspaceId: input.workspaceId },
          tx,
        )
        await postTopicRepository.removeFromPosts(
          { channelPostIds: input.ids, topicIds: remove },
          tx,
        )
        await postTopicRepository.addToPosts(
          { channelPostIds: input.ids, topicIds: add },
          tx,
        )
      },
    })
    return { updatedCount: input.ids.length }
  }

  /**
   * Runs a settings and topic write on posts in one transaction: row-locks the posts (so
   * concurrent writers on one post queue up and the per-post cap check below
   * is exact), validates that every post and topic belongs to the workspace,
   * writes, then rejects (rolling back) when a post would end up over the cap.
   */
  private async writeChanges(input: {
    channelPostIds: string[]
    /** The request field reported when a post would exceed the topic cap. */
    topicField: string
    topicIds: string[]
    hasSettings: boolean
    workspaceId: string
    write: (tx: DatabaseClient) => Promise<void>
  }): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        const locked = await channelPostManagementRepository.lockExistingIds(
          { ids: input.channelPostIds, workspaceId: input.workspaceId },
          tx,
        )
        if (locked.length !== new Set(input.channelPostIds).size) {
          throw notFoundException("Post not found.")
        }
        await this.assertTopicsExist(input.topicIds, input.workspaceId, tx)
        if (input.hasSettings) {
          await this.assertCommentSettingsSupported(
            input.channelPostIds,
            input.workspaceId,
            tx,
          )
        }

        await input.write(tx)

        const overLimit = await postTopicRepository.findPostsOverTopicLimit(
          { channelPostIds: input.channelPostIds, limit: MAX_TOPICS_PER_POST },
          tx,
        )
        if (overLimit.length > 0) {
          throw validationException(
            input.topicField,
            `A post can have at most ${MAX_TOPICS_PER_POST} topics.`,
          )
        }
      })
    } catch (err) {
      // A post or topic deleted between the check and the write.
      if (isForeignKeyViolationError(err)) {
        throw notFoundException("Post or topic not found.")
      }
      throw err
    }
  }

  /** Threads and TikTok do not enforce the comment switches, so they are not stored for them. */
  private async assertCommentSettingsSupported(
    ids: string[],
    workspaceId: string,
    tx: DatabaseClient,
  ): Promise<void> {
    const channels = await channelPostManagementRepository.findChannelsByIds(
      { ids, workspaceId },
      tx,
    )
    const unsupported = channels.some(
      (channel) =>
        !(
          isPostManagementChannel(channel) &&
          POST_CHANNEL_CAPABILITIES[channel].commentSettings
        ),
    )
    if (unsupported) {
      throw validationException(
        "settings",
        "Comment settings are not available for posts of this channel.",
      )
    }
  }

  private async assertTopicsExist(
    ids: string[],
    workspaceId: string,
    tx: DatabaseClient,
  ): Promise<void> {
    const existing = await postTopicRepository.findExistingIds(
      { ids, workspaceId },
      tx,
    )
    if (existing.length !== new Set(ids).size) {
      throw notFoundException("Topic not found.")
    }
  }

  /**
   * Maps rows to API items with one extra query for all topics of the page
   * (no per-post lookup). `channel` is free text in the database, so a value
   * outside `ChannelType` (a retired channel) is skipped and logged instead
   * of failing the whole page.
   */
  private async toItems(
    rows: ChannelPostManagementRow[],
    workspaceId: string,
  ): Promise<ChannelPostManagementItem[]> {
    if (rows.length === 0) {
      return []
    }
    const [topicRows, { storageUrl }] = await Promise.all([
      postTopicRepository.listForPosts({
        channelPostIds: rows.map((row) => row.id),
      }),
      resolveTenantSettings({ workspaceId }),
    ])

    const topicsByPost = new Map<string, ChannelPostTopicLabel[]>()
    for (const { channelPostId, ...topic } of topicRows) {
      const topics = topicsByPost.get(channelPostId) ?? []
      topics.push(topic)
      topicsByPost.set(channelPostId, topics)
    }

    return rows.flatMap((row) => {
      const channel = channelTypes.safeParse(row.channel)
      if (!channel.success) {
        logger.warn(
          { channelPostId: row.id, channel: row.channel },
          "channel-post: skipping a post with an unknown channel",
        )
        return []
      }
      return [
        {
          authorExternalId: row.authorExternalId,
          authorName: row.authorName,
          caption: row.caption,
          channel: channel.data,
          commentsCount: row.commentsCount,
          contentType: parseOptional(channelPostContentTypes, row.contentType),
          engagementCount: row.engagementCount,
          externalPostId: row.externalPostId,
          hideComments: row.hideComments,
          hidePhoneComments: row.hidePhoneComments,
          id: row.id,
          inboxId: row.inboxId,
          inboxName: row.inboxName,
          liveStatus: parseOptional(channelPostLiveStatuses, row.liveStatus),
          mediaType: row.mediaType,
          metricsFetchedAt: row.metricsFetchedAt,
          permalink: row.permalink,
          phoneCommentsCount: row.phoneCommentsCount,
          publishedAt: row.publishedAt,
          reactionsCount: row.reactionsCount,
          sharesCount: row.sharesCount,
          skipComments: row.skipComments,
          thumbnailUrl: row.thumbnail
            ? getPublicFileUrl(row.thumbnail, storageUrl)
            : null,
          topics: topicsByPost.get(row.id) ?? [],
          viewsCount: row.viewsCount,
        },
      ]
    })
  }
}

export const channelPostManagementService = new ChannelPostManagementService()
