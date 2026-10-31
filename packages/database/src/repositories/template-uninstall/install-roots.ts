import { and, type DatabaseClient, db, eq, sql } from "../../client"
import {
  templateInstallationModel,
  templateInstalledResourceModel,
} from "../../schema"

/** Source id prefix the install tracks its per-namespace root folders under. */
export const INSTALL_ROOT_PREFIX = "__installRoot:"

export type InstallFolderRow = {
  folderId: string
  workspaceId: string
  /** The installation's own tracked row for the folder, if it tracks one. */
  trackedRowId: string | null
}

/** The tables and columns that hold a `Folder` id, read once from the catalog. */
let folderReferenceColumns: { table: string; column: string }[] | undefined

const listFolderReferenceColumns = async (
  tx: DatabaseClient,
): Promise<{ table: string; column: string }[]> => {
  if (folderReferenceColumns) {
    return folderReferenceColumns
  }
  const result = await tx.execute<{ table_name: string; column_name: string }>(
    sql`SELECT c.conrelid::regclass::text AS table_name, a.attname AS column_name
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f' AND c.confrelid = '"Folder"'::regclass
          AND c.conrelid <> '"Folder"'::regclass
          -- Our own bookkeeping points at the install folder; it is not content.
          AND c.conrelid <> '"TemplateInstallation"'::regclass`,
  )
  folderReferenceColumns = result.rows.map((row) => ({
    table: row.table_name,
    column: row.column_name,
  }))
  return folderReferenceColumns
}

/** The install folders (roots) of an installation and their delete-if-empty. */
export const templateUninstallInstallRootRepository = {
  /**
   * Every folder the install created to nest its copies under: the one shown
   * on the installation plus one root per other folder namespace (each tracked
   * under a synthetic `__installRoot:<folderType>` source id), with the
   * tracked row for each.
   */
  async findInstallRoots(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<InstallFolderRow[]> {
    const [installation] = await tx
      .select({
        folderId: templateInstallationModel.installFolderId,
        workspaceId: templateInstallationModel.workspaceId,
      })
      .from(templateInstallationModel)
      .where(eq(templateInstallationModel.id, installationId))
    if (!installation) {
      return []
    }
    const tracked = await tx
      .select({
        id: templateInstalledResourceModel.id,
        resourceId: templateInstalledResourceModel.resourceId,
        sourceResourceId: templateInstalledResourceModel.sourceResourceId,
        wasExisting: templateInstalledResourceModel.wasExisting,
      })
      .from(templateInstalledResourceModel)
      .where(
        and(
          eq(templateInstalledResourceModel.installationId, installationId),
          eq(templateInstalledResourceModel.resourceKind, "folder"),
        ),
      )
    const rootRows = tracked.filter(
      (row) =>
        !row.wasExisting &&
        row.sourceResourceId.startsWith(INSTALL_ROOT_PREFIX),
    )
    const roots = new Map<string, InstallFolderRow>()
    for (const row of rootRows) {
      roots.set(row.resourceId, {
        folderId: row.resourceId,
        workspaceId: installation.workspaceId,
        trackedRowId: row.id,
      })
    }
    if (installation.folderId && !roots.has(installation.folderId)) {
      const own = tracked.find(
        (row) => row.resourceId === installation.folderId,
      )
      roots.set(installation.folderId, {
        folderId: installation.folderId,
        workspaceId: installation.workspaceId,
        trackedRowId: own?.id ?? null,
      })
    }
    return [...roots.values()]
  },

  /**
   * Deletes the folder only if nothing is in it: no sub-folder and no row in
   * any table holding a `Folder` id (read from the catalog, so a new folder
   * namespace is covered). The caller holds the folder's `tpl-res:` lock; the
   * row is also `FOR UPDATE`-locked so a concurrent move into it waits.
   */
  async deleteFolderIfEmpty(
    input: { workspaceId: string; folderId: string },
    tx: DatabaseClient,
  ): Promise<"deleted" | "notEmpty" | "absent"> {
    const locked = await tx.execute<{ id: string }>(
      sql`SELECT "id" FROM "Folder"
          WHERE "id" = ${input.folderId} AND "workspaceId" = ${input.workspaceId}
          FOR UPDATE`,
    )
    if (locked.rows.length === 0) {
      return "absent"
    }
    const children = await tx.execute(
      sql`SELECT 1 FROM "Folder" WHERE "workspaceId" = ${input.workspaceId}
          AND "paths" @> ARRAY[${input.folderId}]::bigint[]
          AND "id" <> ${input.folderId} LIMIT 1`,
    )
    if (children.rows.length > 0) {
      return "notEmpty"
    }
    for (const reference of await listFolderReferenceColumns(tx)) {
      const holder = await tx.execute(
        sql`SELECT 1 FROM ${sql.raw(reference.table)}
            WHERE ${sql.identifier(reference.column)} = ${input.folderId} LIMIT 1`,
      )
      if (holder.rows.length > 0) {
        return "notEmpty"
      }
    }
    await tx.execute(
      sql`DELETE FROM "Folder" WHERE "id" = ${input.folderId}
          AND "workspaceId" = ${input.workspaceId}`,
    )
    return "deleted"
  },
}
