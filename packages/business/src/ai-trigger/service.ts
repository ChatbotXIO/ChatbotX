import {
  countWithRelationsFilter,
  type DatabaseClient,
  db,
  findOrFail,
} from "@chatbotx.io/database/client"
import { aiTriggerModel } from "@chatbotx.io/database/schema"
import type { AITriggerModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import type { PaginatedResult } from "../types"

export type CreateAITriggerRequest = {
  name: string
  description: string | null
  questions: Array<{ name?: string; customFieldId?: string }>
  flowId: string | null
  finalMessage: string | null
}

export type ListAITriggersInput = {
  workspaceId: string
  page: number
  perPage: number
  sort: Array<{ id: string; desc: boolean }>
  name?: string
}

class AiTriggerService extends BaseService {
  async list(
    input: ListAITriggersInput,
  ): Promise<PaginatedResult<AITriggerModel>> {
    const where = {
      workspaceId: input.workspaceId,
      name: input.name
        ? {
            ilike: likeContains(input.name),
          }
        : undefined,
    }

    const pagination = getPaginationWithDefaults(input)
    const orderBy = parseOrderByAsObject(aiTriggerModel, input)

    const [data, total] = await Promise.all([
      db.query.aiTriggerModel.findMany({
        where,
        orderBy,
        ...pagination,
      }),
      countWithRelationsFilter({
        table: aiTriggerModel,
        tsName: "aiTriggerModel",
        where,
      }),
    ])

    return { data, pageCount: Math.ceil(total / pagination.limit) }
  }

  async create(
    workspaceId: string,
    data: CreateAITriggerRequest,
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = tx ?? db
    await client.insert(aiTriggerModel).values({
      ...data,
      workspaceId,
      id: createId(),
    })
  }

  async duplicate(ctx: { workspaceId: string; id: string }): Promise<void> {
    const targetAITrigger = await findOrFail({
      table: aiTriggerModel,
      where: {
        id: ctx.id,
        workspaceId: ctx.workspaceId,
      },
      message: "AITrigger not found",
    })
    const {
      id: _id,
      name,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      ...rest
    } = targetAITrigger

    await db.insert(aiTriggerModel).values({
      ...rest,
      name: `${name} _copy`,
    })
  }
}

export const aiTriggerService = new AiTriggerService()
