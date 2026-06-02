import { notFoundException } from "@chatbotx.io/business/errors"
import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  type RelationsFieldFilter,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { aiAgentModel } from "@chatbotx.io/database/schema"
import type { AIAgentModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { withCache } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { BaseService } from "../common/base.service"
import type {
  CreateAIAgentRequest,
  UpdateAIAgentRequest,
} from "./schemas/action"
import type { ListAIAgentsRequest } from "./schemas/query"

const AI_AGENTS_LIST_CACHE_TTL_SECONDS = 5 * 60

type FindByProps = {
  tx?: DatabaseClient
  where: Partial<{
    id?: RelationsFieldFilter<string>
    workspaceId?: RelationsFieldFilter<string>
    name?: RelationsFieldFilter<string>
  }>
}

class AiAgentService extends BaseService {
  private getWorkspaceCacheTag(workspaceId: string): string {
    return `ai-agents:workspace:${workspaceId}`
  }

  private getListCacheKey(input: ListAIAgentsRequest): string {
    const parts: Record<string, string | number | undefined> = {
      workspaceId: input.workspaceId,
      page: input.page,
      perPage: input.perPage,
      sort: JSON.stringify(input.sort),
      name: input.name,
    }
    const sortedKeys = Object.keys(parts)
      .filter((key) => parts[key] !== undefined)
      .sort()
    const keyParts = sortedKeys.map((key) => `${key}:${parts[key]}`).join(":")
    return `ai-agents:list:${keyParts}`
  }

  async listAIAgents(
    input: ListAIAgentsRequest,
  ): Promise<PaginatedResponse<AIAgentModel>> {
    return await withCache(
      this.getListCacheKey(input),
      async () => {
        const where = {
          workspaceId: input.workspaceId,
          name: input.name
            ? { ilike: `%${input.name.toLowerCase()}%` }
            : undefined,
        }

        const pagination = getPaginationWithDefaults(input)
        const orderBy = parseOrderByAsObject(aiAgentModel, input)

        const [data, total] = await Promise.all([
          db.query.aiAgentModel.findMany({
            where,
            orderBy,
            limit: pagination.limit,
            offset: pagination.offset,
          }),
          db.$count(aiAgentModel, relationsFilterToSQL(aiAgentModel, where)),
        ])

        return { data, pageCount: Math.ceil(total / input.perPage) }
      },
      {
        ttl: AI_AGENTS_LIST_CACHE_TTL_SECONDS,
        tags: [this.getWorkspaceCacheTag(input.workspaceId)],
      },
    )
  }

  async findBy(props: FindByProps): Promise<AIAgentModel | undefined> {
    const { tx = db, where } = props
    return await tx.query.aiAgentModel.findFirst({ where })
  }

  async create(
    workspaceId: string,
    data: CreateAIAgentRequest,
    tx?: DatabaseClient,
  ): Promise<void> {
    const execute = async (client: DatabaseClient) => {
      if (data.isDefault) {
        await client
          .update(aiAgentModel)
          .set({ isDefault: false })
          .where(eq(aiAgentModel.workspaceId, workspaceId))
      }
      await client.insert(aiAgentModel).values({
        ...data,
        workspaceId,
        id: createId(),
      })
    }

    if (tx) {
      await execute(tx)
    } else {
      await db.transaction(execute)
    }

    await this.invalidateCacheTags(this.getWorkspaceCacheTag(workspaceId))
  }

  async updateAIAgent(
    ctx: { workspaceId: string; id: string },
    data: UpdateAIAgentRequest,
  ): Promise<void> {
    const aiAgent = await this.findBy({
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
    })

    if (!aiAgent) {
      throw notFoundException("AI agent not found")
    }

    await db.transaction(async (tx) => {
      if (data.isDefault) {
        await tx
          .update(aiAgentModel)
          .set({ isDefault: false })
          .where(eq(aiAgentModel.workspaceId, ctx.workspaceId))
      }
      await tx
        .update(aiAgentModel)
        .set(data)
        .where(eq(aiAgentModel.id, aiAgent.id))
    })

    await this.invalidateCacheTags(this.getWorkspaceCacheTag(ctx.workspaceId))
  }

  async delete(
    ctx: { workspaceId: string; ids: string[] },
    tx?: DatabaseClient,
  ): Promise<void> {
    const client = tx ?? db
    await client
      .delete(aiAgentModel)
      .where(
        and(
          eq(aiAgentModel.workspaceId, ctx.workspaceId),
          inArray(aiAgentModel.id, ctx.ids),
        ),
      )

    await this.invalidateCacheTags(this.getWorkspaceCacheTag(ctx.workspaceId))
  }
}

export const aiAgentService = new AiAgentService()
