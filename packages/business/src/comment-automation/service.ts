import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  ne,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  type CommentAutomationType,
  type CommentExcludeKeywordsType,
  type CommentHideComments,
  type CommentIncludeKeywords,
  type CommentReply,
  commentAutomationChannelSupportsHideGif,
  commentAutomationTypes,
  type IgCommentAutomationType,
  igCommentAutomationTypes,
  normalizeReplyTexts,
} from "@chatbotx.io/database/partials"
import {
  commentAutomationModel,
  commentAutomationReplyModel,
  contactInboxModel,
} from "@chatbotx.io/database/schema"
import type { CommentAutomationModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { formatInTimeZone } from "date-fns-tz"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { resolveFolderIdFilter } from "../lib/folder-filter"
import { assertDeletable } from "../template/installed-resource.service"

type ListFbCommentsInput = {
  workspaceId: string
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
  folderId?: string | null
  includeAllFolders?: boolean
  name?: string | null
  isActive?: boolean | null
}

type ListFbCommentsResult = {
  data: CommentAutomationModel[]
  pageCount: number
}

/**
 * The list input for a channel with no folder support (Threads, TikTok).
 *
 * Same request shape the table sends, so pagination and sorting are resolved
 * here rather than in the app layer — a `.query.ts` file is a request adapter,
 * not a place for where-builders or page maths. See `.agents/rules/data-access.md`.
 */
type ListChannelCommentsInput = {
  workspaceId: string
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
  name?: string | null
  isActive?: boolean | null
  tx?: DatabaseClient
}

function resolveIsActiveFilter(isActive?: boolean | null): boolean | undefined {
  return isActive !== undefined && isActive !== null ? isActive : undefined
}

type FbCommentAutomationWriteData = Omit<
  typeof commentAutomationModel.$inferInsert,
  "id" | "workspaceId" | "type"
>

type ThreadsCommentAutomationReply =
  | { type: "none"; value: null }
  | { type: "text"; value: string; values?: { value: string }[] }
  | { type: "flow" | "AIAgent"; value: string }

type ThreadsCommentAutomationPost = {
  type: "all" | "postIds"
  value: string[]
}

type ThreadsCommentAutomationIncludeKeywords = CommentIncludeKeywords

type ThreadsCommentAutomationOptions = {
  replyToNewContactsOnly: boolean
  replyOncePerUserPerPost: boolean
  likeUserComment?: false
  replyToUsersWhoCommentedOnOtherPosts: boolean
  ignoreCommentReplies: boolean
  trackUserTags?: boolean
}

type ThreadsCommentAutomationReplyAfter = {
  type:
    | "immediately"
    | "seconds"
    | "minutes"
    | "hours"
    | "randomWithin3Minutes"
    | "randomWithin5Minutes"
    | "randomWithin10Minutes"
    | "randomWithin20Minutes"
    | "randomWithin30Minutes"
    | "randomWithin60Minutes"
  value: number
}

type CreateThreadsCommentAutomationInput = {
  name: string
  post: ThreadsCommentAutomationPost
  publicReply: ThreadsCommentAutomationReply
  includeKeywords: ThreadsCommentAutomationIncludeKeywords
  excludeKeywords: string[]
  excludeKeywordsType?: CommentExcludeKeywordsType
  options: ThreadsCommentAutomationOptions
  hideComments?: ThreadsCommentAutomationHideComments
  replyAfter: ThreadsCommentAutomationReplyAfter
  isActive?: boolean
}

type UpdateThreadsCommentAutomationInput = Partial<
  Omit<CreateThreadsCommentAutomationInput, "isActive">
> & {
  options?: ThreadsCommentAutomationOptions
  isActive?: boolean
}

/**
 * Threads can hide a top-level reply (`POST /{reply-id}/manage_reply`) and
 * exposes a reply's `gif_url`, but has no image/video attachment lookup.
 */
type ThreadsCommentAutomationHideComments = {
  all: boolean
  hasPhoneNumber: boolean
  hasImage?: false
  hasVideo?: false
  hasLink: boolean
  hasKeywords: boolean
  hasGif?: boolean
  hasEmoji?: boolean
  keywords: string[]
  showCommentsAfter: CommentHideComments["showCommentsAfter"]
}

/**
 * TikTok sits between Threads and the Meta channels: it CAN like and hide a
 * comment (`business/comment/like/`, `business/comment/hide/`) and, through
 * Comment-to-Message, CAN answer one with a DM — but only for comments TikTok
 * itself flags as high intent, and never with a flow (see
 * `buildTiktokPrivateReply`). `trackUserTags` counts `@handle` mentions in the
 * comment text — TikTok's payload carries no structured tag list.
 */
type TiktokCommentAutomationOptions = {
  replyToNewContactsOnly: boolean
  replyOncePerUserPerPost: boolean
  likeUserComment: boolean
  replyToUsersWhoCommentedOnOtherPosts: boolean
  ignoreCommentReplies: boolean
  trackUserTags?: boolean
}

/**
 * The DM half TikTok can actually deliver. `flow` is absent, not optional —
 * Comment-to-Message grants exactly one comment-anchored message per comment
 * and TikTok's flow runner needs a `conversation_id` for every step after the
 * first, which does not exist until the contact replies.
 */
type TiktokCommentAutomationPrivateReply =
  | { type: "none"; value: null }
  | { type: "text"; value: string }
  | { type: "AIAgent"; value: string }

type TiktokCommentAutomationHideComments = {
  all: boolean
  hasPhoneNumber: boolean
  /** Always false: the attachment lookup behind these two is messenger-only. */
  hasImage?: false
  hasVideo?: false
  hasLink: boolean
  hasKeywords: boolean
  /** Always false: TikTok exposes no attachment data to detect a GIF with. */
  hasGif?: false
  hasEmoji?: boolean
  keywords: string[]
  showCommentsAfter: CommentHideComments["showCommentsAfter"]
}

type CreateTiktokCommentAutomationInput = {
  name: string
  post: ThreadsCommentAutomationPost
  publicReply: ThreadsCommentAutomationReply
  privateReply?: TiktokCommentAutomationPrivateReply
  includeKeywords: ThreadsCommentAutomationIncludeKeywords
  excludeKeywords: string[]
  excludeKeywordsType?: CommentExcludeKeywordsType
  options: TiktokCommentAutomationOptions
  hideComments?: TiktokCommentAutomationHideComments
  replyAfter: ThreadsCommentAutomationReplyAfter
  isActive?: boolean
}

type UpdateTiktokCommentAutomationInput = Partial<
  Omit<CreateTiktokCommentAutomationInput, "isActive">
> & {
  options?: TiktokCommentAutomationOptions
  isActive?: boolean
}

class CommentAutomationService extends BaseService {
  private readonly threadsType = commentAutomationTypes.enum.threads

  private readonly threadsDefaults = {
    privateReply: { type: "none", value: null } as {
      type: "none"
      value: null
    },
    options: {
      replyToNewContactsOnly: false,
      replyOncePerUserPerPost: false,
      likeUserComment: false,
      replyToUsersWhoCommentedOnOtherPosts: true,
      ignoreCommentReplies: true,
      trackUserTags: false,
    } as {
      replyToNewContactsOnly: boolean
      replyOncePerUserPerPost: boolean
      likeUserComment: false
      replyToUsersWhoCommentedOnOtherPosts: boolean
      ignoreCommentReplies: boolean
      trackUserTags: boolean
    },
    hideComments: {
      all: false,
      hasPhoneNumber: false,
      hasImage: false,
      hasVideo: false,
      hasLink: false,
      hasKeywords: false,
      hasGif: false,
      hasEmoji: false,
      keywords: [] as string[],
      showCommentsAfter: "none",
    } as CommentHideComments,
    replyAfter: { type: "immediately", value: 0 } as {
      type: "immediately"
      value: number
    },
  }

  private buildThreadsOptions(input?: ThreadsCommentAutomationOptions) {
    return {
      ...this.threadsDefaults.options,
      replyToNewContactsOnly: input?.replyToNewContactsOnly ?? false,
      replyOncePerUserPerPost: input?.replyOncePerUserPerPost ?? false,
      replyToUsersWhoCommentedOnOtherPosts:
        input?.replyToUsersWhoCommentedOnOtherPosts ?? true,
      ignoreCommentReplies: input?.ignoreCommentReplies ?? true,
      trackUserTags: input?.trackUserTags ?? false,
    }
  }

  /**
   * `hasImage`/`hasVideo` are pinned off: the attachment lookup behind them is
   * Messenger-only. `hasGif` stays settable — Threads answers it from the
   * reply's `gif_url`.
   */
  private buildThreadsHideComments(
    input?: ThreadsCommentAutomationHideComments,
  ): CommentHideComments {
    if (!input) {
      return this.threadsDefaults.hideComments
    }
    return {
      all: input.all ?? false,
      hasPhoneNumber: input.hasPhoneNumber ?? false,
      hasImage: false,
      hasVideo: false,
      hasLink: input.hasLink ?? false,
      hasKeywords: input.hasKeywords ?? false,
      hasGif: input.hasGif ?? false,
      hasEmoji: input.hasEmoji ?? false,
      keywords: input.keywords ?? [],
      showCommentsAfter: input.showCommentsAfter ?? "none",
    }
  }

  private readonly tiktokType = commentAutomationTypes.enum.tiktok

  private readonly tiktokDefaults = {
    privateReply: { type: "none", value: null } as {
      type: "none"
      value: null
    },
    hideComments: {
      all: false,
      hasPhoneNumber: false,
      hasImage: false,
      hasVideo: false,
      hasLink: false,
      hasKeywords: false,
      hasGif: false,
      hasEmoji: false,
      keywords: [] as string[],
      showCommentsAfter: "none",
    } as CommentHideComments,
    replyAfter: { type: "immediately", value: 0 } as {
      type: "immediately"
      value: number
    },
  }

  /**
   * Forces the unsupported flags off on every write, so a request that sets
   * them — by hand, or from a form that drifted — cannot enable a capability
   * TikTok does not have. `likeUserComment` is NOT forced: TikTok supports it.
   */
  private buildTiktokOptions(input?: TiktokCommentAutomationOptions) {
    return {
      replyToNewContactsOnly: input?.replyToNewContactsOnly ?? false,
      replyOncePerUserPerPost: input?.replyOncePerUserPerPost ?? false,
      likeUserComment: input?.likeUserComment ?? false,
      replyToUsersWhoCommentedOnOtherPosts:
        input?.replyToUsersWhoCommentedOnOtherPosts ?? true,
      ignoreCommentReplies: input?.ignoreCommentReplies ?? true,
      trackUserTags: input?.trackUserTags ?? false,
    }
  }

  /**
   * Normalises the DM branch to what TikTok can deliver.
   *
   * A stored `flow` — from a row written before this channel had a private
   * branch, or from a request built by hand — is forced to `none` rather than
   * rejected: the automation's public half should still run. `executePrivateReply`
   * refuses the same shape again on the worker side, so the two cannot drift
   * into a flow that sends its first step and then fails.
   */
  private buildTiktokPrivateReply(
    input?: TiktokCommentAutomationPrivateReply,
  ): TiktokCommentAutomationPrivateReply {
    if (input?.type === "text" || input?.type === "AIAgent") {
      return input
    }
    return this.tiktokDefaults.privateReply
  }

  /**
   * `hasImage`/`hasVideo`/`hasGif` are pinned off: TikTok exposes no
   * attachment data, so a switch for them would silently never match.
   */
  private buildTiktokHideComments(
    input?: TiktokCommentAutomationHideComments,
  ): CommentHideComments {
    if (!input) {
      return this.tiktokDefaults.hideComments
    }
    return {
      all: input.all ?? false,
      hasPhoneNumber: input.hasPhoneNumber ?? false,
      hasImage: false,
      hasVideo: false,
      hasLink: input.hasLink ?? false,
      hasKeywords: input.hasKeywords ?? false,
      hasGif: false,
      hasEmoji: input.hasEmoji ?? false,
      keywords: input.keywords ?? [],
      showCommentsAfter: input.showCommentsAfter ?? "none",
    }
  }

  findActiveAutomations(props: {
    workspaceId: string
    channelType: CommentAutomationType
  }) {
    return db.query.commentAutomationModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        isActive: true,
        type: props.channelType,
      },
    })
  }

  isWithinSchedule(
    automation: { startTime: string | null; endTime: string | null },
    timezone: string,
  ): boolean {
    const { startTime, endTime } = automation
    if (!(startTime && endTime)) {
      return true
    }
    const currentTime = formatInTimeZone(new Date(), timezone, "HH:mm")

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime
    }

    // Overnight window (endTime is earlier than startTime, e.g. 22:00-06:00).
    return currentTime >= startTime || currentTime <= endTime
  }

  getPriorContactInboxCount(props: { contactId: string }) {
    return db.$count(
      contactInboxModel,
      eq(contactInboxModel.contactId, props.contactId),
    )
  }

  findDedup(props: {
    automationId: string
    contactId: string
    postId: string
  }) {
    return db.query.commentAutomationReplyModel.findFirst({
      where: {
        automationId: props.automationId,
        contactId: props.contactId,
        postId: props.postId,
      },
    })
  }

  async insertDedup(props: {
    automationId: string
    contactId: string
    postId: string
    workspaceId: string
  }) {
    await db
      .insert(commentAutomationReplyModel)
      .values({ id: createId(), ...props })
      .onConflictDoNothing()
  }

  /**
   * Rolls back a dedup row written at dispatch time. `processCommentAutomation`
   * inserts the row as soon as a reply is *enqueued* (so a duplicate webhook —
   * common on ads/boosted posts — cannot trigger a second reply), which means an
   * async reply job that later gives up without delivering anything would leave
   * the contact permanently blocked by `replyOncePerUserPerPost`. A job that
   * bails out calls this so the next comment gets another chance.
   */
  async deleteDedup(props: {
    automationId: string
    contactId: string
    postId: string
  }) {
    await db
      .delete(commentAutomationReplyModel)
      .where(
        and(
          eq(commentAutomationReplyModel.automationId, props.automationId),
          eq(commentAutomationReplyModel.contactId, props.contactId),
          eq(commentAutomationReplyModel.postId, props.postId),
        ),
      )
  }

  async hasRepliedOnOtherPost(props: {
    automationId: string
    contactId: string
    postId: string
  }): Promise<boolean> {
    const rows = await db
      .select({ one: sql`1` })
      .from(commentAutomationReplyModel)
      .where(
        and(
          eq(commentAutomationReplyModel.automationId, props.automationId),
          eq(commentAutomationReplyModel.contactId, props.contactId),
          ne(commentAutomationReplyModel.postId, props.postId),
        ),
      )
      .limit(1)
    return rows.length > 0
  }

  async incrementRepliesCount(automationId: string) {
    await db
      .update(commentAutomationModel)
      .set({
        repliesCount: sql`${commentAutomationModel.repliesCount} + 1`,
      })
      .where(eq(commentAutomationModel.id, automationId))
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
    types: CommentAutomationType[]
  }): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await assertDeletable({
      workspaceId: input.workspaceId,
      resourceKind: "fbCommentAutomation",
      resourceIds: input.ids,
    })
    await db
      .delete(commentAutomationModel)
      .where(
        and(
          eq(commentAutomationModel.workspaceId, input.workspaceId),
          inArray(commentAutomationModel.id, input.ids),
          inArray(commentAutomationModel.type, input.types),
        ),
      )
  }

  async list(input: ListFbCommentsInput): Promise<ListFbCommentsResult> {
    // No folderId in the URL means the root view, which must scope to unfiled
    // automations only — treating it the same as "not filtered at all" (the
    // previous behaviour) surfaced every automation regardless of which folder
    // it had been moved into.
    const where = {
      workspaceId: input.workspaceId,
      type: commentAutomationTypes.enum.messenger,
      folderId: resolveFolderIdFilter(input.folderId, input.includeAllFolders),
      name: input.name ? { ilike: likeContains(input.name) } : undefined,
      isActive: resolveIsActiveFilter(input.isActive),
    }

    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(commentAutomationModel, input)

    const [data, total] = await Promise.all([
      db.query.commentAutomationModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      db.$count(
        commentAutomationModel,
        relationsFilterToSQL(commentAutomationModel, where),
      ),
    ])

    const pageCount = Math.ceil(total / pagination.limit)

    return { data, pageCount }
  }

  async findMessengerOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<CommentAutomationModel> {
    const record = await db.query.commentAutomationModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        type: commentAutomationTypes.enum.messenger,
      },
    })

    if (!record) {
      throw notFoundException("FB Comment Automation not found")
    }

    return record
  }

  /**
   * Keeps a reply's `value` and `values` describing the same thing on the way
   * in — see `normalizeReplyTexts`.
   *
   * Applied HERE rather than at each caller because every write to this table
   * funnels through the four methods below: the builder actions, the private
   * and public APIs, and the template installer. Normalizing per call site left
   * the installer out, which quietly wrote drifted rows — and a row whose
   * `value` disagrees with its `values` sends the wrong text with no error.
   */
  private withNormalizedReplies<
    T extends Partial<FbCommentAutomationWriteData>,
  >(data: T): T {
    if (!data.publicReply) {
      return data
    }
    return { ...data, publicReply: normalizeReplyTexts(data.publicReply) }
  }

  async createMessenger(input: {
    workspaceId: string
    data: FbCommentAutomationWriteData
  }): Promise<CommentAutomationModel> {
    const [created] = await db
      .insert(commentAutomationModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        type: commentAutomationTypes.enum.messenger,
        ...this.withNormalizedReplies(input.data),
      })
      .returning()
    return created
  }

  async updateMessenger(
    ctx: { workspaceId: string; id: string },
    data: Partial<FbCommentAutomationWriteData>,
  ): Promise<CommentAutomationModel> {
    await this.findMessengerOrFail(ctx)

    const [updated] = await db
      .update(commentAutomationModel)
      .set(this.withNormalizedReplies(data))
      .where(
        and(
          eq(commentAutomationModel.id, ctx.id),
          eq(commentAutomationModel.workspaceId, ctx.workspaceId),
          eq(
            commentAutomationModel.type,
            commentAutomationTypes.enum.messenger,
          ),
        ),
      )
      .returning()
    return updated
  }

  async deleteMessenger(input: {
    workspaceId: string
    id: string
  }): Promise<void> {
    await this.findMessengerOrFail(input)
    await this.deleteMany({
      workspaceId: input.workspaceId,
      ids: [input.id],
      types: [commentAutomationTypes.enum.messenger],
    })
  }

  async listIgComments(
    input: ListFbCommentsInput,
  ): Promise<ListFbCommentsResult> {
    // Same root-folder handling as `list` (mirrors ig-stories' listIgStories).
    const where = {
      workspaceId: input.workspaceId,
      type: { in: [...igCommentAutomationTypes.options] },
      folderId: resolveFolderIdFilter(input.folderId, input.includeAllFolders),
      name: input.name ? { ilike: likeContains(input.name) } : undefined,
      isActive: resolveIsActiveFilter(input.isActive),
    }

    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(commentAutomationModel, input)

    const [data, total] = await Promise.all([
      db.query.commentAutomationModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      db.$count(
        commentAutomationModel,
        relationsFilterToSQL(commentAutomationModel, where),
      ),
    ])

    const pageCount = Math.ceil(total / pagination.limit)

    return { data, pageCount }
  }

  async findInstagramOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<CommentAutomationModel> {
    const record = await db.query.commentAutomationModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        type: { in: [...igCommentAutomationTypes.options] },
      },
    })

    if (!record) {
      throw notFoundException("Instagram Comment Automation not found")
    }

    return record
  }

  /**
   * Pins `hideComments.hasGif` off on a channel that cannot detect a GIF, so
   * a request that sets it — by hand through the public API or MCP, or from a
   * form that drifted — cannot store a switch that silently never matches.
   * Same idea as `buildTiktokHideComments`, for the channels whose write data
   * is otherwise passed through as-is.
   */
  private withSupportedHideComments<
    T extends { hideComments?: CommentHideComments | null },
  >(type: CommentAutomationType, data: T): T {
    if (!data.hideComments || commentAutomationChannelSupportsHideGif(type)) {
      return data
    }
    return { ...data, hideComments: { ...data.hideComments, hasGif: false } }
  }

  async createInstagram(input: {
    workspaceId: string
    type: IgCommentAutomationType
    data: FbCommentAutomationWriteData
  }): Promise<CommentAutomationModel> {
    const [created] = await db
      .insert(commentAutomationModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        type: input.type,
        ...this.withSupportedHideComments(
          input.type,
          this.withNormalizedReplies(input.data),
        ),
      })
      .returning()
    return created
  }

  async updateInstagram(
    ctx: { workspaceId: string; id: string },
    data: Partial<FbCommentAutomationWriteData>,
  ): Promise<CommentAutomationModel> {
    const existing = await this.findInstagramOrFail(ctx)

    const [updated] = await db
      .update(commentAutomationModel)
      .set(
        this.withSupportedHideComments(
          // `findInstagramOrFail` only matches `igCommentAutomationTypes`.
          existing.type as IgCommentAutomationType,
          this.withNormalizedReplies(data),
        ),
      )
      .where(
        and(
          eq(commentAutomationModel.id, ctx.id),
          eq(commentAutomationModel.workspaceId, ctx.workspaceId),
          inArray(
            commentAutomationModel.type,
            igCommentAutomationTypes.options,
          ),
        ),
      )
      .returning()
    return updated
  }

  async deleteInstagram(input: {
    workspaceId: string
    id: string
  }): Promise<void> {
    await this.findInstagramOrFail(input)
    await this.deleteMany({
      workspaceId: input.workspaceId,
      ids: [input.id],
      types: [...igCommentAutomationTypes.options],
    })
  }

  async listThreadsAutomations(props: {
    workspaceId: string
    name?: string
    isActive?: boolean
    limit: number
    offset: number
    orderBy?: Record<string, unknown>
    tx?: DatabaseClient
  }) {
    const {
      workspaceId,
      name,
      isActive,
      limit,
      offset,
      orderBy = { createdAt: "desc" },
      tx = db,
    } = props
    const where = {
      workspaceId,
      type: this.threadsType,
      isActive,
      name: name
        ? {
            ilike: `%${name}%`,
          }
        : undefined,
    }

    const [data, total] = await Promise.all([
      tx.query.commentAutomationModel.findMany({
        where,
        orderBy,
        limit,
        offset,
      }),
      tx.$count(
        commentAutomationModel,
        relationsFilterToSQL(commentAutomationModel, where),
      ),
    ])

    return {
      data,
      total,
    }
  }

  getThreadsAutomation(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }) {
    const { workspaceId, id, tx = db } = props
    return tx.query.commentAutomationModel.findFirst({
      where: {
        workspaceId,
        type: this.threadsType,
        id,
      },
    })
  }

  async createThreadsAutomation(props: {
    workspaceId: string
    data: CreateThreadsCommentAutomationInput
    tx?: DatabaseClient
  }) {
    const { workspaceId, data, tx = db } = props
    const [record] = await tx
      .insert(commentAutomationModel)
      .values({
        id: createId(),
        workspaceId,
        type: this.threadsType,
        isActive: data.isActive ?? true,
        name: data.name,
        post: data.post,
        privateReply: this.threadsDefaults.privateReply,
        publicReply: normalizeReplyTexts(data.publicReply as CommentReply),
        includeKeywords: data.includeKeywords,
        excludeKeywords: data.excludeKeywords,
        excludeKeywordsType: data.excludeKeywordsType ?? "contain",
        options: this.buildThreadsOptions(data.options),
        hideComments: this.buildThreadsHideComments(data.hideComments),
        replyAfter: data.replyAfter ?? this.threadsDefaults.replyAfter,
      })
      .returning()

    return record
  }

  async updateThreadsAutomation(props: {
    workspaceId: string
    id: string
    data: UpdateThreadsCommentAutomationInput
    tx?: DatabaseClient
  }) {
    const { workspaceId, id, data, tx = db } = props
    const values: Record<string, unknown> = {}

    if (data.name !== undefined) {
      values.name = data.name
    }
    if (data.isActive !== undefined) {
      values.isActive = data.isActive
    }
    if (data.post !== undefined) {
      values.post = data.post
    }
    if (data.publicReply !== undefined) {
      values.publicReply = normalizeReplyTexts(data.publicReply as CommentReply)
    }
    if (data.includeKeywords !== undefined) {
      values.includeKeywords = data.includeKeywords
    }
    if (data.excludeKeywords !== undefined) {
      values.excludeKeywords = data.excludeKeywords
    }
    if (data.excludeKeywordsType !== undefined) {
      values.excludeKeywordsType = data.excludeKeywordsType
    }
    if (data.options !== undefined) {
      values.options = this.buildThreadsOptions(data.options)
    }
    if (data.hideComments !== undefined) {
      values.hideComments = this.buildThreadsHideComments(data.hideComments)
    }
    if (data.replyAfter !== undefined) {
      values.replyAfter = data.replyAfter
    }

    const [record] = await tx
      .update(commentAutomationModel)
      .set(values)
      .where(
        and(
          eq(commentAutomationModel.id, id),
          eq(commentAutomationModel.workspaceId, workspaceId),
          eq(commentAutomationModel.type, this.threadsType),
        ),
      )
      .returning()

    return record
  }

  async deleteThreadsAutomation(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }) {
    const { workspaceId, id, tx = db } = props
    const [record] = await tx
      .delete(commentAutomationModel)
      .where(
        and(
          eq(commentAutomationModel.id, id),
          eq(commentAutomationModel.workspaceId, workspaceId),
          eq(commentAutomationModel.type, this.threadsType),
        ),
      )
      .returning({ id: commentAutomationModel.id })

    return record ?? null
  }

  async listTiktokAutomations(
    input: ListChannelCommentsInput,
  ): Promise<ListFbCommentsResult> {
    const { tx = db } = input
    const where = {
      workspaceId: input.workspaceId,
      type: this.tiktokType,
      isActive: resolveIsActiveFilter(input.isActive),
      name: input.name ? { ilike: likeContains(input.name) } : undefined,
    }

    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(commentAutomationModel, input)

    const [data, total] = await Promise.all([
      tx.query.commentAutomationModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      tx.$count(
        commentAutomationModel,
        relationsFilterToSQL(commentAutomationModel, where),
      ),
    ])

    return { data, pageCount: Math.ceil(total / pagination.limit) }
  }

  getTiktokAutomation(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }) {
    const { workspaceId, id, tx = db } = props
    return tx.query.commentAutomationModel.findFirst({
      where: {
        workspaceId,
        type: this.tiktokType,
        id,
      },
    })
  }

  async createTiktokAutomation(props: {
    workspaceId: string
    data: CreateTiktokCommentAutomationInput
    tx?: DatabaseClient
  }) {
    const { workspaceId, data, tx = db } = props
    const [record] = await tx
      .insert(commentAutomationModel)
      .values({
        id: createId(),
        workspaceId,
        type: this.tiktokType,
        isActive: data.isActive ?? true,
        name: data.name,
        post: data.post,
        privateReply: this.buildTiktokPrivateReply(data.privateReply),
        publicReply: normalizeReplyTexts(data.publicReply as CommentReply),
        includeKeywords: data.includeKeywords,
        excludeKeywords: data.excludeKeywords,
        excludeKeywordsType: data.excludeKeywordsType ?? "contain",
        options: this.buildTiktokOptions(data.options),
        hideComments: this.buildTiktokHideComments(data.hideComments),
        replyAfter: data.replyAfter ?? this.tiktokDefaults.replyAfter,
      })
      .returning()

    return record
  }

  async updateTiktokAutomation(props: {
    workspaceId: string
    id: string
    data: UpdateTiktokCommentAutomationInput
    tx?: DatabaseClient
  }) {
    const { workspaceId, id, data, tx = db } = props
    const values: Record<string, unknown> = {}

    if (data.name !== undefined) {
      values.name = data.name
    }
    if (data.isActive !== undefined) {
      values.isActive = data.isActive
    }
    if (data.post !== undefined) {
      values.post = data.post
    }
    if (data.publicReply !== undefined) {
      values.publicReply = normalizeReplyTexts(data.publicReply as CommentReply)
    }
    if (data.privateReply !== undefined) {
      values.privateReply = this.buildTiktokPrivateReply(data.privateReply)
    }
    if (data.includeKeywords !== undefined) {
      values.includeKeywords = data.includeKeywords
    }
    if (data.excludeKeywords !== undefined) {
      values.excludeKeywords = data.excludeKeywords
    }
    if (data.excludeKeywordsType !== undefined) {
      values.excludeKeywordsType = data.excludeKeywordsType
    }
    if (data.options !== undefined) {
      values.options = this.buildTiktokOptions(data.options)
    }
    if (data.hideComments !== undefined) {
      values.hideComments = this.buildTiktokHideComments(data.hideComments)
    }
    if (data.replyAfter !== undefined) {
      values.replyAfter = data.replyAfter
    }

    const [record] = await tx
      .update(commentAutomationModel)
      .set(values)
      .where(
        and(
          eq(commentAutomationModel.id, id),
          eq(commentAutomationModel.workspaceId, workspaceId),
          eq(commentAutomationModel.type, this.tiktokType),
        ),
      )
      .returning()

    return record
  }

  async deleteTiktokAutomation(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }) {
    const { workspaceId, id, tx = db } = props
    const [record] = await tx
      .delete(commentAutomationModel)
      .where(
        and(
          eq(commentAutomationModel.id, id),
          eq(commentAutomationModel.workspaceId, workspaceId),
          eq(commentAutomationModel.type, this.tiktokType),
        ),
      )
      .returning({ id: commentAutomationModel.id })

    return record ?? null
  }
}

export const commentAutomationService = new CommentAutomationService()
