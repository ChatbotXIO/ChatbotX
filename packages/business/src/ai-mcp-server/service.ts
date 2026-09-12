import {
  and,
  type DatabaseClient,
  db,
  eq,
  type RelationsFieldFilter,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import type { AIMcpServerAuth } from "@chatbotx.io/database/partials"
import { aiMCPServerModel } from "@chatbotx.io/database/schema"
import type { AIMCPServerModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { isSameJsonValue } from "../audit/diff"
import { BaseService } from "../base.service"
import { validationException } from "../errors"
import type { PaginatedResult } from "../types"

type FindByProps = {
  tx?: DatabaseClient
  where: Partial<{
    id?: RelationsFieldFilter<string>
    workspaceId?: RelationsFieldFilter<string>
    name?: RelationsFieldFilter<string>
  }>
}

export type CreateAIMcpServerRequest = {
  name: string
  url: string
  auth: AIMcpServerAuth
  availableTools: Record<string, unknown>
  selectedTools: string[]
}

export type UpdateAIMcpServerRequest = CreateAIMcpServerRequest

class AiMcpServerService extends BaseService {
  async findBy(props: FindByProps): Promise<AIMCPServerModel | undefined> {
    const { tx = db, where } = props
    return await tx.query.aiMCPServerModel.findFirst({
      where,
    })
  }

  async listAIMcpServers(input: {
    workspaceId: string
    page?: number
    perPage?: number
  }): Promise<PaginatedResult<AIMCPServerModel>> {
    const where = { workspaceId: input.workspaceId }
    const orderBy = parseOrderByAsObject(aiMCPServerModel, {
      sort: [{ id: "createdAt", desc: true }],
    })

    if (input.page === undefined && input.perPage === undefined) {
      const data = await db.query.aiMCPServerModel.findMany({
        where,
        orderBy,
      })
      return { data, pageCount: 1 }
    }

    const pagination = getPaginationWithDefaults(input)
    const [data, total] = await Promise.all([
      db.query.aiMCPServerModel.findMany({
        where,
        orderBy,
        limit: pagination.limit,
        offset: pagination.offset,
      }),
      db.$count(
        aiMCPServerModel,
        relationsFilterToSQL(aiMCPServerModel, where),
      ),
    ])
    return { data, pageCount: Math.ceil(total / pagination.limit) }
  }

  async create(workspaceId: string, data: CreateAIMcpServerRequest) {
    const existing = await this.findBy({
      where: { workspaceId, name: data.name },
    })
    if (existing) {
      throw validationException("name", "Name is already taken")
    }

    const created = await db
      .insert(aiMCPServerModel)
      .values({
        ...data,
        id: createId(),
        workspaceId,
      })
      .returning()

    if (created.length > 0) {
      await this.audit("create", `created a new MCP Server (#${created[0].id})`)
    }

    return created
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: UpdateAIMcpServerRequest,
  ) {
    const duplicate = await this.findBy({
      where: { workspaceId: ctx.workspaceId, name: data.name },
    })
    if (duplicate && duplicate.id !== ctx.id) {
      throw validationException("name", "Name is already taken")
    }

    const existing = await db.query.aiMCPServerModel.findFirst({
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
    })
    const previous = existing && {
      name: existing.name,
      url: existing.url,
      auth: existing.auth,
      availableTools: existing.availableTools,
      selectedTools: existing.selectedTools,
    }

    const updated = await db
      .update(aiMCPServerModel)
      .set(data)
      .where(
        and(
          eq(aiMCPServerModel.id, ctx.id),
          eq(aiMCPServerModel.workspaceId, ctx.workspaceId),
        ),
      )
      .returning()

    if (updated.length > 0 && !isSameJsonValue(data, previous)) {
      await this.audit("update", `updated an MCP Server (#${ctx.id})`)
    }

    return updated
  }

  async delete(ctx: { workspaceId: string; id: string }) {
    const deleted = await db
      .delete(aiMCPServerModel)
      .where(
        and(
          eq(aiMCPServerModel.id, ctx.id),
          eq(aiMCPServerModel.workspaceId, ctx.workspaceId),
        ),
      )
      .returning()

    if (deleted.length > 0) {
      await this.audit("delete", `deleted an MCP Server (#${ctx.id})`)
    }

    return deleted
  }
}

export const aiMcpServerService = new AiMcpServerService()
