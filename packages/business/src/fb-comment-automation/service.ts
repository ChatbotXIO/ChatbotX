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
  type FBCommentAutomationType,
  type FBCommentHideComments,
  fbCommentAutomationTypes,
  type IgCommentAutomationType,
  igCommentAutomationTypes,
  normalizeReplyTexts,
} from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  fbCommentAutomationModel,
  fbCommentAutomationReplyModel,
} from "@chatbotx.io/database/schema"
import type { FBCommentAutomationModel } from "@chatbotx.io/database/types"
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
  data: FBCommentAutomationModel[]
  pageCount: number
}

function resolveIsActiveFilter(isActive?: boolean | null): boolean | undefined {
  return isActive !== undefined && isActive !== null ? isActive : undefined
}

type FbCommentAutomationWriteData = Omit<
  typeof fbCommentAutomationModel.$inferInsert,
  "id" | "workspaceId" | "type"
>

type ThreadsCommentAutomationReply =
  | { type: "none"; value: null }
  | { type: "text" | "flow" | "AIAgent"; value: string }

type ThreadsCommentAutomationPost = {
  type: "all" | "postIds"
  value: string[]
}

type ThreadsCommentAutomationIncludeKeywords = {
  type: "all" | "equal" | "contain"
  value: string[]
}

type ThreadsCommentAutomationOptions = {
  replyToNewContactsOnly: boolean
  replyOncePerUserPerPost: boolean
  likeUserComment?: false
  replyToUsersWhoCommentedOnOtherPosts: boolean
  ignoreCommentReplies: boolean
  trackUserTags?: false
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
  options: ThreadsCommentAutomationOptions
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
 * TikTok sits between Threads and the Meta channels: it CAN like and hide a
 * comment (`business/comment/like/`, `business/comment/hide/`), but it has no
 * comment-anchored DM, so `privateReply` is pinned off the way Threads pins it.
 * `trackUserTags` is off too — TikTok's comment payload carries no tagged users
 * in any form, structured or in the text.
 */
type TiktokCommentAutomationOptions = {
  replyToNewContactsOnly: boolean
  replyOncePerUserPerPost: boolean
  likeUserComment: boolean
  replyToUsersWhoCommentedOnOtherPosts: boolean
  ignoreCommentReplies: boolean
  trackUserTags?: false
}

type TiktokCommentAutomationHideComments = {
  all: boolean
  hasPhoneNumber: boolean
  /** Always false: the attachment lookup behind these two is messenger-only. */
  hasImage?: false
  hasVideo?: false
  hasLink: boolean
  hasKeywords: boolean
  keywords: string[]
  showCommentsAfter: FBCommentHideComments["showCommentsAfter"]
}

type CreateTiktokCommentAutomationInput = {
  name: string
  post: ThreadsCommentAutomationPost
  publicReply: ThreadsCommentAutomationReply
  includeKeywords: ThreadsCommentAutomationIncludeKeywords
  excludeKeywords: string[]
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

class FbCommentAutomationService extends BaseService {
  private readonly threadsType = fbCommentAutomationTypes.enum.threads

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
      trackUserTags: false
    },
    hideComments: {
      all: false,
      hasPhoneNumber: false,
      hasImage: false,
      hasVideo: false,
      hasLink: false,
      hasKeywords: false,
      keywords: [] as string[],
      showCommentsAfter: "none",
    } as {
      all: false
      hasPhoneNumber: false
      hasImage: false
      hasVideo: false
      hasLink: false
      hasKeywords: false
      keywords: string[]
      showCommentsAfter: "none"
    },
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
    }
  }

  private readonly tiktokType = fbCommentAutomationTypes.enum.tiktok

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
      keywords: [] as string[],
      showCommentsAfter: "none",
    } as FBCommentHideComments,
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
      trackUserTags: false as const,
    }
  }

  /**
   * `hasImage`/`hasVideo` are pinned off: they are answered by
   * `comment-attachment.ts`, which only knows how to ask Messenger. Leaving
   * them settable would render a switch that silently never matches.
   */
  private buildTiktokHideComments(
    input?: TiktokCommentAutomationHideComments,
  ): FBCommentHideComments {
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
      keywords: input.keywords ?? [],
      showCommentsAfter: input.showCommentsAfter ?? "none",
    }
  }

  findActiveAutomations(props: {
    workspaceId: string
    channelType: FBCommentAutomationType
  }) {
    return db.query.fbCommentAutomationModel.findMany({
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
    return db.query.fbCommentAutomationReplyModel.findFirst({
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
      .insert(fbCommentAutomationReplyModel)
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
      .delete(fbCommentAutomationReplyModel)
      .where(
        and(
          eq(fbCommentAutomationReplyModel.automationId, props.automationId),
          eq(fbCommentAutomationReplyModel.contactId, props.contactId),
          eq(fbCommentAutomationReplyModel.postId, props.postId),
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
      .from(fbCommentAutomationReplyModel)
      .where(
        and(
          eq(fbCommentAutomationReplyModel.automationId, props.automationId),
          eq(fbCommentAutomationReplyModel.contactId, props.contactId),
          ne(fbCommentAutomationReplyModel.postId, props.postId),
        ),
      )
      .limit(1)
    return rows.length > 0
  }

  async incrementRepliesCount(automationId: string) {
    await db
      .update(fbCommentAutomationModel)
      .set({
        repliesCount: sql`${fbCommentAutomationModel.repliesCount} + 1`,
      })
      .where(eq(fbCommentAutomationModel.id, automationId))
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
    types: FBCommentAutomationType[]
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
      .delete(fbCommentAutomationModel)
      .where(
        and(
          eq(fbCommentAutomationModel.workspaceId, input.workspaceId),
          inArray(fbCommentAutomationModel.id, input.ids),
          inArray(fbCommentAutomationModel.type, input.types),
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
      type: fbCommentAutomationTypes.enum.messenger,
      folderId: resolveFolderIdFilter(input.folderId, input.includeAllFolders),
      name: input.name ? { ilike: likeContains(input.name) } : undefined,
      isActive: resolveIsActiveFilter(input.isActive),
    }

    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(fbCommentAutomationModel, input)

    const [data, total] = await Promise.all([
      db.query.fbCommentAutomationModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      db.$count(
        fbCommentAutomationModel,
        relationsFilterToSQL(fbCommentAutomationModel, where),
      ),
    ])

    const pageCount = Math.ceil(total / pagination.limit)

    return { data, pageCount }
  }

  async findMessengerOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<FBCommentAutomationModel> {
    const record = await db.query.fbCommentAutomationModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        type: fbCommentAutomationTypes.enum.messenger,
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
  }): Promise<FBCommentAutomationModel> {
    const [created] = await db
      .insert(fbCommentAutomationModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        type: fbCommentAutomationTypes.enum.messenger,
        ...this.withNormalizedReplies(input.data),
      })
      .returning()
    return created
  }

  async updateMessenger(
    ctx: { workspaceId: string; id: string },
    data: Partial<FbCommentAutomationWriteData>,
  ): Promise<FBCommentAutomationModel> {
    await this.findMessengerOrFail(ctx)

    const [updated] = await db
      .update(fbCommentAutomationModel)
      .set(this.withNormalizedReplies(data))
      .where(
        and(
          eq(fbCommentAutomationModel.id, ctx.id),
          eq(fbCommentAutomationModel.workspaceId, ctx.workspaceId),
          eq(
            fbCommentAutomationModel.type,
            fbCommentAutomationTypes.enum.messenger,
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
      types: [fbCommentAutomationTypes.enum.messenger],
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
    const orderBy = parseOrderByAsObject(fbCommentAutomationModel, input)

    const [data, total] = await Promise.all([
      db.query.fbCommentAutomationModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      db.$count(
        fbCommentAutomationModel,
        relationsFilterToSQL(fbCommentAutomationModel, where),
      ),
    ])

    const pageCount = Math.ceil(total / pagination.limit)

    return { data, pageCount }
  }

  async findInstagramOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<FBCommentAutomationModel> {
    const record = await db.query.fbCommentAutomationModel.findFirst({
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

  async createInstagram(input: {
    workspaceId: string
    type: IgCommentAutomationType
    data: FbCommentAutomationWriteData
  }): Promise<FBCommentAutomationModel> {
    const [created] = await db
      .insert(fbCommentAutomationModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        type: input.type,
        ...this.withNormalizedReplies(input.data),
      })
      .returning()
    return created
  }

  async updateInstagram(
    ctx: { workspaceId: string; id: string },
    data: Partial<FbCommentAutomationWriteData>,
  ): Promise<FBCommentAutomationModel> {
    await this.findInstagramOrFail(ctx)

    const [updated] = await db
      .update(fbCommentAutomationModel)
      .set(this.withNormalizedReplies(data))
      .where(
        and(
          eq(fbCommentAutomationModel.id, ctx.id),
          eq(fbCommentAutomationModel.workspaceId, ctx.workspaceId),
          inArray(
            fbCommentAutomationModel.type,
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
      tx.query.fbCommentAutomationModel.findMany({
        where,
        orderBy,
        limit,
        offset,
      }),
      tx.$count(
        fbCommentAutomationModel,
        relationsFilterToSQL(fbCommentAutomationModel, where),
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
    return tx.query.fbCommentAutomationModel.findFirst({
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
      .insert(fbCommentAutomationModel)
      .values({
        id: createId(),
        workspaceId,
        type: this.threadsType,
        isActive: data.isActive ?? true,
        name: data.name,
        post: data.post,
        privateReply: this.threadsDefaults.privateReply,
        publicReply: data.publicReply,
        includeKeywords: data.includeKeywords,
        excludeKeywords: data.excludeKeywords,
        options: this.buildThreadsOptions(data.options),
        hideComments: this.threadsDefaults.hideComments,
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
      values.publicReply = data.publicReply
    }
    if (data.includeKeywords !== undefined) {
      values.includeKeywords = data.includeKeywords
    }
    if (data.excludeKeywords !== undefined) {
      values.excludeKeywords = data.excludeKeywords
    }
    if (data.options !== undefined) {
      values.options = this.buildThreadsOptions(data.options)
    }
    if (data.replyAfter !== undefined) {
      values.replyAfter = data.replyAfter
    }

    const [record] = await tx
      .update(fbCommentAutomationModel)
      .set(values)
      .where(
        and(
          eq(fbCommentAutomationModel.id, id),
          eq(fbCommentAutomationModel.workspaceId, workspaceId),
          eq(fbCommentAutomationModel.type, this.threadsType),
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
      .delete(fbCommentAutomationModel)
      .where(
        and(
          eq(fbCommentAutomationModel.id, id),
          eq(fbCommentAutomationModel.workspaceId, workspaceId),
          eq(fbCommentAutomationModel.type, this.threadsType),
        ),
      )
      .returning({ id: fbCommentAutomationModel.id })

    return record ?? null
  }

  async listTiktokAutomations(props: {
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
      type: this.tiktokType,
      isActive,
      name: name
        ? {
            ilike: `%${name}%`,
          }
        : undefined,
    }

    const [data, total] = await Promise.all([
      tx.query.fbCommentAutomationModel.findMany({
        where,
        orderBy,
        limit,
        offset,
      }),
      tx.$count(
        fbCommentAutomationModel,
        relationsFilterToSQL(fbCommentAutomationModel, where),
      ),
    ])

    return {
      data,
      total,
    }
  }

  getTiktokAutomation(props: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }) {
    const { workspaceId, id, tx = db } = props
    return tx.query.fbCommentAutomationModel.findFirst({
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
      .insert(fbCommentAutomationModel)
      .values({
        id: createId(),
        workspaceId,
        type: this.tiktokType,
        isActive: data.isActive ?? true,
        name: data.name,
        post: data.post,
        privateReply: this.tiktokDefaults.privateReply,
        publicReply: data.publicReply,
        includeKeywords: data.includeKeywords,
        excludeKeywords: data.excludeKeywords,
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
      values.publicReply = data.publicReply
    }
    if (data.includeKeywords !== undefined) {
      values.includeKeywords = data.includeKeywords
    }
    if (data.excludeKeywords !== undefined) {
      values.excludeKeywords = data.excludeKeywords
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
      .update(fbCommentAutomationModel)
      .set(values)
      .where(
        and(
          eq(fbCommentAutomationModel.id, id),
          eq(fbCommentAutomationModel.workspaceId, workspaceId),
          eq(fbCommentAutomationModel.type, this.tiktokType),
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
      .delete(fbCommentAutomationModel)
      .where(
        and(
          eq(fbCommentAutomationModel.id, id),
          eq(fbCommentAutomationModel.workspaceId, workspaceId),
          eq(fbCommentAutomationModel.type, this.tiktokType),
        ),
      )
      .returning({ id: fbCommentAutomationModel.id })

    return record ?? null
  }
}

export const fbCommentAutomationService = new FbCommentAutomationService()
