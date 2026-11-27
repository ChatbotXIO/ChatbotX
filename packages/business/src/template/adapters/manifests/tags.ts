import { inArray } from "@chatbotx.io/database/client"
import { tagModel } from "@chatbotx.io/database/schema"
import type { TemplateTagManifestEntry } from "@chatbotx.io/flow-config"
import { tagService } from "../../../tag/service"
import type { TemplateInstallContext } from "../types"
import { placeCreatedRows } from "./folders"

/**
 * Find-or-create tags from the template's manifest, reusing
 * `tagService.upsertByNames` verbatim for the actual find-or-create so there
 * is exactly one implementation of "does a tag with this name already exist
 * in this workspace". Queries existing tags first (rather than trusting
 * `upsertByNames`'s uniform return) purely to know which names were
 * pre-existing for accurate `wasExisting` provenance.
 *
 * Only the tags this call CREATES are placed, in their template folder or else
 * `installFolder` (set when the template asked for an install folder): a
 * same-name tag the installer already had is reused where it is and never moved.
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
  const created = entries.flatMap(([, entry]) => {
    const name = entry.name.trim()
    const id = resolvedByName.get(name)
    return id && !existingByName.has(name)
      ? [{ id, folderSourceId: entry.folderSourceId }]
      : []
  })
  await placeCreatedRows(
    ctx,
    created,
    options.installFolder,
    async (folderId, ids) => {
      await ctx.tx
        .update(tagModel)
        .set({ folderId })
        .where(inArray(tagModel.id, ids))
    },
  )

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
