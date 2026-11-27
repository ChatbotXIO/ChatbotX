import { and, asc, type DatabaseClient, db, eq, lt, sql } from "../../client"
import { templateInstallationModel } from "../../schema"

/** After-publish effects an installation still owes. */
export const templateInstallationPublishEffectsRepository = {
  /** Adds owed after-publish effects to an installation, in the caller's transaction. */
  async addPendingPublishEffects(
    input: {
      id: string
      effects: readonly { flowId: string; versionId: string }[]
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.effects.length === 0) {
      return
    }
    await tx
      .update(templateInstallationModel)
      .set({
        pendingPublishEffects: sql`coalesce(${templateInstallationModel.pendingPublishEffects}, '[]'::jsonb) || ${JSON.stringify(input.effects)}::jsonb`,
      })
      .where(eq(templateInstallationModel.id, input.id))
  },

  async findPendingPublishEffects(
    id: string,
    tx: DatabaseClient = db,
  ): Promise<{ flowId: string; versionId: string }[]> {
    const row = await tx.query.templateInstallationModel.findFirst({
      where: { id },
      columns: { pendingPublishEffects: true },
    })
    return row?.pendingPublishEffects ?? []
  },

  /**
   * Clears the effects that were just run, keeping any another run added in
   * the meantime (matched by value, not by position).
   */
  async clearPendingPublishEffects(
    input: {
      id: string
      done: readonly { flowId: string; versionId: string }[]
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.done.length === 0) {
      return
    }
    await tx
      .update(templateInstallationModel)
      .set({
        pendingPublishEffects: sql`nullif(coalesce((
          SELECT jsonb_agg(effect)
          FROM jsonb_array_elements(${templateInstallationModel.pendingPublishEffects}) AS effect
          WHERE NOT (effect IN (SELECT jsonb_array_elements(${JSON.stringify(input.done)}::jsonb)))
        ), '[]'::jsonb), '[]'::jsonb)`,
      })
      .where(eq(templateInstallationModel.id, input.id))
  },

  /**
   * Moves an installation whose effects failed to the back of the sweep's
   * `updatedAt` order (and past its grace window again), so a row that keeps
   * failing cannot hold the head of every sweep page.
   */
  async deferPendingPublishEffects(
    id: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstallationModel)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(templateInstallationModel.id, id),
          sql`${templateInstallationModel.pendingPublishEffects} IS NOT NULL`,
        ),
      )
  },

  /** Installations still owing after-publish effects: a crash between commit and run. */
  async listWithPendingPublishEffects(
    input: { settledBefore: Date; limit: number },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string }[]> {
    return await tx
      .select({
        id: templateInstallationModel.id,
        workspaceId: templateInstallationModel.workspaceId,
      })
      .from(templateInstallationModel)
      .where(
        and(
          sql`${templateInstallationModel.pendingPublishEffects} IS NOT NULL`,
          lt(templateInstallationModel.updatedAt, input.settledBefore),
        ),
      )
      .orderBy(asc(templateInstallationModel.updatedAt))
      .limit(input.limit)
  },
}
