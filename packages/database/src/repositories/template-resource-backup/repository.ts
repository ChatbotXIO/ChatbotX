import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  inArray,
  notInArray,
} from "../../client"
import { templateResourceBackupModel } from "../../schema"

/** Newest backups kept per installed resource. */
export const RETAINED_BACKUPS_PER_RESOURCE = 5

export type NewTemplateResourceBackup = {
  id: string
  workspaceId: string
  installationId: string
  syncId: string
  installedResourceId: string
  resourceKind: string
  resourceId: string
  formatVersion: number
  content: Record<string, unknown>
  byteSize: number
}

export const templateResourceBackupRepository = {
  async insert(
    values: NewTemplateResourceBackup,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx.insert(templateResourceBackupModel).values(values)
  },

  async findByIdAndInstallation(
    input: { id: string; installationId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.templateResourceBackupModel.findFirst({
      where: {
        id: input.id,
        installationId: input.installationId,
        workspaceId: input.workspaceId,
      },
    })
  },

  /** Backups of one sync, without their (large) content. */
  async listBySync(syncId: string, tx: DatabaseClient = db) {
    return await tx.query.templateResourceBackupModel.findMany({
      where: { syncId },
      columns: {
        id: true,
        installedResourceId: true,
        resourceKind: true,
        resourceId: true,
        byteSize: true,
        createdAt: true,
      },
      orderBy: { id: "asc" },
    })
  },

  /** Keeps the newest `RETAINED_BACKUPS_PER_RESOURCE` backups of the resource. */
  async pruneForResource(
    installedResourceId: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    const keep = await tx
      .select({ id: templateResourceBackupModel.id })
      .from(templateResourceBackupModel)
      .where(
        eq(
          templateResourceBackupModel.installedResourceId,
          installedResourceId,
        ),
      )
      .orderBy(desc(templateResourceBackupModel.id))
      .limit(RETAINED_BACKUPS_PER_RESOURCE)
    await tx.delete(templateResourceBackupModel).where(
      and(
        eq(
          templateResourceBackupModel.installedResourceId,
          installedResourceId,
        ),
        notInArray(
          templateResourceBackupModel.id,
          keep.map((row) => row.id),
        ),
      ),
    )
  },

  async deleteByIds(ids: string[], tx: DatabaseClient = db): Promise<void> {
    if (ids.length === 0) {
      return
    }
    await tx
      .delete(templateResourceBackupModel)
      .where(inArray(templateResourceBackupModel.id, ids))
  },
}
