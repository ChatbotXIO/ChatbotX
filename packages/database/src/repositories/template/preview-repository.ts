import { type DatabaseClient, db } from "../../client"
import type { FolderType } from "../../partials/folder"

/**
 * What a template install would find in the target workspace, read for the
 * collision preview. Narrow projections only: the planning itself stays in
 * the business layer, next to the install that it predicts.
 */
export const templatePreviewRepository = {
  /** Live tags with exactly these names. */
  async findTagsByNames(
    input: { workspaceId: string; names: readonly string[] },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; name: string }[]> {
    if (input.names.length === 0) {
      return []
    }
    return await tx.query.tagModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        deletedAt: { isNull: true as const },
        name: { in: [...input.names] },
      },
      columns: { id: true, name: true },
    })
  },

  /** Every place category of the workspace (a workspace has few). */
  async listPlaceCategories(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<{ id: string; name: string }[]> {
    return await tx.query.placeCategoryModel.findMany({
      where: { workspaceId },
      columns: { id: true, name: true },
    })
  },

  /** Every custom field of the workspace, as the install's name fold reads them. */
  async listCustomFields(workspaceId: string, tx: DatabaseClient = db) {
    return await tx.query.customFieldModel.findMany({
      where: { workspaceId },
      columns: { id: true, name: true, type: true },
    })
  },

  /** Every bot field of the workspace, as the install's name fold reads them. */
  async listBotFields(workspaceId: string, tx: DatabaseClient = db) {
    return await tx.query.botFieldModel.findMany({
      where: { workspaceId },
      columns: { id: true, name: true, type: true },
    })
  },

  /** Folders of these types with one of these names; the parent match runs in memory. */
  async findFolders(
    input: {
      workspaceId: string
      folderTypes: readonly FolderType[]
      names: readonly string[]
    },
    tx: DatabaseClient = db,
  ) {
    if (input.folderTypes.length === 0 || input.names.length === 0) {
      return []
    }
    return await tx.query.folderModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        folderType: { in: [...input.folderTypes] },
        name: { in: [...input.names] },
      },
      columns: { id: true, folderType: true, name: true, parentId: true },
    })
  },
}
