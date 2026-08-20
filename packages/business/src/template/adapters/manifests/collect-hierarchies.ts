import { db } from "@chatbotx.io/database/client"
import type { FolderModel } from "@chatbotx.io/database/types"
import type {
  TemplateFolderManifestEntry,
  TemplateProductCategoryManifestEntry,
} from "@chatbotx.io/flow-config"

/**
 * Walks each given folder id up to its root and returns manifest entries
 * keyed by the folder's own id (the `sourceId`-is-the-real-id convention
 * every collector follows — see `types.ts`). Safe to call once per category
 * with only that category's referenced folder ids; `buildTemplateSnapshot`
 * merges the results across categories, so a folder shared by two
 * categories (e.g. two Keyword rows in the same folder) is only walked
 * once each call but converges to one manifest entry regardless.
 *
 * Mirrors `resolveFolderManifest`'s install-side contract in reverse: that
 * function find-or-creates from `(name, folderType, parentSourceId)`, so
 * this must emit exactly that shape, with `parentSourceId` pointing at
 * another entry's `sourceId` in the same manifest (or `null` at the root).
 */
export const collectFolderAncestry = async (
  workspaceId: string,
  folderIds: readonly string[],
): Promise<Record<string, TemplateFolderManifestEntry>> => {
  const manifest: Record<string, TemplateFolderManifestEntry> = {}
  const pending = new Set(folderIds)

  while (pending.size > 0) {
    const idsToFetch = [...pending].filter((id) => !(id in manifest))
    pending.clear()
    if (idsToFetch.length === 0) {
      break
    }

    const rows = await db.query.folderModel.findMany({
      where: { workspaceId, id: { in: idsToFetch } },
    })

    for (const row of rows) {
      manifest[row.id] = toManifestEntry(row)
      if (row.parentId && !(row.parentId in manifest)) {
        pending.add(row.parentId)
      }
    }
  }

  return manifest
}

const toManifestEntry = (
  folder: Pick<FolderModel, "name" | "folderType" | "parentId">,
): TemplateFolderManifestEntry => ({
  name: folder.name,
  folderType: folder.folderType,
  parentSourceId: folder.parentId,
})

/**
 * Same walk-to-root shape as `collectFolderAncestry`, for the
 * `ProductCategory` self-reference — capped at two levels
 * (`productCategoryModel.ts`), so this only ever loops once in practice, but
 * the loop makes no assumption about that depth.
 */
export const collectProductCategoryAncestry = async (
  workspaceId: string,
  categoryIds: readonly string[],
): Promise<Record<string, TemplateProductCategoryManifestEntry>> => {
  const manifest: Record<string, TemplateProductCategoryManifestEntry> = {}
  const pending = new Set(categoryIds)

  while (pending.size > 0) {
    const idsToFetch = [...pending].filter((id) => !(id in manifest))
    pending.clear()
    if (idsToFetch.length === 0) {
      break
    }

    const rows = await db.query.productCategoryModel.findMany({
      where: { workspaceId, id: { in: idsToFetch } },
    })

    for (const row of rows) {
      manifest[row.id] = {
        name: row.name,
        parentSourceId: row.parentId,
      }
      if (row.parentId && !(row.parentId in manifest)) {
        pending.add(row.parentId)
      }
    }
  }

  return manifest
}
