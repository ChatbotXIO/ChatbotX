import { placeCategoryRepository } from "@chatbotx.io/database/repositories/place-category"
import type { TemplatePlaceCategoryManifestEntry } from "@chatbotx.io/flow-config"
import type { TemplateInstallContext } from "../types"

/**
 * Find-or-create place categories by name (case-insensitive, matched by the
 * database like the unique index), in one insert and one read. A same-name category the installer already
 * has is reused (`wasExisting`), so an uninstall never removes it; a created
 * one is empty until the installer adds locations.
 */
export const resolvePlaceCategoryManifest = async (
  ctx: TemplateInstallContext,
  manifest: Readonly<Record<string, TemplatePlaceCategoryManifestEntry>>,
): Promise<void> => {
  const entries = Object.entries(manifest)
  if (entries.length === 0) {
    return
  }
  const { idByName, createdIds } =
    await placeCategoryRepository.findOrCreateByNames(
      {
        workspaceId: ctx.workspaceId,
        names: entries.map(([, entry]) => entry.name),
      },
      ctx.tx,
    )
  ctx.idMaps.placeCategory ??= new Map()
  const idMap = ctx.idMaps.placeCategory
  for (const [sourceId, entry] of entries) {
    const targetId = idByName.get(entry.name.trim())
    if (!targetId) {
      ctx.warn({
        category: "flows",
        entityKind: "placeCategory",
        path: `manifests.placeCategories.${sourceId}`,
        value: sourceId,
      })
      continue
    }
    idMap.set(sourceId, targetId)
    ctx.track({
      // Created for the flow step that filters by it, like a pipeline.
      category: "flows",
      resourceKind: "placeCategory",
      resourceId: targetId,
      sourceResourceId: sourceId,
      wasExisting: !createdIds.has(targetId),
    })
  }
}
