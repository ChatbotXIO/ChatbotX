import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { folderModel } from "@chatbotx.io/database/schema"
import type { FolderModel } from "@chatbotx.io/database/types"
import type { TemplateFolderManifestEntry } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import type { TemplateInstallContext } from "../types"

/**
 * Find-or-create folders from the template's folder manifest, keyed on
 * `(name, folderType)` — NEVER name alone. `AutomatedResponse` (Keywords) is
 * one table serving two `FolderType`s (`automatedResponse` for inbound,
 * `outboundAutomatedResponse` for outbound); a name-only key would collapse
 * the two namespaces and silently land inbound keywords in an outbound
 * folder. See `packages/business/src/folder/service.ts` `changeFolder` for
 * the sibling enforcement of this same invariant.
 *
 * Resolves parents before children by repeatedly draining entries whose
 * `parentSourceId` is already resolved (or null), so a manifest ordered
 * arbitrarily still produces correct `paths`.
 */
export const resolveFolderManifest = async (
  ctx: TemplateInstallContext,
  manifest: Readonly<Record<string, TemplateFolderManifestEntry>>,
  /**
   * Provenance category for warnings/tracking on rows this call creates.
   * Folders are shared infrastructure used by several categories (flow,
   * keywords, trigger, ...) — the caller, not this module, knows which
   * category a given manifest entry actually belongs to.
   */
  category: TemplateCategory,
): Promise<void> => {
  const entries = Object.entries(manifest)
  if (entries.length === 0) {
    return
  }

  if (!ctx.idMaps.folder) {
    ctx.idMaps.folder = new Map()
  }
  const idMap = ctx.idMaps.folder
  const remaining = new Map(entries)

  // Bounded by entries.length: each successful iteration resolves at least
  // one entry, so a cycle in parentSourceId simply leaves the cycle
  // unresolved (skipped, not looped forever) rather than hanging.
  for (let pass = 0; pass < entries.length && remaining.size > 0; pass++) {
    const resolvedThisPass: string[] = []

    for (const [sourceId, entry] of remaining) {
      const parentTargetId = resolveParentTargetId(entry.parentSourceId, idMap)
      if (parentTargetId === "unresolved") {
        continue
      }

      const targetId = await findOrCreateFolder(
        ctx,
        entry,
        parentTargetId,
        category,
      )
      idMap.set(sourceId, targetId)
      resolvedThisPass.push(sourceId)
    }

    for (const sourceId of resolvedThisPass) {
      remaining.delete(sourceId)
    }
    if (resolvedThisPass.length === 0) {
      break
    }
  }

  for (const [sourceId, entry] of remaining) {
    ctx.warn({
      category,
      entityKind: "folder",
      path: `manifests.folders.${sourceId}`,
      value: entry.parentSourceId ?? "",
    })
  }
}

const resolveParentTargetId = (
  parentSourceId: string | null,
  idMap: Map<string, string>,
): string | null | "unresolved" => {
  if (!parentSourceId || parentSourceId === rootFolderId) {
    return null
  }
  const resolved = idMap.get(parentSourceId)
  return resolved ?? "unresolved"
}

const findOrCreateFolder = async (
  ctx: TemplateInstallContext,
  entry: TemplateFolderManifestEntry,
  parentTargetId: string | null,
  category: TemplateCategory,
): Promise<string> => {
  const existing = await ctx.tx.query.folderModel.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      folderType: entry.folderType as FolderModel["folderType"],
      name: entry.name,
      parentId: parentTargetId ?? { isNull: true as const },
    },
  })
  if (existing) {
    ctx.track({
      category,
      resourceKind: "folder",
      resourceId: existing.id,
      sourceResourceId: existing.id,
      wasExisting: true,
    })
    return existing.id
  }

  const paths = parentTargetId
    ? await resolveParentPaths(ctx, parentTargetId)
    : []

  const [created] = await ctx.tx
    .insert(folderModel)
    .values({
      id: createId(),
      workspaceId: ctx.workspaceId,
      name: entry.name,
      folderType: entry.folderType as FolderModel["folderType"],
      parentId: parentTargetId,
      paths,
    })
    .returning()

  ctx.track({
    category,
    resourceKind: "folder",
    resourceId: created.id,
    sourceResourceId: created.id,
    wasExisting: false,
  })
  return created.id
}

const resolveParentPaths = async (
  ctx: TemplateInstallContext,
  parentId: string,
): Promise<string[]> => {
  const parent = await ctx.tx.query.folderModel.findFirst({
    where: { id: parentId },
  })
  return parent ? [...parent.paths, parent.id] : []
}
