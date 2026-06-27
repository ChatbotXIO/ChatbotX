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
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import type { PaginatedResult } from "../types"

const AI_AGENTS_LIST_CACHE_TTL_SECONDS = 5 * 60

type FindByProps = {
  tx?: DatabaseClient
  where: Partial<{
    id: RelationsFieldFilter<string>
    workspaceId: RelationsFieldFilter<string>
    name: RelationsFieldFilter<string>
  }>
}

type WebSearchAuthorizedDomain = { value: string }

function normalizeWebSearchDomains(
  domains?: WebSearchAuthorizedDomain[] | null,
): string[] {
  const result = new Set<string>()
  for (const domain of domains ?? []) {
    const normalized = domain.value.trim().toLowerCase()
    if (normalized) {
      result.add(normalized)
    }
  }
  return Array.from(result)
}

export type CreateAIAgentRequest = {
  name: string
  prompt: string
  messages: Array<{ role: string; content: string }>
  models: Array<{ provider: string; model: string }>
  temperature: number
  maxOutputTokens: number
  tools: string[]
  isDefault: boolean
  isRichResponse: boolean
  webSearchAuthorizedDomains?: WebSearchAuthorizedDomain[] | null
}

export type UpdateAIAgentRequest = Partial<CreateAIAgentRequest>

export type ListAIAgentsRequest = {
  workspaceId: string
  page: number
  perPage: number
  sort: Array<{ id: string; desc: boolean }>
  name?: string
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
    const key = Object.keys(parts)
      .filter((k) => parts[k] !== undefined)
      .sort()
      .map((k) => `${k}:${parts[k]}`)
      .join(":")
    return `ai-agents:list:${key}`
  }

  async listAIAgents(
    input: ListAIAgentsRequest,
  ): Promise<PaginatedResult<AIAgentModel>> {
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
      const { webSearchAuthorizedDomains, ...rest } = data
      await client.insert(aiAgentModel).values({
        ...rest,
        webSearchAuthorizedDomains: normalizeWebSearchDomains(
          webSearchAuthorizedDomains,
        ),
        workspaceId,
        id: createId(),
      })
    }

    await (tx ? execute(tx) : db.transaction(execute))

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
      const { webSearchAuthorizedDomains, ...rest } = data
      await tx
        .update(aiAgentModel)
        .set({
          ...rest,
          ...(webSearchAuthorizedDomains !== undefined && {
            webSearchAuthorizedDomains: normalizeWebSearchDomains(
              webSearchAuthorizedDomains,
            ),
          }),
        })
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
