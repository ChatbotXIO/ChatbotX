import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
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
import {
  assertReferencable,
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
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
  ): Promise<AIFunctionModel[]> {
    if (!tx && (await this.isNameTaken(workspaceId, data.name))) {
      throw validationException("name", "Name is already taken")
    }

    if (data.triggerFlowId && !tx) {
      // The referenced flow's lock must be held until the reference commits.
      return await withTemplateLockedTransaction((locked) =>
        this.create(workspaceId, data, locked),
      )
    }
    if (data.triggerFlowId && tx) {
      await assertReferencable({
        workspaceId,
        parents: [{ kind: "flow", resourceId: data.triggerFlowId }],
        tx,
      })
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
  ): Promise<AIFunctionModel[]> {
    if (!tx) {
      // The function and its trigger flow are locked before the stored row is
      // read, so the diff that decides the guard is computed under the lock.
      return await withTemplateLockedTransaction(
        (lockedTx) => this.update(ctx, data, lockedTx),
        {
          workspaceId: ctx.workspaceId,
          initialKeys: [
            { kind: "aiFunction", resourceId: ctx.id },
            ...(data.triggerFlowId
              ? [{ kind: "flow" as const, resourceId: data.triggerFlowId }]
              : []),
          ],
        },
      )
    }
    const client = tx
    const existing = await client.query.aiFunctionModel.findFirst({
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
    })
    if (existing) {
      await assertResourceEditable({
        workspaceId: ctx.workspaceId,
        resourceKind: "aiFunction",
        resourceIds: [ctx.id],
        changedKeys: changedKeysOf(existing, data),
        referencedParents: data.triggerFlowId
          ? [{ kind: "flow", resourceId: data.triggerFlowId }]
          : [],
        tx,
      })
    }
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
    return await withDeleteGuard(
      {
        workspaceId: ctx.workspaceId,
        targets: [{ resourceKind: "aiFunction", resourceIds: [ctx.id] }],
        tx,
      },
      (client) =>
        this.deleteInTx(client, {
          workspaceId: ctx.workspaceId,
          ids: [ctx.id],
        }),
    )
  }

  /**
   * The delete core (row write only), shared with the template uninstall so
   * there is one implementation. Returns the rows actually deleted.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[] },
  ) {
    return await tx
      .delete(aiFunctionModel)
      .where(
        and(
          eq(aiFunctionModel.workspaceId, input.workspaceId),
          inArray(aiFunctionModel.id, input.ids),
        ),
      )
      .returning()
  }
}

export const aiFunctionService = new AiFunctionService()
