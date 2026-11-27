import { type DatabaseClient, db } from "../../client"

/** Narrow a manifest lookup to ids, names, or neither (every row, up to `limit`). */
type ManifestLookup = {
  workspaceId: string
  ids?: readonly string[]
  names?: readonly string[]
  limit?: number
}

/** An explicit empty filter matches nothing: skip the query. */
const matchesNothing = (lookup: ManifestLookup) =>
  lookup.ids?.length === 0 || lookup.names?.length === 0

/** An install creates rows in manifest order, so the source's order survives it. */
const OLDEST_FIRST = { createdAt: "asc", id: "asc" } as const

/**
 * The source-workspace tags and custom fields a template snapshot ships as
 * manifests: picked ones, ones its flows reference by id or by name, or all.
 */
export const templateSnapshotRepository = {
  /** Live (not deleted) tags of the workspace. */
  async findTags(
    lookup: ManifestLookup,
    tx: DatabaseClient = db,
  ): Promise<{ id: string; name: string; folderId: string | null }[]> {
    if (matchesNothing(lookup)) {
      return []
    }
    return await tx.query.tagModel.findMany({
      where: {
        workspaceId: lookup.workspaceId,
        deletedAt: { isNull: true as const },
        ...(lookup.ids ? { id: { in: [...lookup.ids] } } : {}),
        ...(lookup.names ? { name: { in: [...lookup.names] } } : {}),
      },
      columns: { id: true, name: true, folderId: true },
      orderBy: OLDEST_FIRST,
      limit: lookup.limit,
    })
  },

  /** Custom fields of the workspace. */
  async findCustomFields(lookup: ManifestLookup, tx: DatabaseClient = db) {
    if (matchesNothing(lookup)) {
      return []
    }
    return await tx.query.customFieldModel.findMany({
      where: {
        workspaceId: lookup.workspaceId,
        ...(lookup.ids ? { id: { in: [...lookup.ids] } } : {}),
        ...(lookup.names ? { name: { in: [...lookup.names] } } : {}),
      },
      columns: { id: true, name: true, type: true, folderId: true },
      orderBy: OLDEST_FIRST,
      limit: lookup.limit,
    })
  },
}
