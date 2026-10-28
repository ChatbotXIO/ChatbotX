import {
  activityKindsOf,
  PIPELINE_FIELD_COMPARISON_KIND,
  type PipelineActivityGroup,
} from "@chatbotx.io/database/partials"
import {
  contactInboxRepository,
  InvalidPipelineCursorError,
  type PipelineItemCommentPage,
  type PipelineItemFilter,
  type PipelineItemSort,
  pipelineActivityRepository,
  pipelineItemContentRepository,
  pipelineItemRepository,
  pipelineReferenceRepository,
  pipelineRepository,
  pipelineStageRepository,
} from "@chatbotx.io/database/repositories"
import type {
  PipelineFieldModel,
  PipelineItemActivityModel,
  PipelineItemModel,
  PipelineStageModel,
} from "@chatbotx.io/database/types"
import type { CustomFieldType } from "@chatbotx.io/utils/custom-field"
import { BaseService } from "../base.service"
import { maskContactEmailAndPhone } from "../contact/utils"
import { conversationService } from "../conversation/service"
import { notFoundException, validationException } from "../errors"
import { workspaceService } from "../workspace/service"
import { canViewContactEmailAndPhone, type PipelineAccessScope } from "./access"
import {
  applyEffectiveCurrency,
  type PipelineWithCurrency,
  resolveWorkspaceDefault,
  type WorkspaceCurrencyDefault,
} from "./currency"
import { assertFieldCondition } from "./field-filter"
import { emptyAssignees, groupAssignees } from "./item-assignees"
import { pipelineService } from "./service"
import type {
  PipelineActivityPage,
  PipelineActivityView,
  PipelineItemAssignees,
} from "./types"

type PipelineContactSummary = {
  id: string
  fullName: string | null
  avatar: string | null
  email: string | null
  phoneNumber: string | null
  /** Channel of the contact's most recently active connection, null without one. */
  channel: string | null
}

/** A card: the item plus everything the board shows without a second request. */
export type PipelineItemView = {
  item: PipelineItemModel
  contact: PipelineContactSummary | null
  assignees: PipelineItemAssignees
  commentCount: number
}

export type PipelineItemViewPage = {
  items: PipelineItemView[]
  nextCursor: string | null
}

export type PipelineBoardStage = {
  stage: PipelineStageModel
  count: number
  totalValue: number
  items: PipelineItemView[]
  /** Pass to `listStagePage` for the rest of the column; null when it is all here. */
  nextCursor: string | null
}

const DEFAULT_SORT: PipelineItemSort = { key: "createdAt", direction: "desc" }
const DEFAULT_PER_STAGE_LIMIT = 50
const DETAIL_LIST_LIMIT = 100
/** Activity grows with every change, so it is read a screen at a time. */
const ACTIVITY_PAGE_SIZE = 10

/**
 * SQLSTATE class 22 (data exception: bad cast, out of range).
 * The driver error may be wrapped, so the cause chain is followed.
 */
function isPgDataError(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code
    if (typeof code === "string" && code.startsWith("22")) {
      return true
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}

/** A cursor from another sort, version or caller is the caller's error, not ours. */
async function withValidCursor<T>(
  read: () => Promise<T>,
  cursor: string | undefined,
): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (error instanceof InvalidPipelineCursorError) {
      throw validationException("cursor", "Invalid cursor")
    }
    // A data exception can only be blamed on the cursor when one was sent;
    // other inputs are validated at the API boundary.
    if (cursor && isPgDataError(error)) {
      throw validationException("cursor", "Invalid cursor")
    }
    throw error
  }
}

/** The filter with contact email/phone left out of `search` when the scope may not see them. */
const scopeSearch = (
  filter: PipelineItemFilter | undefined,
  scope: PipelineAccessScope,
): PipelineItemFilter | undefined =>
  filter && {
    ...filter,
    searchContactEmailAndPhone: canViewContactEmailAndPhone(scope),
  }

/** Reads of the board, cards, comments and history. Writes live in `item.service`. */
export class PipelineItemQueryService extends BaseService {
  /**
   * Checks the custom-field conditions against the pipeline's fields and
   * returns the filter the repository runs: each condition's field type is
   * attached and date conditions get a timezone (the request's, else the
   * workspace's). An unknown field, an operator the field's type does not
   * offer, or a missing/malformed operand is a 422. Reuses `fields` when the
   * caller already loaded them.
   */
  private async resolveFieldFilter(input: {
    workspaceId: string
    pipelineId: string
    filter?: PipelineItemFilter
    fields?: PipelineFieldModel[]
  }): Promise<PipelineItemFilter | undefined> {
    const { filter } = input
    const entries = Object.entries(filter?.fieldConditions ?? {})
    if (!filter || entries.length === 0) {
      return filter
    }
    const fields =
      input.fields ??
      (await pipelineRepository.listFields({
        workspaceId: input.workspaceId,
        pipelineId: input.pipelineId,
      }))
    const fieldTypes: Record<string, CustomFieldType> = {}
    for (const [id, condition] of entries) {
      const field = fields.find((candidate) => candidate.id === id)
      if (!field) {
        throw validationException(
          "fieldConditions",
          `Field ${id} is not a custom field of this pipeline`,
        )
      }
      assertFieldCondition(field, condition)
      fieldTypes[id] = field.type
    }
    const needsTimezone = Object.values(fieldTypes).some(
      (type) => PIPELINE_FIELD_COMPARISON_KIND[type] === "datetime",
    )
    let timezone = filter.timezone
    if (needsTimezone && !timezone) {
      const workspace = await workspaceService.findById({
        id: input.workspaceId,
      })
      timezone = workspace.timezone
    }
    return { ...filter, fieldTypes, timezone }
  }

  async listBoard(input: {
    workspaceId: string
    pipelineId: string
    scope: PipelineAccessScope
    filter?: PipelineItemFilter
    sort?: PipelineItemSort
    perStageLimit?: number
  }): Promise<{
    pipeline: PipelineWithCurrency
    fields: PipelineFieldModel[]
    stages: PipelineBoardStage[]
    /** What "follow the workspace" means right now, for the currency choice. */
    workspaceDefault: WorkspaceCurrencyDefault
  }> {
    const { workspaceId, pipelineId } = input
    const pipeline = await pipelineService.requireAccess({
      workspaceId,
      pipelineId,
      scope: input.scope,
      action: "view",
    })
    const sort = input.sort ?? DEFAULT_SORT
    const fields = await pipelineRepository.listFields({
      workspaceId,
      pipelineId,
    })
    const filter = await this.resolveFieldFilter({
      workspaceId,
      pipelineId,
      filter: scopeSearch(input.filter, input.scope),
      fields,
    })
    const [stages, firstPages, totals, workspaceDefault] = await Promise.all([
      pipelineStageRepository.listByPipeline({ workspaceId, pipelineId }),
      pipelineItemRepository.listBoardFirstPage({
        workspaceId,
        pipelineId,
        filter,
        sort,
        perStageLimit: input.perStageLimit ?? DEFAULT_PER_STAGE_LIMIT,
      }),
      pipelineItemRepository.listStageTotals({
        workspaceId,
        pipelineId,
        filter,
      }),
      resolveWorkspaceDefault(workspaceId),
    ])
    const views = await this.toViews(
      workspaceId,
      firstPages.flatMap((page) => page.items),
      input.scope,
    )
    const viewsByStage = Map.groupBy(views, (view) => view.item.stageId)
    const pageByStage = new Map(firstPages.map((page) => [page.stageId, page]))
    const totalsByStage = new Map(totals.map((row) => [row.stageId, row]))
    return {
      pipeline: applyEffectiveCurrency(pipeline, workspaceDefault.currency),
      fields,
      workspaceDefault,
      stages: stages.map((stage) => ({
        stage,
        count: totalsByStage.get(stage.id)?.count ?? 0,
        totalValue: totalsByStage.get(stage.id)?.totalValue ?? 0,
        items: viewsByStage.get(stage.id) ?? [],
        nextCursor: pageByStage.get(stage.id)?.nextCursor ?? null,
      })),
    }
  }

  /**
   * Count and total value of the matching items in every stage, in board
   * order: the column headers of the board, for API callers.
   */
  async listStageTotals(input: {
    workspaceId: string
    pipelineId: string
    scope: PipelineAccessScope
    filter?: PipelineItemFilter
  }): Promise<
    Array<{ stageId: string; name: string; count: number; totalValue: number }>
  > {
    const { workspaceId, pipelineId } = input
    await pipelineService.requireAccess({
      workspaceId,
      pipelineId,
      scope: input.scope,
      action: "view",
    })
    const filter = await this.resolveFieldFilter({
      workspaceId,
      pipelineId,
      filter: scopeSearch(input.filter, input.scope),
    })
    const [stages, totals] = await Promise.all([
      pipelineStageRepository.listByPipeline({ workspaceId, pipelineId }),
      pipelineItemRepository.listStageTotals({
        workspaceId,
        pipelineId,
        filter,
      }),
    ])
    const totalsByStage = new Map(totals.map((row) => [row.stageId, row]))
    return stages.map((stage) => ({
      stageId: stage.id,
      name: stage.name,
      count: totalsByStage.get(stage.id)?.count ?? 0,
      totalValue: totalsByStage.get(stage.id)?.totalValue ?? 0,
    }))
  }

  /** One keyset page of a board column. */
  async listStagePage(input: {
    workspaceId: string
    pipelineId: string
    stageId: string
    scope: PipelineAccessScope
    filter?: PipelineItemFilter
    sort?: PipelineItemSort
    limit?: number
    cursor?: string
  }): Promise<PipelineItemViewPage> {
    return await this.listPage(input)
  }

  /** A flat, filterable page of items across the pipeline's stages. */
  async listItems(input: {
    workspaceId: string
    pipelineId: string
    scope: PipelineAccessScope
    filter?: PipelineItemFilter
    sort?: PipelineItemSort
    limit?: number
    cursor?: string
  }): Promise<PipelineItemViewPage> {
    return await this.listPage(input)
  }

  async getItem(input: {
    workspaceId: string
    pipelineId: string
    itemId: string
    scope: PipelineAccessScope
  }): Promise<
    PipelineItemView & {
      attachments: Awaited<
        ReturnType<typeof pipelineItemContentRepository.listAttachments>
      >
      /** The contact's direct-message conversation, for the drawer's Inbox link. */
      conversationId: string | null
    }
  > {
    const { workspaceId, itemId } = input
    const view = await this.getItemView(input)
    const [attachments, [conversation]] = await Promise.all([
      pipelineItemContentRepository.listAttachments({ workspaceId, itemId }),
      conversationService.findDMByContactIds({
        workspaceId,
        contactIds: [view.item.contactId],
      }),
    ])
    return { ...view, attachments, conversationId: conversation?.id ?? null }
  }

  /** One item as a card (assignees, comment count, contact), without its attachments. */
  async getItemView(input: {
    workspaceId: string
    pipelineId: string
    itemId: string
    scope: PipelineAccessScope
  }): Promise<PipelineItemView> {
    const item = await this.requireItemView(input)
    const [view] = await this.toViews(input.workspaceId, [item], input.scope)
    if (!view) {
      throw notFoundException("Item not found")
    }
    return view
  }

  /** Newest-first page of comments; follow `nextCursor` for older ones. */
  async listComments(input: {
    workspaceId: string
    pipelineId: string
    itemId: string
    cursor?: string
    scope: PipelineAccessScope
  }): Promise<PipelineItemCommentPage> {
    await this.requireItemView(input)
    return await withValidCursor(
      () =>
        pipelineItemContentRepository.listComments({
          workspaceId: input.workspaceId,
          itemId: input.itemId,
          limit: DETAIL_LIST_LIMIT,
          cursor: input.cursor,
        }),
      input.cursor,
    )
  }

  /** Newest-first page of an item's activity; `nextCursor` resumes it. */
  async listActivity(input: {
    workspaceId: string
    pipelineId: string
    itemId: string
    cursor?: string
    /** Only these kinds of change; every kind when omitted or empty. */
    groups?: readonly PipelineActivityGroup[]
    scope: PipelineAccessScope
  }): Promise<PipelineActivityPage> {
    await this.requireItemView(input)
    const page = await withValidCursor(
      () =>
        pipelineActivityRepository.listForItem({
          workspaceId: input.workspaceId,
          itemId: input.itemId,
          limit: ACTIVITY_PAGE_SIZE,
          cursor: input.cursor,
          kinds: activityKindsOf(input.groups),
        }),
      input.cursor,
    )
    return {
      items: await this.withActivityNames(
        input.workspaceId,
        input.scope,
        page.items,
      ),
      nextCursor: page.nextCursor,
    }
  }

  /** A contact's items across the pipelines the scope can view (inbox panel). */
  async listForContact(input: {
    workspaceId: string
    contactId: string
    scope: PipelineAccessScope
  }): Promise<Array<PipelineItemView & { pipeline: PipelineWithCurrency }>> {
    const { workspaceId, scope } = input
    const visible = await pipelineService.listViewable({ workspaceId, scope })
    const pipelines = new Map(
      visible.map((pipeline) => [pipeline.id, pipeline]),
    )
    const items = await pipelineItemRepository.listForContact({
      workspaceId,
      contactId: input.contactId,
      pipelineIds: [...pipelines.keys()],
      limit: DETAIL_LIST_LIMIT,
    })
    const views = await this.toViews(workspaceId, items, scope)
    return views.flatMap((view) => {
      const pipeline = pipelines.get(view.item.pipelineId)
      return pipeline ? [{ ...view, pipeline }] : []
    })
  }

  // Internals -------------------------------------------------------------------

  /**
   * Names for the whole page in two lookups, whatever pipelines the history
   * spans. Only pipelines the scope can view are named (and their stages), so
   * a transfer does not reveal a pipeline the caller has no access to.
   */
  private async withActivityNames(
    workspaceId: string,
    scope: PipelineAccessScope,
    rows: PipelineItemActivityModel[],
  ): Promise<PipelineActivityView[]> {
    const stageIds = [
      ...new Set(
        rows
          .flatMap((row) => [row.fromStageId, row.toStageId])
          .filter((id): id is string => id !== null),
      ),
    ]
    const [stages, viewable] = await Promise.all([
      pipelineStageRepository.listNamesByIds({ workspaceId, ids: stageIds }),
      pipelineService.listViewableRows({ workspaceId, scope }),
    ])
    const pipelineNames = new Map(viewable.map((row) => [row.id, row.name]))
    const stageNames = new Map(
      stages
        .filter((stage) => pipelineNames.has(stage.pipelineId))
        .map((stage) => [stage.id, stage.name]),
    )
    const nameOf = (names: Map<string, string>, id: string | null) =>
      (id && names.get(id)) ?? null
    return rows.map((row) => ({
      ...row,
      fromStageName: nameOf(stageNames, row.fromStageId),
      toStageName: nameOf(stageNames, row.toStageId),
      fromPipelineName: nameOf(pipelineNames, row.fromPipelineId),
      pipelineName: nameOf(pipelineNames, row.pipelineId),
    }))
  }

  private async listPage(input: {
    workspaceId: string
    pipelineId: string
    stageId?: string
    scope: PipelineAccessScope
    filter?: PipelineItemFilter
    sort?: PipelineItemSort
    limit?: number
    cursor?: string
  }): Promise<PipelineItemViewPage> {
    const { workspaceId, pipelineId } = input
    await pipelineService.requireAccess({
      workspaceId,
      pipelineId,
      scope: input.scope,
      action: "view",
    })
    const filter = await this.resolveFieldFilter({
      workspaceId,
      pipelineId,
      filter: scopeSearch(input.filter, input.scope),
    })
    if (input.stageId) {
      const stage = await pipelineStageRepository.findById({
        workspaceId,
        pipelineId,
        id: input.stageId,
      })
      if (!stage) {
        throw notFoundException("Stage not found")
      }
    }
    const page = await withValidCursor(
      () =>
        pipelineItemRepository.listStagePage({
          workspaceId,
          pipelineId,
          stageId: input.stageId,
          filter,
          sort: input.sort ?? DEFAULT_SORT,
          limit: input.limit ?? DEFAULT_PER_STAGE_LIMIT,
          cursor: input.cursor,
        }),
      input.cursor,
    )
    return {
      items: await this.toViews(workspaceId, page.items, input.scope),
      nextCursor: page.nextCursor,
    }
  }

  private async requireItemView(input: {
    workspaceId: string
    pipelineId: string
    itemId: string
    scope: PipelineAccessScope
  }): Promise<PipelineItemModel> {
    await pipelineService.requireAccess({
      workspaceId: input.workspaceId,
      pipelineId: input.pipelineId,
      scope: input.scope,
      action: "view",
    })
    const item = await pipelineItemRepository.findById({
      workspaceId: input.workspaceId,
      id: input.itemId,
      pipelineId: input.pipelineId,
    })
    if (!item) {
      throw notFoundException("Item not found")
    }
    return item
  }

  /**
   * Attaches assignees, comment counts, contacts and their channel with four
   * batched queries. Contact email and phone follow the scope's permission.
   */
  private async toViews(
    workspaceId: string,
    items: PipelineItemModel[],
    scope: PipelineAccessScope,
  ): Promise<PipelineItemView[]> {
    if (items.length === 0) {
      return []
    }
    const itemIds = items.map((item) => item.id)
    const contactIds = [...new Set(items.map((item) => item.contactId))]
    const [assigneeRows, commentCounts, contacts, connections] =
      await Promise.all([
        pipelineItemRepository.listAssigneesForItems({ workspaceId, itemIds }),
        pipelineItemContentRepository.countCommentsForItems({
          workspaceId,
          itemIds,
        }),
        pipelineReferenceRepository.listContactSummaries({
          workspaceId,
          ids: contactIds,
        }),
        contactInboxRepository.listLatestAnalyticsAttribution({
          workspaceId,
          contactIds,
        }),
      ])
    const channelByContact = new Map(
      connections.map((row) => [row.contactId, row.channel]),
    )
    const visibleContacts = canViewContactEmailAndPhone(scope)
      ? contacts
      : contacts.map(maskContactEmailAndPhone)
    const contactById = new Map(
      visibleContacts.map((contact) => [
        contact.id,
        { ...contact, channel: channelByContact.get(contact.id) ?? null },
      ]),
    )
    const countByItem = new Map(
      commentCounts.map((row) => [row.itemId, row.count]),
    )
    const assigneesByItem = groupAssignees(assigneeRows)
    return items.map((item) => ({
      item,
      contact: contactById.get(item.contactId) ?? null,
      assignees: assigneesByItem.get(item.id) ?? emptyAssignees(),
      commentCount: countByItem.get(item.id) ?? 0,
    }))
  }
}

export const pipelineItemQueryService = new PipelineItemQueryService()
