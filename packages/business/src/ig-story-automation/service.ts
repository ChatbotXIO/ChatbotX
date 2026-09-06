import { db, eq, relationsFilterToSQL, sql } from "@chatbotx.io/database/client"
import {
  igStoryAutomationTypes,
  rootFolderId,
} from "@chatbotx.io/database/partials"
import { igStoryAutomationModel } from "@chatbotx.io/database/schema"
import type { IgStoryAutomationModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

type ListIgStoriesInput = {
  workspaceId: string
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
  folderId?: string | null
  name?: string | null
  isActive?: boolean | null
}

type ListIgStoriesResult = {
  data: IgStoryAutomationModel[]
  pageCount: number
}

class IgStoryAutomationService extends BaseService {
  findActiveAutomations(props: {
    workspaceId: string
    channelType: "instagram" | "instagramFacebook"
  }) {
    return db.query.igStoryAutomationModel.findMany({
      where: {
        workspaceId: props.workspaceId,
        isActive: true,
        type: props.channelType,
      },
    })
  }

  async incrementRepliesCount(automationId: string) {
    await db
      .update(igStoryAutomationModel)
      .set({
        repliesCount: sql`${igStoryAutomationModel.repliesCount} + 1`,
      })
      .where(eq(igStoryAutomationModel.id, automationId))
  }

  async list(input: ListIgStoriesInput): Promise<ListIgStoriesResult> {
    // No folderId in the URL means the root view, which must scope to unfiled
    // automations only — treating it the same as "not filtered at all" would
    // surface every automation regardless of which folder it had been moved
    // into (mirrors ig-comments' listIgComments).
    const folderIdFilter: string | { isNull: true } =
      !input.folderId || input.folderId === rootFolderId
        ? { isNull: true }
        : input.folderId

    const where = {
      workspaceId: input.workspaceId,
      type: { in: [...igStoryAutomationTypes.options] },
      folderId: folderIdFilter,
      name: input.name ? { ilike: likeContains(input.name) } : undefined,
      isActive:
        input.isActive !== undefined && input.isActive !== null
          ? input.isActive
          : undefined,
    }

    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(igStoryAutomationModel, input)

    const [data, total] = await Promise.all([
      db.query.igStoryAutomationModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      db.$count(
        igStoryAutomationModel,
        relationsFilterToSQL(igStoryAutomationModel, where),
      ),
    ])

    const pageCount = Math.ceil(total / pagination.limit)

    return { data, pageCount }
  }

  async findOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<IgStoryAutomationModel> {
    const record = await db.query.igStoryAutomationModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        type: { in: [...igStoryAutomationTypes.options] },
      },
    })

    if (!record) {
      throw notFoundException("Instagram Story Automation not found")
    }

    return record
  }
}

export const igStoryAutomationService = new IgStoryAutomationService()
