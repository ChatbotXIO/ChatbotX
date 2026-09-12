import {
  and,
  db,
  eq,
  inArray,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import { igStoryAutomationTypes } from "@chatbotx.io/database/partials"
import { igStoryAutomationModel } from "@chatbotx.io/database/schema"
import type { IgStoryAutomationModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { resolveFolderIdFilter } from "../lib/folder-filter"

type ListIgStoriesInput = {
  workspaceId: string
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
  folderId?: string | null
  includeAllFolders?: boolean
  name?: string | null
  isActive?: boolean | null
}

type ListIgStoriesResult = {
  data: IgStoryAutomationModel[]
  pageCount: number
}

type IgStoryAutomationWriteData = Omit<
  typeof igStoryAutomationModel.$inferInsert,
  "id" | "workspaceId"
>

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
    const where = {
      workspaceId: input.workspaceId,
      type: { in: [...igStoryAutomationTypes.options] },
      folderId: resolveFolderIdFilter(input.folderId, input.includeAllFolders),
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

  async create(input: {
    workspaceId: string
    data: IgStoryAutomationWriteData
  }): Promise<IgStoryAutomationModel> {
    const [created] = await db
      .insert(igStoryAutomationModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        ...input.data,
      })
      .returning()
    return created
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: Partial<IgStoryAutomationWriteData>,
  ): Promise<IgStoryAutomationModel> {
    await this.findOrFail(ctx)

    const [updated] = await db
      .update(igStoryAutomationModel)
      .set(data)
      .where(
        and(
          eq(igStoryAutomationModel.id, ctx.id),
          eq(igStoryAutomationModel.workspaceId, ctx.workspaceId),
          inArray(igStoryAutomationModel.type, igStoryAutomationTypes.options),
        ),
      )
      .returning()
    return updated
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await db
      .delete(igStoryAutomationModel)
      .where(
        and(
          eq(igStoryAutomationModel.workspaceId, input.workspaceId),
          inArray(igStoryAutomationModel.id, input.ids),
          inArray(igStoryAutomationModel.type, igStoryAutomationTypes.options),
        ),
      )
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    await this.findOrFail(input)
    await this.deleteMany({ workspaceId: input.workspaceId, ids: [input.id] })
  }
}

export const igStoryAutomationService = new IgStoryAutomationService()
