import type { AutomatedResponseType } from "@chatbotx.io/database/partials"
import { automatedResponseService } from "../../automated-response/service"
import type {
  PatchTask,
  ResourceAdapter,
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
