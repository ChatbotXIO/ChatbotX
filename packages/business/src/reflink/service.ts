import {
  and,
  type DatabaseClient,
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
import { mediaLibraryFileService } from "../media-library-file/service"
import { type IdLabel, selectLabelsByIds } from "../select-labels-by-ids"
import {
  assertReferencable,
  assertResourceEditable,
  changedKeysOf,
  withDeleteGuard,
} from "../template/installed-resource.service"
import { withTemplateLockedTransaction } from "../template/template-resource-locks"
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
  /** Media library file id, or empty for the app logo. */
  logoFileId: string
  brandName: string
  brandUrl: string
  /** Hex background of the default chat icon. */
  logoBackgroundColor: string
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

  /** The ref link with its chat widget logo path, for the widget settings API. */
  async findWidgetOrFail(input: { workspaceId: string; id: string }) {
    const reflink = await reflinkRepository.findWidgetByIdAndWorkspace(input)
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
    tx?: DatabaseClient
  }): Promise<ReflinkModel> {
    const flowId = input.data.flowId
    if (flowId && !input.tx) {
      // The referenced flow's lock must be held until the reference commits.
      return await withTemplateLockedTransaction((tx) =>
        this.create({ ...input, tx }),
      )
    }
    if (flowId && input.tx) {
      await assertReferencable({
        workspaceId: input.workspaceId,
        parents: [{ kind: "flow", resourceId: flowId }],
        tx: input.tx,
      })
    }
    try {
      const [created] = await (input.tx ?? db)
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
    const hasChanges = Object.values(data).some((value) => value !== undefined)
    if (!hasChanges) {
      return await this.findOrFail(ctx)
    }

    try {
      // The ref link and a re-pointed flow are locked before the stored row is
      // read, so the diff that decides the guard is computed under the lock.
      const updated = await withTemplateLockedTransaction(
        async (tx) => {
          const reflink = await reflinkRepository.findByIdAndWorkspace(ctx, tx)
          if (!reflink) {
            throw notFoundException("Reflink not found")
          }
          await assertResourceEditable({
            workspaceId: ctx.workspaceId,
            resourceKind: "reflink",
            resourceIds: [reflink.id],
            changedKeys: changedKeysOf(reflink, data),
            // A re-pointed flow is a parent the write references.
            referencedParents: data.flowId
              ? [{ kind: "flow", resourceId: data.flowId }]
              : [],
            tx,
          })
          const [row] = await tx
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
          return row
        },
        {
          workspaceId: ctx.workspaceId,
          initialKeys: [
            { kind: "reflink", resourceId: ctx.id },
            ...(data.flowId
              ? [{ kind: "flow" as const, resourceId: data.flowId }]
              : []),
          ],
        },
      )
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
    // Early not-found; the row is read again under the lock below.
    await this.findOrFail(ctx)
    const [hiddenInboxes] = await Promise.all([
      inboxService.listLabelsByIds({
        workspaceId: ctx.workspaceId,
        ids: [...new Set(settings.hiddenInboxIds)],
      }),
      this.assertWidgetLogo(ctx.workspaceId, settings.logoFileId),
    ])

    const [updated] = await withTemplateLockedTransaction(
      async (tx) => {
        // The lock is held before the stored row is read, so a sync/restore/
        // uninstall of the copy cannot race this write.
        const reflink = await reflinkRepository.findByIdAndWorkspace(ctx, tx)
        if (!reflink) {
          throw notFoundException("Reflink not found")
        }
        // Every widget setting (domains, hidden inboxes, logo, brand name and
        // URL) is the installer's: a template never ships any of them, so a
        // View-only copy locks none (Chatrace has no lock on entry points).
        return await tx
          .update(reflinkModel)
          .set({
            widgetAuthorizedDomains: normalizeDomains(
              settings.authorizedDomains,
            ),
            widgetHiddenInboxIds: hiddenInboxes.map((inbox) => inbox.id),
            widgetLogoFileId: settings.logoFileId || null,
            // The request sets brand name and URL together; both empty hides the
            // powered-by line.
            widgetBrandName: settings.brandName || null,
            widgetBrandUrl: settings.brandUrl || null,
            widgetLogoBackgroundColor: settings.logoBackgroundColor,
          })
          .where(
            and(
              eq(reflinkModel.id, reflink.id),
              eq(reflinkModel.workspaceId, ctx.workspaceId),
              eq(reflinkModel.type, "refLink"),
            ),
          )
          .returning()
      },
      {
        workspaceId: ctx.workspaceId,
        initialKeys: [{ kind: "reflink", resourceId: ctx.id }],
      },
    )
    return updated
  }

  /**
   * The logo must be an image in this workspace's media library — the id comes
   * from the client, and the file is served on third-party sites.
   */
  private async assertWidgetLogo(workspaceId: string, fileId: string) {
    if (!fileId) {
      return
    }
    const file = await mediaLibraryFileService.findById({
      workspaceId,
      id: fileId,
    })
    if (!file?.mimeType.startsWith("image/")) {
      throw validationException("logoFileId", "Logo must be an image")
    }
  }

  /**
   * Public chat widget lookup. Null when the ref link is gone or its
   * workspace is frozen (pending deletion, purged, or owner blocked).
   */
  async findForWidget(id: string) {
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
    await withDeleteGuard(
      {
        workspaceId: input.workspaceId,
        targets: [{ resourceKind: "reflink", resourceIds: input.ids }],
      },
      (tx) => this.deleteInTx(tx, { ...input, type: "refLink" }),
    )
  }

  /**
   * The delete core (row write only), shared with the QR code service and the
   * template uninstall so there is one implementation. `type` is omitted by
   * the uninstall (both kinds share the table). Returns the ids deleted.
   */
  async deleteInTx(
    tx: DatabaseClient,
    input: {
      workspaceId: string
      ids: string[]
      type?: ReflinkModel["type"]
    },
  ): Promise<string[]> {
    const rows = await tx
      .delete(reflinkModel)
      .where(
        and(
          eq(reflinkModel.workspaceId, input.workspaceId),
          input.type ? eq(reflinkModel.type, input.type) : undefined,
          inArray(reflinkModel.id, input.ids),
        ),
      )
      .returning({ id: reflinkModel.id })
    return rows.map((row) => String(row.id))
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
