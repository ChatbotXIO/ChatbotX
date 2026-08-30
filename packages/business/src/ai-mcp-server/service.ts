import {
  type DatabaseClient,
  db,
  eq,
  type RelationsFieldFilter,
} from "@chatbotx.io/database/client"
import type { AIMcpServerAuth } from "@chatbotx.io/database/partials"
import { aiMCPServerModel } from "@chatbotx.io/database/schema"
import type { AIMCPServerModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { isSameJsonValue } from "../audit/diff"
import { BaseService } from "../base.service"

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

  async list(props: {
    tx?: DatabaseClient
    where: Partial<{
      workspaceId?: string
    }>
  }): Promise<AIMCPServerModel[]> {
    const { tx = db, where } = props
    return await tx.query.aiMCPServerModel.findMany({
      where,
    })
  }

  async create(workspaceId: string, data: CreateAIMcpServerRequest) {
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

  async update(id: string, data: UpdateAIMcpServerRequest) {
    const existing = await db.query.aiMCPServerModel.findFirst({
      where: { id },
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
      .where(eq(aiMCPServerModel.id, id))
      .returning()

    if (updated.length > 0 && !isSameJsonValue(data, previous)) {
      await this.audit("update", `updated an MCP Server (#${id})`)
    }

    return updated
  }

  async delete(id: string) {
    const deleted = await db
      .delete(aiMCPServerModel)
      .where(eq(aiMCPServerModel.id, id))
      .returning()

    if (deleted.length > 0) {
      await this.audit("delete", `deleted an MCP Server (#${id})`)
    }

    return deleted
  }
}

export const aiMcpServerService = new AiMcpServerService()
