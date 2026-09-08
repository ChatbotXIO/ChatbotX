import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { aiTriggerRepository } from "@chatbotx.io/database/repositories"
import { aiTriggerModel } from "@chatbotx.io/database/schema"
import type { AITriggerModel } from "@chatbotx.io/database/types"
import { maxLimit } from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"

type AITriggerWriteData = {
  name?: string
  description?: string | null
  questions?: unknown[]
  flowId?: string | null
  finalMessage?: string | null
}

class AITriggerService extends BaseService {
  async list(input: {
    workspaceId: string
    name?: string | null
    page: number
    perPage: number
    sort?: { id: string; desc: boolean }[] | null
  }): Promise<{ data: AITriggerModel[]; pageCount: number }> {
    const [data, total] = await Promise.all([
      aiTriggerRepository.listPaginated(input),
      aiTriggerRepository.count(input),
    ])

    const pageCount = Math.ceil(total / Math.min(maxLimit, input.perPage))

    return { data, pageCount }
  }

  async findOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<AITriggerModel> {
    const aiTrigger = await aiTriggerRepository.findByIdAndWorkspace(input)
    if (!aiTrigger) {
      throw notFoundException("AITrigger not found")
    }
    return aiTrigger
  }

  async create(input: {
    workspaceId: string
    data: AITriggerWriteData & { name: string }
  }): Promise<AITriggerModel> {
    const [created] = await db
      .insert(aiTriggerModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        ...input.data,
      })
      .returning()

    await this.audit("create", `created a new AI trigger (#${created.id})`)

    return created
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: AITriggerWriteData,
  ): Promise<AITriggerModel> {
    const aiTrigger = await this.findOrFail(ctx)

    const [updated] = await db
      .update(aiTriggerModel)
      .set(data)
      .where(eq(aiTriggerModel.id, aiTrigger.id))
      .returning()

    await this.audit("update", `updated an AI trigger (#${aiTrigger.id})`)

    return updated
  }

  async duplicate(input: {
    workspaceId: string
    id: string
  }): Promise<AITriggerModel> {
    const source = await this.findOrFail(input)

    const { id: _id, name, createdAt, updatedAt, ...rest } = source

    const [created] = await db
      .insert(aiTriggerModel)
      .values({
        ...rest,
        id: createId(),
        name: `${name} _copy`,
      })
      .returning()

    await this.audit("create", `duplicated an AI trigger (#${source.id})`)

    return created
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    const deleted = await db.query.aiTriggerModel.findMany({
      where: { workspaceId: input.workspaceId, id: { in: input.ids } },
      columns: { id: true },
    })
    if (deleted.length === 0) {
      return
    }

    await db
      .delete(aiTriggerModel)
      .where(
        and(
          eq(aiTriggerModel.workspaceId, input.workspaceId),
          inArray(aiTriggerModel.id, input.ids),
        ),
      )

    await this.audit(
      "delete",
      `deleted AI trigger${deleted.length > 1 ? "s" : ""} (${deleted.map((row) => `#${row.id}`).join(", ")})`,
    )
  }
}

export const aiTriggerService = new AITriggerService()
