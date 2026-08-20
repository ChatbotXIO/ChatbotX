import { db } from "@chatbotx.io/database/client"
import type { AutomatedResponseType } from "@chatbotx.io/database/partials"
import { automatedResponseService } from "../../automated-response/service"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
  TemplateInstallContext,
} from "./types"

type TemplateKeywordEntry = {
  sourceId: string
  type: AutomatedResponseType
  text: string | null
  keywords: string[]
  // Points at a `resources.flows` sourceId — flows insert *before* keywords
  // in Phase 1, so this resolves directly (no deferral needed).
  flowId: string | null
  // Points at a `manifests.folders` sourceId, resolved via `idMaps.folder`.
  // The folder manifest entry MUST have been keyed on `(name, folderType)`
  // matching this row's own `type` (`automatedResponseFolderTypeByType`) —
  // see `adapters/manifests/folders.ts` for the invariant this depends on.
  folderId: string | null
}

/**
 * Keywords (`AutomatedResponse`) insert after flows, so `flowId` resolves
 * directly. `folderId` resolves against the folder manifest — this is the
 * category most exposed to the "one table, two FolderTypes" bug: an
 * inbound keyword whose `folderId` sourceId was captured against an
 * `automatedResponse`-typed folder must land in that same folder, never in
 * the `outboundAutomatedResponse`-typed folder of the same name.
 */
export const keywordsAdapter: ResourceAdapter = {
  category: "keywords",
  providesKinds: [],
  consumesKinds: ["flow", "folder"],
  deferredKinds: [],

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ): Promise<PatchTask[]> {
    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as TemplateKeywordEntry
      const flowId = resolveReference(
        ctx,
        "flow",
        entry.sourceId,
        "flowId",
        entry.flowId,
      )
      const folderId = resolveReference(
        ctx,
        "folder",
        entry.sourceId,
        "folderId",
        entry.folderId,
      )

      const created = await automatedResponseService.create(
        ctx.workspaceId,
        {
          type: entry.type,
          text: entry.text,
          flowId,
          folderId,
          keywords: entry.keywords,
        },
        ctx.tx,
      )

      ctx.track({
        category: "keywords",
        resourceKind: "automatedResponse",
        resourceId: created.id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [] satisfies PatchTask[]
  },

  collector: {
    async resolveIds(workspaceId) {
      // "keywords" is the inbound half of `AutomatedResponse` — the
      // outbound half backs the unrelated "Page Automated Responses"
      // comment-automation feature, which has no export category of its
      // own. Without this filter, exporting "keywords" would silently
      // bundle a workspace's outbound rows too. Mirrors
      // `automatedResponseService.list`'s always-required `type` filter.
      const rows = await db.query.automatedResponseModel.findMany({
        where: { workspaceId, type: "inbound" },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      const uniqueIds = [...new Set(ids)]
      if (uniqueIds.length === 0) {
        return []
      }
      const rows = await db.query.automatedResponseModel.findMany({
        where: { workspaceId, type: "inbound", id: { in: uniqueIds } },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return {
          entries: [],
          folderIds: [],
          productCategoryIds: [],
          hardDependencies: [],
        }
      }
      const rows = await db.query.automatedResponseModel.findMany({
        where: { workspaceId, type: "inbound", id: { in: [...ids] } },
      })
      const entries = rows.map((row) => ({
        sourceId: row.id,
        type: row.type,
        text: row.text,
        keywords: row.keywords,
        flowId: row.flowId,
        folderId: row.folderId,
      }))
      const folderIds = rows.flatMap((row) =>
        row.folderId ? [row.folderId] : [],
      )

      return {
        entries,
        folderIds,
        productCategoryIds: [],
        hardDependencies: [],
      }
    },
  } satisfies ResourceCollector,
}

const resolveReference = (
  ctx: TemplateInstallContext,
  entityKind: string,
  sourceId: string,
  field: string,
  refSourceId: string | null,
): string | null => {
  if (!refSourceId) {
    return null
  }
  const targetId = ctx.idMaps[entityKind]?.get(refSourceId)
  if (!targetId) {
    ctx.warn({
      category: "keywords",
      entityKind,
      path: `keywords.${sourceId}.${field}`,
      value: refSourceId,
    })
    return null
  }
  return targetId
}
