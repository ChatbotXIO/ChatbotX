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
import { fbCommentAutomationTypes } from "@chatbotx.io/database/partials"
import {
  contactInboxModel,
  fbCommentAutomationModel,
  fbCommentAutomationReplyModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { formatInTimeZone } from "date-fns-tz"
import { BaseService } from "../base.service"
import { assertDeletable } from "../template/installed-resource.service"

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

  findActiveAutomations(props: {
    workspaceId: string
    channelType: "messenger" | "instagram" | "instagramFacebook" | "threads"
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

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
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
        ),
      )
  }
}

export const fbCommentAutomationService = new FbCommentAutomationService()
