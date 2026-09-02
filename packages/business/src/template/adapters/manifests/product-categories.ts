import { productCategoryRepository } from "@chatbotx.io/database/repositories"
import type { TemplateProductCategoryManifestEntry } from "@chatbotx.io/flow-config"
import type { TemplateInstallContext } from "../types"

const normalizeName = (name: string): string => name.trim()

/**
 * Find-or-create product categories from the template's manifest, resolving
 * parents before children (same drain-loop shape as the folder manifest,
 * since `productCategoryService.resolveByNames` is top-level-only and does
 * not support a parent chain). Match is case-insensitive on
 * `(workspaceId, parentId, name)`, mirroring the DB's own
 * `nullsNotDistinct` unique constraint on that triple.
 */
export const resolveProductCategoryManifest = async (
  ctx: TemplateInstallContext,
  manifest: Readonly<Record<string, TemplateProductCategoryManifestEntry>>,
): Promise<void> => {
  const entries = Object.entries(manifest)
  if (entries.length === 0) {
    return
  }

  if (!ctx.idMaps.productCategory) {
    ctx.idMaps.productCategory = new Map()
  }
  const idMap = ctx.idMaps.productCategory
  const remaining = new Map(entries)

  for (let pass = 0; pass < entries.length && remaining.size > 0; pass++) {
    const resolvedThisPass: string[] = []

    for (const [sourceId, entry] of remaining) {
      const parentTargetId = resolveParentTargetId(entry.parentSourceId, idMap)
      if (parentTargetId === "unresolved") {
        continue
      }

      const targetId = await findOrCreateProductCategory(
        ctx,
        entry,
        parentTargetId,
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
      category: "productCategories",
      entityKind: "productCategory",
      path: `manifests.productCategories.${sourceId}`,
      value: entry.parentSourceId ?? "",
    })
  }
}

const resolveParentTargetId = (
  parentSourceId: string | null,
  idMap: Map<string, string>,
): string | null | "unresolved" => {
  if (!parentSourceId) {
    return null
  }
  const resolved = idMap.get(parentSourceId)
  return resolved ?? "unresolved"
}

const findOrCreateProductCategory = async (
  ctx: TemplateInstallContext,
  entry: TemplateProductCategoryManifestEntry,
  parentTargetId: string | null,
): Promise<string> => {
  const name = normalizeName(entry.name)
  const allCategories = await productCategoryRepository.list(
    ctx.workspaceId,
    ctx.tx,
  )
  const existing = allCategories.find(
    (row) =>
      row.parentId === parentTargetId &&
      normalizeName(row.name).toLowerCase() === name.toLowerCase(),
  )
  if (existing) {
    ctx.track({
      category: "productCategories",
      resourceKind: "productCategory",
      resourceId: existing.id,
      sourceResourceId: existing.id,
      wasExisting: true,
    })
    return existing.id
  }

  const created = await productCategoryRepository.create(
    { workspaceId: ctx.workspaceId, name, parentId: parentTargetId },
    ctx.tx,
  )
  ctx.track({
    category: "productCategories",
    resourceKind: "productCategory",
    resourceId: created.id,
    sourceResourceId: created.id,
    wasExisting: false,
  })
  return created.id
}
