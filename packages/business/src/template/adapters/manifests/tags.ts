import { inArray } from "@chatbotx.io/database/client"
import { tagModel } from "@chatbotx.io/database/schema"
import type { TemplateTagManifestEntry } from "@chatbotx.io/flow-config"
import { tagService } from "../../../tag/service"
import type { TemplateInstallContext } from "../types"

/**
 * Find-or-create tags from the template's manifest, reusing
 * `tagService.upsertByNames` verbatim for the actual find-or-create so there
 * is exactly one implementation of "does a tag with this name already exist
 * in this workspace". Queries existing tags first (rather than trusting
 * `upsertByNames`'s uniform return) purely to know which names were
 * pre-existing for accurate `wasExisting` provenance.
 *
 * `installFolder` (set when the template asked for an install folder) places
 * only the tags this call CREATES in it: a same-name tag the installer already had is
 * reused where it is and never moved.
 */
export const resolveTagManifest = async (
  ctx: TemplateInstallContext,
  manifest: Readonly<Record<string, TemplateTagManifestEntry>>,
  options: { installFolder?: () => Promise<string> } = {},
): Promise<void> => {
  const entries = Object.entries(manifest)
  if (entries.length === 0) {
    return
  }

  const names = entries.map(([, entry]) => entry.name.trim())
  const existingByName = new Map(
    (
      await ctx.tx.query.tagModel.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          deletedAt: { isNull: true as const },
          name: { in: names },
        },
        columns: { id: true, name: true },
      })
    ).map((row) => [row.name, row.id]),
  )

  const resolved = await tagService.upsertByNames({
    workspaceId: ctx.workspaceId,
    names,
    tx: ctx.tx,
  })
  const resolvedByName = new Map(resolved.map((row) => [row.name, row.id]))
  const createdIds = resolved
    .filter((row) => !existingByName.has(row.name))
    .map((row) => row.id)
  if (options.installFolder && createdIds.length > 0) {
    await ctx.tx
      .update(tagModel)
      .set({ folderId: await options.installFolder() })
      .where(inArray(tagModel.id, createdIds))
  }

  if (!ctx.idMaps.tag) {
    ctx.idMaps.tag = new Map()
  }
  const idMap = ctx.idMaps.tag
  for (const [sourceId, entry] of entries) {
    const name = entry.name.trim()
    const targetId = resolvedByName.get(name)
    if (!targetId) {
      ctx.warn({
        category: "tags",
        entityKind: "tag",
        path: `manifests.tags.${sourceId}`,
        value: sourceId,
      })
      continue
    }
    idMap.set(sourceId, targetId)
    ctx.track({
      category: "tags",
      resourceKind: "tag",
      resourceId: targetId,
      sourceResourceId: sourceId,
      wasExisting: existingByName.has(name),
    })
  }
}
