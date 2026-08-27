import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  relationsFilterToSQL,
  sql,
} from "@chatbotx.io/database/client"
import type { AutomatedResponseType } from "@chatbotx.io/database/partials"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { automatedResponseModel } from "@chatbotx.io/database/schema"
import type { AutomatedResponseModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { invalidateCacheKeys } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { assertDeletable } from "../template/installed-resource.service"
import type { PaginatedResult } from "../types"

export type UpdateAutomatedResponseRequest = {
  folderId?: string | null
  keywords?: Array<{ value: string }>
  text?: string | null
  flowId?: string | null
}

export type FindAutomatedResponseRequest = {
  workspaceId: string
  id: string
}

export type ListAutomatedResponsesRequest = {
  workspaceId: string
  type: AutomatedResponseType
  folderId?: string | null
  page: number
  perPage: number
  keyword?: string | null
  sort: Array<{ id: string; desc: boolean }>
}

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

  async findByInboundKeyword(
    workspaceId: string,
    keyword: string,
  ): Promise<AutomatedResponseModel | undefined> {
    const [result] = await db
      .select()
      .from(automatedResponseModel)
      .where(
        and(
          eq(automatedResponseModel.workspaceId, workspaceId),
          eq(automatedResponseModel.type, "inbound"),
          sql`${automatedResponseModel.keywords} @> ARRAY[${keyword}]::text[]`,
        ),
      )
      .limit(1)
    return result
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
  ): Promise<PaginatedResult<AutomatedResponseModel>> {
    const where = {
      workspaceId: input.workspaceId,
      type: input.type,
      keywords: input.keyword
        ? { ilike: likeContains(input.keyword) }
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
      type: AutomatedResponseType
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
        type: values.type,
      })
      .returning()
    await this.invalidateCache(workspaceId)

    // Template install (`template/adapters/keywords.ts`) is the only caller
    // that passes `tx` — it shares 1 transaction across every resource type
    // in the template, so an audit fired here could reference a row that
    // gets rolled back later if a *different* resource in the same install
    // fails. Out of audit-log scope for that path entirely (no compensating
    // "installed template" event either) — only the standalone Keywords →
    // Create action (never passes `tx`) is audited.
    if (!tx) {
      await this.audit(
        "create",
        `created a new keyword automation (#${created.id})`,
      )
    }

    return created
  }

  async update(
    ctx: { id: string; workspaceId: string },
    data: UpdateAutomatedResponseRequest,
    tx?: DatabaseClient,
  ): Promise<AutomatedResponseModel> {
    const client = tx ?? db

    // Fetched before the write so a Save that resubmits identical values
    // doesn't produce an "updated" audit entry.
    const existing = await client.query.automatedResponseModel.findFirst({
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
      columns: { folderId: true, keywords: true, text: true, flowId: true },
    })
    const nextKeywords = data.keywords?.map((m) => m.value) ?? []

    const [updated] = await client
      .update(automatedResponseModel)
      .set({
        ...data,
        keywords: nextKeywords,
      })
      .where(
        and(
          eq(automatedResponseModel.id, ctx.id),
          eq(automatedResponseModel.workspaceId, ctx.workspaceId),
        ),
      )
      .returning()
    await this.invalidateCache(ctx.workspaceId)

    if (!updated) {
      return updated as unknown as AutomatedResponseModel
    }

    const keywordsChanged =
      !existing ||
      nextKeywords.length !== existing.keywords.length ||
      nextKeywords.some(
        (keyword, index) => keyword !== existing.keywords[index],
      )
    const changed =
      !existing ||
      (data.folderId !== undefined && data.folderId !== existing.folderId) ||
      (data.text !== undefined && data.text !== existing.text) ||
      (data.flowId !== undefined && data.flowId !== existing.flowId) ||
      keywordsChanged

    if (!tx && changed) {
      await this.audit(
        "update",
        `updated a keyword automation (#${updated.id})`,
      )
    }

    return updated
  }

  async setStatus(
    ctx: { id: string; workspaceId: string },
    status: boolean,
    tx?: DatabaseClient,
  ): Promise<AutomatedResponseModel> {
    const client = tx ?? db

    const existing = await client.query.automatedResponseModel.findFirst({
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
      columns: { status: true },
    })

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

    if (!updated) {
      return updated as unknown as AutomatedResponseModel
    }

    if (!tx && existing?.status !== status) {
      await this.audit(
        "update",
        `${status ? "enabled" : "disabled"} a keyword automation (#${updated.id})`,
      )
    }

    return updated
  }

  async deleteMany(
    workspaceId: string,
    ids: string[],
    tx?: DatabaseClient,
  ): Promise<void> {
    await assertDeletable({
      workspaceId,
      resourceKind: "automatedResponse",
      resourceIds: ids,
    })

    const client = tx ?? db

    const deleted = await client
      .delete(automatedResponseModel)
      .where(
        and(
          eq(automatedResponseModel.workspaceId, workspaceId),
          inArray(automatedResponseModel.id, ids),
        ),
      )
      .returning({ id: automatedResponseModel.id })
    await this.invalidateCache(workspaceId)

    if (!tx && deleted.length > 0) {
      await this.audit(
        "delete",
        `deleted keyword automation${deleted.length > 1 ? "s" : ""} ${deleted.map((row) => `#${row.id}`).join(", ")}`,
      )
    }
  }

  async invalidateCache(workspaceId: string): Promise<void> {
    await invalidateCacheKeys(
      `workspaces:${workspaceId}:automated-responses:all`,
    )
  }
}

export const automatedResponseService = new AutomatedResponseService()
