import { and, type DatabaseClient, db, eq } from "../../client"
import { templateInstalledResourceModel } from "../../schema"

/**
 * The marker of a dynamic image copy whose baked layer was rewritten by the
 * install and whose background has not been rendered again yet. Kept in the
 * copy's provenance row (`syncedHash`, which nothing reads or writes for this
 * kind: dynamic images have no sync fingerprint), so it needs no column.
 */
export const DYNAMIC_IMAGE_STALE_BACKGROUND = "dynamicImage:staleBackground"

const rowOf = (workspaceId: string, resourceId: string) =>
  and(
    eq(templateInstalledResourceModel.workspaceId, workspaceId),
    eq(templateInstalledResourceModel.resourceKind, "dynamicImage"),
    eq(templateInstalledResourceModel.resourceId, resourceId),
  )

export const dynamicImageStaleBackgroundRepository = {
  async mark(
    input: { workspaceId: string; resourceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstalledResourceModel)
      .set({ syncedHash: DYNAMIC_IMAGE_STALE_BACKGROUND })
      .where(rowOf(input.workspaceId, input.resourceId))
  },

  /** Only a row that carries the marker is written. */
  async clear(
    input: { workspaceId: string; resourceId: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstalledResourceModel)
      .set({ syncedHash: null })
      .where(
        and(
          rowOf(input.workspaceId, input.resourceId),
          eq(
            templateInstalledResourceModel.syncedHash,
            DYNAMIC_IMAGE_STALE_BACKGROUND,
          ),
        ),
      )
  },

  async isMarked(
    input: { workspaceId: string; resourceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .select({ id: templateInstalledResourceModel.id })
      .from(templateInstalledResourceModel)
      .where(
        and(
          rowOf(input.workspaceId, input.resourceId),
          eq(
            templateInstalledResourceModel.syncedHash,
            DYNAMIC_IMAGE_STALE_BACKGROUND,
          ),
        ),
      )
      .limit(1)
    return rows.length > 0
  },
}
