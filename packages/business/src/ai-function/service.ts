import {
  type DatabaseClient,
  db,
  eq,
  type RelationsFieldFilter,
} from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import type { AIFunctionModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { isSameJsonValue } from "../audit/diff"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { assertDeletable } from "../template/installed-resource.service"

type FindByProps = {
  tx?: DatabaseClient
  where: Partial<{
    id?: RelationsFieldFilter<string>
    workspaceId?: RelationsFieldFilter<string>
    name?: RelationsFieldFilter<string>
  }>
}

type TranslationFn = (
  key: string,
  params?: Record<string, string | number | Date>,
) => string

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

  async isNameTaken(
    workspaceId: string,
    name: string,
    excludeId?: string,
  ): Promise<boolean> {
    const existing = await this.findBy({ where: { workspaceId, name } })
    return existing ? existing.id !== excludeId : false
  }

  async deleteAIFunction(
    ctx: { workspaceId: string; aiFunctionId: string },
    t: TranslationFn,
  ): Promise<void> {
    const aiFunction = await this.findBy({
      where: { id: ctx.aiFunctionId, workspaceId: ctx.workspaceId },
    })

    if (!aiFunction) {
      throw notFoundException(
        t("messages.featureNotFound", {
          feature: t("fields.aiFunction.label"),
        }),
      )
    }

    await assertDeletable({
      workspaceId: ctx.workspaceId,
      resourceKind: "aiFunction",
      resourceIds: [ctx.aiFunctionId],
    })

    await this.delete(ctx.aiFunctionId)

    await this.audit("delete", `deleted an AI Function (#${aiFunction.id})`)
  }

  async updateAIFunction(
    ctx: { workspaceId: string; id: string },
    data: UpdateAIFunctionRequest,
    t: TranslationFn,
  ): Promise<void> {
    const aiFunction = await this.findBy({
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
    })

    if (!aiFunction) {
      throw notFoundException(
        t("messages.featureNotFound", {
          feature: t("fields.aiFunction.label"),
        }),
      )
    }

    await this.update(ctx.id, data)

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
  }

  async create(
    workspaceId: string,
    data: CreateAIFunctionRequest,
    tx?: DatabaseClient,
  ) {
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

  async update(id: string, data: UpdateAIFunctionRequest, tx?: DatabaseClient) {
    const client = tx ?? db
    return await client
      .update(aiFunctionModel)
      .set(data)
      .where(eq(aiFunctionModel.id, id))
      .returning()
  }

  async delete(id: string, tx?: DatabaseClient) {
    const client = tx ?? db
    return await client
      .delete(aiFunctionModel)
      .where(eq(aiFunctionModel.id, id))
      .returning()
  }

  async list(props: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<AIFunctionModel[]> {
    const { tx = db, workspaceId } = props
    return await tx.query.aiFunctionModel.findMany({
      where: { workspaceId },
    })
  }
}

export const aiFunctionService = new AiFunctionService()
