import {
  and,
  type DatabaseClient,
  db,
  eq,
  type RelationsFieldFilter,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import type { AIFunctionModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"
import { isSameJsonValue } from "../audit/diff"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import { assertDeletable } from "../template/installed-resource.service"
import type { PaginatedResult } from "../types"

type FindByProps = {
  tx?: DatabaseClient
  where: Partial<{
    id?: RelationsFieldFilter<string>
    workspaceId?: RelationsFieldFilter<string>
    name?: RelationsFieldFilter<string>
  }>
}

export type CreateAIFunctionRequest = {
  name: string
  purpose?: string | null
  dataCollect: Array<{ from: string; to: string }>
  outputMessage?: string | null
  triggerFlowId?: string | null
}

export type UpdateAIFunctionRequest = CreateAIFunctionRequest

class AiFunctionService extends BaseService {
  async findBy(props: FindByProps): Promise<AIFunctionModel | undefined> {
    const { tx = db, where } = props
    return await tx.query.aiFunctionModel.findFirst({
      where,
    })
  }

  async listAIFunctions(input: {
    workspaceId: string
    page?: number
    perPage?: number
  }): Promise<PaginatedResult<AIFunctionModel>> {
    const where = { workspaceId: input.workspaceId }
    const orderBy = parseOrderByAsObject(aiFunctionModel, {
      sort: [{ id: "createdAt", desc: true }],
    })

    if (input.page === undefined && input.perPage === undefined) {
      const data = await db.query.aiFunctionModel.findMany({
        where,
        orderBy,
      })
      return { data, pageCount: 1 }
    }

    const pagination = getPaginationWithDefaults(input)
    const [data, total] = await Promise.all([
      db.query.aiFunctionModel.findMany({
        where,
        orderBy,
        limit: pagination.limit,
        offset: pagination.offset,
      }),
      db.$count(aiFunctionModel, relationsFilterToSQL(aiFunctionModel, where)),
    ])
    return { data, pageCount: Math.ceil(total / pagination.limit) }
  }

  async isNameTaken(
    workspaceId: string,
    name: string,
    excludeId?: string,
  ): Promise<boolean> {
    const existing = await this.findBy({ where: { workspaceId, name } })
    return existing ? existing.id !== excludeId : false
  }

  async deleteAIFunction(ctx: {
    workspaceId: string
    aiFunctionId: string
  }): Promise<void> {
    const aiFunction = await this.findBy({
      where: { id: ctx.aiFunctionId, workspaceId: ctx.workspaceId },
    })

    if (!aiFunction) {
      throw notFoundException("AI Function not found")
    }

    await assertDeletable({
      workspaceId: ctx.workspaceId,
      resourceKind: "aiFunction",
      resourceIds: [ctx.aiFunctionId],
    })

    await this.delete({ workspaceId: ctx.workspaceId, id: ctx.aiFunctionId })

    await this.audit("delete", `deleted an AI Function (#${aiFunction.id})`)
  }

  async updateAIFunction(
    ctx: { workspaceId: string; id: string },
    data: UpdateAIFunctionRequest,
  ): Promise<AIFunctionModel> {
    const aiFunction = await this.findBy({
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
    })

    if (!aiFunction) {
      throw notFoundException("AI Function not found")
    }

    if (await this.isNameTaken(ctx.workspaceId, data.name, ctx.id)) {
      throw validationException("name", "Name is already taken")
    }

    const [updated] = await this.update(
      { workspaceId: ctx.workspaceId, id: ctx.id },
      data,
    )

    const previous: UpdateAIFunctionRequest = {
      name: aiFunction.name,
      purpose: aiFunction.purpose,
      dataCollect:
        aiFunction.dataCollect as UpdateAIFunctionRequest["dataCollect"],
      outputMessage: aiFunction.outputMessage,
      triggerFlowId: aiFunction.triggerFlowId,
    }
    if (!isSameJsonValue(data, previous)) {
      await this.audit("update", `updated an AI Function (#${aiFunction.id})`)
    }

    return updated
  }

  async create(
    workspaceId: string,
    data: CreateAIFunctionRequest,
    tx?: DatabaseClient,
  ) {
    if (!tx && (await this.isNameTaken(workspaceId, data.name))) {
      throw validationException("name", "Name is already taken")
    }

    const client = tx ?? db
    const created = await client
      .insert(aiFunctionModel)
      .values({
        ...data,
        id: createId(),
        workspaceId,
      })
      .returning()

    if (!tx) {
      await this.audit(
        "create",
        `created a new AI Function (#${created[0].id})`,
      )
    }

    return created
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: UpdateAIFunctionRequest,
    tx?: DatabaseClient,
  ) {
    const client = tx ?? db
    return await client
      .update(aiFunctionModel)
      .set(data)
      .where(
        and(
          eq(aiFunctionModel.id, ctx.id),
          eq(aiFunctionModel.workspaceId, ctx.workspaceId),
        ),
      )
      .returning()
  }

  async delete(ctx: { workspaceId: string; id: string }, tx?: DatabaseClient) {
    const client = tx ?? db
    return await client
      .delete(aiFunctionModel)
      .where(
        and(
          eq(aiFunctionModel.id, ctx.id),
          eq(aiFunctionModel.workspaceId, ctx.workspaceId),
        ),
      )
      .returning()
  }
}

export const aiFunctionService = new AiFunctionService()
