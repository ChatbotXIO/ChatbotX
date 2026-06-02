import { automatedResponseService as automatedResponseRuntime } from "@chatbotx.io/automated-response"
import { notFoundException } from "@chatbotx.io/business/errors"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { automatedResponseModel } from "@chatbotx.io/database/schema"
import type { AutomatedResponseModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../common/base.service"
import type { PaginatedResponse } from "../common/schemas/pagination"
import type { UpdateAutomatedResponseRequest } from "./schema/action"
import type {
  FindAutomatedResponseRequest,
  ListAutomatedResponsesRequest,
} from "./schema/query"
import type { AutomatedResponseResource } from "./schema/resource"

class AutomatedResponseService extends BaseService {
  async findBy(
    input: FindAutomatedResponseRequest,
    tx?: DatabaseClient,
  ): Promise<AutomatedResponseModel | undefined> {
    const client = tx ?? db
    return await client.query.automatedResponseModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        id: input.id,
      },
    })
  }

  async findOrFail(
    input: FindAutomatedResponseRequest,
    tx?: DatabaseClient,
  ): Promise<AutomatedResponseModel> {
    const result = await this.findBy(input, tx)
    if (!result) {
      throw notFoundException("Automated response not found")
    }
    return result
  }

  async list(
    input: ListAutomatedResponsesRequest,
  ): Promise<PaginatedResponse<AutomatedResponseResource>> {
    const where = {
      workspaceId: input.workspaceId,
      keywords: input.keyword
        ? { ilike: `%${input.keyword.toLowerCase()}%` }
        : undefined,
      folderId: input.folderId
        ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
          input.folderId === rootFolderId
          ? { isNull: true as const }
          : input.folderId
        : undefined,
    }

    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(automatedResponseModel, input)

    const [data, total] = await Promise.all([
      db.query.automatedResponseModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      db.$count(
        automatedResponseModel,
        relationsFilterToSQL(automatedResponseModel, where),
      ),
    ])

    const pageCount = Math.ceil(total / input.perPage)
    return { data, pageCount }
  }

  async create(
    workspaceId: string,
    values: {
      text?: string | null
      flowId?: string | null
      folderId?: string | null
      keywords: string[]
    },
    tx?: DatabaseClient,
  ): Promise<AutomatedResponseModel> {
    const client = tx ?? db
    const [created] = await client
      .insert(automatedResponseModel)
      .values({
        id: createId(),
        workspaceId,
        status: true,
        text: values.text,
        flowId: values.flowId,
        folderId: values.folderId,
        keywords: values.keywords,
      })
      .returning()
    await this.invalidateCache(workspaceId)
    return created
  }

  async update(
    ctx: { id: string; workspaceId: string },
    data: UpdateAutomatedResponseRequest,
    tx?: DatabaseClient,
  ): Promise<AutomatedResponseModel> {
    const client = tx ?? db
    const [updated] = await client
      .update(automatedResponseModel)
      .set({
        ...data,
        keywords: data.keywords?.map((m) => m.value) ?? [],
      })
      .where(
        and(
          eq(automatedResponseModel.id, ctx.id),
          eq(automatedResponseModel.workspaceId, ctx.workspaceId),
        ),
      )
      .returning()
    await this.invalidateCache(ctx.workspaceId)
    return updated
  }

  async setStatus(
    ctx: { id: string; workspaceId: string },
    status: boolean,
    tx?: DatabaseClient,
  ): Promise<AutomatedResponseModel> {
    const client = tx ?? db
    const [updated] = await client
      .update(automatedResponseModel)
      .set({ status })
      .where(
        and(
          eq(automatedResponseModel.id, ctx.id),
          eq(automatedResponseModel.workspaceId, ctx.workspaceId),
        ),
      )
      .returning()
    await this.invalidateCache(ctx.workspaceId)
    return updated
  }

  async deleteMany(
    workspaceId: string,
    ids: string[],
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = tx ?? db
    await client
      .delete(automatedResponseModel)
      .where(
        and(
          eq(automatedResponseModel.workspaceId, workspaceId),
          inArray(automatedResponseModel.id, ids),
        ),
      )
    await this.invalidateCache(workspaceId)
  }

  async invalidateCache(workspaceId: string): Promise<void> {
    await automatedResponseRuntime.invalidateCache(workspaceId)
  }
}

export const automatedResponseService = new AutomatedResponseService()
