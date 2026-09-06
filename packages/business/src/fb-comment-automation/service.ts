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
  fbCommentAutomationTypes,
  igCommentAutomationTypes,
  rootFolderId,
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
import { assertDeletable } from "../template/installed-resource.service"

type ListFbCommentsInput = {
  workspaceId: string
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
  folderId?: string | null
  name?: string | null
  isActive?: boolean | null
}

type ListFbCommentsResult = {
  data: FBCommentAutomationModel[]
  pageCount: number
}

function resolveFolderIdFilter(
  folderId?: string | null,
): string | { isNull: true } {
  return !folderId || folderId === rootFolderId ? { isNull: true } : folderId
}

function resolveIsActiveFilter(isActive?: boolean | null): boolean | undefined {
  return isActive !== undefined && isActive !== null ? isActive : undefined
}

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

  async list(input: ListFbCommentsInput): Promise<ListFbCommentsResult> {
    // No folderId in the URL means the root view, which must scope to unfiled
    // automations only — treating it the same as "not filtered at all" (the
    // previous behaviour) surfaced every automation regardless of which folder
    // it had been moved into.
    const where = {
      workspaceId: input.workspaceId,
      type: fbCommentAutomationTypes.enum.messenger,
      folderId: resolveFolderIdFilter(input.folderId),
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

  async listIgComments(
    input: ListFbCommentsInput,
  ): Promise<ListFbCommentsResult> {
    // Same root-folder handling as `list` (mirrors ig-stories' listIgStories).
    const where = {
      workspaceId: input.workspaceId,
      type: { in: [...igCommentAutomationTypes.options] },
      folderId: resolveFolderIdFilter(input.folderId),
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
}

export const fbCommentAutomationService = new FbCommentAutomationService()
