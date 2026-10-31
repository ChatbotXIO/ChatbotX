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
import {
  automatedResponseFolderTypeByType,
  rootFolderId,
} from "@chatbotx.io/database/partials"
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
import { notFoundException, validationException } from "../errors"
import { flowService } from "../flow/service"
import { folderService } from "../folder/service"
import {
  assertReferencable,
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
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
  type: AutomatedResponseType
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
  /**
   * Contact (inbound) keyword rules whose keywords contain `search`, newest
   * first, for pickers. `keywords` is a text[] column, so the match runs on the
   * joined keywords (the relational `ilike` filter does not support arrays).
   */
  async listKeywordOptions(input: {
    workspaceId: string
    search: string
    limit: number
  }): Promise<{ id: string; keywords: string[] }[]> {
    return await db.query.automatedResponseModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        type: "inbound",
        RAW: input.search
          ? (table) =>
              sql`array_to_string(${table.keywords}, ' ') ILIKE ${likeContains(input.search)}`
          : undefined,
      },
      columns: { id: true, keywords: true },
      orderBy: { createdAt: "desc" },
      limit: input.limit,
    })
  }

  /**
   * Labels for contact (inbound) keyword rules, which have no name: the label
   * is the rule's keywords. Existing rows only.
   */
  async listKeywordLabelsByIds(input: {
    workspaceId: string
    ids: string[]
  }): Promise<{ id: string; name: string }[]> {
    if (input.ids.length === 0) {
      return []
    }
    const rows = await db.query.automatedResponseModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        id: { in: input.ids },
        type: "inbound",
      },
      columns: { id: true, keywords: true },
    })
    return rows.map((row) => ({ id: row.id, name: row.keywords.join(", ") }))
  }

  async findBy(
    input: FindAutomatedResponseRequest,
    tx?: DatabaseClient,
  ): Promise<AutomatedResponseModel | undefined> {
    const client = tx ?? db
    return await client.query.automatedResponseModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        id: input.id,
        type: input.type,
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

  /**
   * `flowId` and `text` are mutually exclusive — a keyword either replies
   * with literal text or hands off to a flow, never both. Enforced here —
   * not in the caller — so every insert path (the create action, template
   * install) shares one invariant instead of re-deriving it.
   *
   * Both-set is a caller bug, so it throws rather than silently discarding
   * one side: template install (`template/adapters/keywords.ts`) passes the
   * manifest's `text` and `flowId` straight through, and nulling `text`
   * there would drop authored content with no error surfaced.
   */
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

    const flowId = values.flowId ?? undefined
    const text = values.text ?? undefined
    if (flowId && !tx) {
      // The referenced flow's lock must be held until the reference commits.
      return await withTemplateLockedTransaction((locked) =>
        this.create(workspaceId, values, locked),
      )
    }
    if (flowId && tx) {
      await assertReferencable({
        workspaceId,
        parents: [{ kind: "flow", resourceId: flowId }],
        tx,
      })
    }

    if (flowId && text) {
      throw validationException(
        "flowId",
        "A keyword replies with either text or a flow, not both",
      )
    }

    if (flowId) {
      const exists = await flowService.exists(workspaceId, flowId, tx)
      if (!exists) {
        throw validationException("flowId", "Flow not found")
      }
    }

    if (values.folderId) {
      await folderService.ensureExists({
        id: values.folderId,
        workspaceId,
        folderType: automatedResponseFolderTypeByType[values.type],
        tx,
      })
    }

    const [created] = await client
      .insert(automatedResponseModel)
      .values({
        id: createId(),
        workspaceId,
        status: true,
        text,
        flowId,
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
    ctx: { id: string; workspaceId: string; type: AutomatedResponseType },
    data: UpdateAutomatedResponseRequest,
    tx?: DatabaseClient,
  ): Promise<AutomatedResponseModel> {
    if (tx) {
      const { updated } = await this.updateIn(ctx, data, tx)
      await this.invalidateCache(ctx.workspaceId)
      return updated
    }
    // The row and its flow are locked before the stored row is read, so the
    // diff that decides the guard is computed under the lock; the cache and the
    // audit follow the commit.
    const { updated, changed } = await withTemplateLockedTransaction(
      (lockedTx) => this.updateIn(ctx, data, lockedTx),
      {
        workspaceId: ctx.workspaceId,
        initialKeys: [
          { kind: "automatedResponse", resourceId: ctx.id },
          ...(data.flowId
            ? [{ kind: "flow" as const, resourceId: data.flowId }]
            : []),
        ],
      },
    )
    await this.invalidateCache(ctx.workspaceId)
    if (changed) {
      await this.audit(
        "update",
        `updated a keyword automation (#${updated.id})`,
      )
    }
    return updated
  }

  private async updateIn(
    ctx: { id: string; workspaceId: string; type: AutomatedResponseType },
    data: UpdateAutomatedResponseRequest,
    tx: DatabaseClient,
  ): Promise<{ updated: AutomatedResponseModel; changed: boolean }> {
    const client = tx

    // Fetched before the write so a Save that resubmits identical values
    // doesn't produce an "updated" audit entry.
    const existing = await client.query.automatedResponseModel.findFirst({
      where: {
        id: ctx.id,
        workspaceId: ctx.workspaceId,
        type: ctx.type,
      },
      columns: { folderId: true, keywords: true, text: true, flowId: true },
    })

    // Keywords, reply text and flow are template content; the status toggle
    // and the folder are the installer's.
    if (existing) {
      await assertResourceEditable({
        workspaceId: ctx.workspaceId,
        resourceKind: "automatedResponse",
        resourceIds: [ctx.id],
        changedKeys: changedKeysOf(existing, data),
        referencedParents: data.flowId
          ? [{ kind: "flow", resourceId: data.flowId }]
          : [],
        tx,
      })
    }

    // `text` and `flowId` are mutually exclusive: setting one nulls the
    // other, mirroring `create`'s behavior. Validate `flowId` belongs to
    // this workspace before persisting it.
    let nextFlowId = data.flowId
    let nextText = data.text
    if (data.text?.length) {
      nextFlowId = null
    } else if (data.flowId) {
      const flowExists = await flowService.exists(
        ctx.workspaceId,
        data.flowId,
        tx,
      )
      if (!flowExists) {
        throw validationException("flowId", "Flow not found")
      }
      nextText = null
    }

    const { keywords: _keywords, ...restData } = data
    const updatePayload: Partial<AutomatedResponseModel> = {
      ...restData,
      text: nextText,
      flowId: nextFlowId,
    }
    // Only touch the `keywords` column when the caller actually supplied a
    // value — omitting it must never wipe existing keywords.
    const nextKeywords = data.keywords?.map((m) => m.value)
    if (nextKeywords !== undefined) {
      updatePayload.keywords = nextKeywords
    }

    const [updated] = await client
      .update(automatedResponseModel)
      .set(updatePayload)
      .where(
        and(
          eq(automatedResponseModel.id, ctx.id),
          eq(automatedResponseModel.workspaceId, ctx.workspaceId),
          eq(automatedResponseModel.type, ctx.type),
        ),
      )
      .returning()

    if (!updated) {
      throw notFoundException("Automated response not found")
    }

    const keywordsChanged =
      nextKeywords !== undefined &&
      (!existing ||
        nextKeywords.length !== existing.keywords.length ||
        nextKeywords.some(
          (keyword, index) => keyword !== existing.keywords[index],
        ))
    const changed =
      !existing ||
      (data.folderId !== undefined && data.folderId !== existing.folderId) ||
      (nextText !== undefined && nextText !== existing.text) ||
      (nextFlowId !== undefined && nextFlowId !== existing.flowId) ||
      keywordsChanged

    // An open transaction owner audits (or not) itself, as before.
    return { updated, changed }
  }

  async setStatus(
    ctx: { id: string; workspaceId: string; type: AutomatedResponseType },
    status: boolean,
    tx?: DatabaseClient,
  ): Promise<AutomatedResponseModel> {
    const client = tx ?? db

    const existing = await client.query.automatedResponseModel.findFirst({
      where: {
        id: ctx.id,
        workspaceId: ctx.workspaceId,
        type: ctx.type,
      },
      columns: { status: true },
    })

    const [updated] = await client
      .update(automatedResponseModel)
      .set({ status })
      .where(
        and(
          eq(automatedResponseModel.id, ctx.id),
          eq(automatedResponseModel.workspaceId, ctx.workspaceId),
          eq(automatedResponseModel.type, ctx.type),
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
    type: AutomatedResponseType,
    tx?: DatabaseClient,
    /** An uninstall passes its own installations: their locks stop governing once it commits. */
    context?: { excludeInstallationIds?: readonly string[] },
  ): Promise<void> {
    const deleted = await withDeleteGuard(
      {
        workspaceId,
        targets: [{ resourceKind: "automatedResponse", resourceIds: ids }],
        tx,
        excludeInstallationIds: context?.excludeInstallationIds,
      },
      (client) =>
        this.deleteInTx(client, {
          workspaceId,
          ids,
          type,
        }),
    )
    await this.invalidateCache(workspaceId)

    if (!tx && deleted.length > 0) {
      await this.audit(
        "delete",
        `deleted keyword automation${deleted.length > 1 ? "s" : ""} (${deleted.map((id) => `#${id}`).join(", ")})`,
      )
    }
  }

  /**
   * The delete core (row write only), shared with the template uninstall so
   * there is one implementation. `type` is omitted by the uninstall, which
   * never assumes a keyword's type. Returns the ids actually deleted.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: { workspaceId: string; ids: string[]; type?: AutomatedResponseType },
  ): Promise<string[]> {
    const rows = await tx
      .delete(automatedResponseModel)
      .where(
        and(
          eq(automatedResponseModel.workspaceId, input.workspaceId),
          inArray(automatedResponseModel.id, input.ids),
          input.type ? eq(automatedResponseModel.type, input.type) : undefined,
        ),
      )
      .returning({ id: automatedResponseModel.id })
    return rows.map((row) => String(row.id))
  }

  async invalidateCache(workspaceId: string): Promise<void> {
    await invalidateCacheKeys(
      `workspaces:${workspaceId}:automated-responses:all`,
    )
  }
}

export const automatedResponseService = new AutomatedResponseService()
