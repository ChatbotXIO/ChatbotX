import {
  and,
  db,
  desc,
  eq,
  inArray,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import { reflinkRepository } from "@chatbotx.io/database/repositories"
import { reflinkModel } from "@chatbotx.io/database/schema"
import type { ReflinkModel } from "@chatbotx.io/database/types"
import { createId } from "@chatbotx.io/utils"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import { inboxService } from "../inbox/service"
import { type IdLabel, selectLabelsByIds } from "../select-labels-by-ids"
import { assertDeletable } from "../template/installed-resource.service"
import { resolveWorkspaceFreezeReasonById } from "../workspace-lifecycle/with-blocked-owner-guard"

type SelectOptionRow = { id: string; name: string }
const OPTION_LIST_LIMIT = 500

type ReflinkCreateData = {
  name: string
  flowId: string
  customFieldId?: string | null
}

type ReflinkUpdateData = Partial<ReflinkCreateData>

export type ReflinkWidgetSettings = {
  authorizedDomains: string[]
  hiddenInboxIds: string[]
}

// The request schema (`z.hostname()`) already rejects whitespace and stray
// dots, so only case and duplicates are left to fold.
const normalizeDomains = (domains: string[]) => [
  ...new Set(domains.map((domain) => domain.toLowerCase())),
]

class ReflinkService extends BaseService {
  async list(input: {
    workspaceId: string
    keyword?: string | null
    page: number
    perPage: number
    sort?: { id: string; desc: boolean }[] | null
  }): Promise<{
    data: Awaited<ReturnType<typeof reflinkRepository.listPaginated>>
    pageCount: number
  }> {
    const [data, totalRows] = await Promise.all([
      reflinkRepository.listPaginated(input),
      reflinkRepository.count(input),
    ])

    const pageCount = Math.ceil(totalRows / input.perPage)

    return { data, pageCount }
  }

  async findOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<ReflinkModel> {
    const reflink = await reflinkRepository.findByIdAndWorkspace(input)
    if (!reflink) {
      throw notFoundException("Reflink not found")
    }
    return reflink
  }

  async find(input: {
    workspaceId: string
    id: string
  }): Promise<ReflinkModel | null> {
    return (await reflinkRepository.findByIdAndWorkspace(input)) ?? null
  }

  async create(input: {
    workspaceId: string
    data: ReflinkCreateData
  }): Promise<ReflinkModel> {
    try {
      const [created] = await db
        .insert(reflinkModel)
        .values({
          id: createId(),
          workspaceId: input.workspaceId,
          type: "refLink",
          ...input.data,
        })
        .returning()
      return created
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken")
      }
      throw error
    }
  }

  async update(
    ctx: { workspaceId: string; id: string },
    data: ReflinkUpdateData,
  ): Promise<ReflinkModel> {
    const reflink = await this.findOrFail(ctx)

    const hasChanges = Object.values(data).some((value) => value !== undefined)
    if (!hasChanges) {
      return reflink
    }

    try {
      const [updated] = await db
        .update(reflinkModel)
        .set(data)
        .where(
          and(
            eq(reflinkModel.id, reflink.id),
            eq(reflinkModel.workspaceId, ctx.workspaceId),
            eq(reflinkModel.type, "refLink"),
          ),
        )
        .returning()
      return updated
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw validationException("name", "Name is already taken")
      }
      throw error
    }
  }

  async updateWidgetSettings(
    ctx: { workspaceId: string; id: string },
    settings: ReflinkWidgetSettings,
  ): Promise<ReflinkModel> {
    const reflink = await this.findOrFail(ctx)
    const hiddenInboxes = await inboxService.listLabelsByIds({
      workspaceId: ctx.workspaceId,
      ids: [...new Set(settings.hiddenInboxIds)],
    })

    const [updated] = await db
      .update(reflinkModel)
      .set({
        widgetAuthorizedDomains: normalizeDomains(settings.authorizedDomains),
        widgetHiddenInboxIds: hiddenInboxes.map((inbox) => inbox.id),
      })
      .where(
        and(
          eq(reflinkModel.id, reflink.id),
          eq(reflinkModel.workspaceId, ctx.workspaceId),
          eq(reflinkModel.type, "refLink"),
        ),
      )
      .returning()
    return updated
  }

  /**
   * Public chat widget lookup. Null when the ref link is gone or its
   * workspace is frozen (pending deletion, purged, or owner blocked).
   */
  async findForWidget(id: string): Promise<ReflinkModel | null> {
    const reflink = await reflinkRepository.findById(id)
    if (!reflink) {
      return null
    }
    const { freezeReason } = await resolveWorkspaceFreezeReasonById(
      reflink.workspaceId,
    )
    return freezeReason ? null : reflink
  }

  async listOptions(input: {
    workspaceId: string
  }): Promise<SelectOptionRow[]> {
    return await db
      .select({
        id: reflinkModel.id,
        name: reflinkModel.name,
      })
      .from(reflinkModel)
      .where(
        and(
          eq(reflinkModel.workspaceId, input.workspaceId),
          eq(reflinkModel.type, "refLink"),
        ),
      )
      .orderBy(desc(reflinkModel.createdAt))
      .limit(OPTION_LIST_LIMIT)
  }

  async deleteMany(input: {
    workspaceId: string
    ids: string[]
  }): Promise<void> {
    await assertDeletable({
      workspaceId: input.workspaceId,
      resourceKind: "reflink",
      resourceIds: input.ids,
    })

    await db
      .delete(reflinkModel)
      .where(
        and(
          eq(reflinkModel.workspaceId, input.workspaceId),
          eq(reflinkModel.type, "refLink"),
          inArray(reflinkModel.id, input.ids),
        ),
      )
  }

  /** Existing ref links only (QR codes excluded). */
  async listLabelsByIds(input: {
    workspaceId: string
    ids: string[]
  }): Promise<IdLabel[]> {
    return await selectLabelsByIds(reflinkModel, {
      ...input,
      where: eq(reflinkModel.type, "refLink"),
    })
  }
}

export const reflinkService = new ReflinkService()
