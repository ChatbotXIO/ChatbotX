import {
  and,
  db,
  eq,
  inArray,
  ne,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import {
  type FBCommentAutomationType,
  fbCommentAutomationTypes,
  type IgCommentAutomationType,
  igCommentAutomationTypes,
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

class FbCommentAutomationService extends BaseService {
  findActiveAutomations(props: {
    workspaceId: string
    channelType: "messenger" | "instagram" | "instagramFacebook"
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
        ...input.data,
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
      .set(data)
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
        ...input.data,
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
      .set(data)
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
}

export const fbCommentAutomationService = new FbCommentAutomationService()
