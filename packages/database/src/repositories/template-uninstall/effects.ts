import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import type {
  TemplateUninstallEffect,
  TemplateWarning,
} from "../../partials/template"
import {
  templateInstallationModel,
  templateInstalledResourceModel,
} from "../../schema"

/** Above this many failed sweeps an effect is given up on (and logged), never retried forever. */
export const TEMPLATE_UNINSTALL_MAX_EFFECT_ATTEMPTS = 20

/** Post-commit effects of an uninstall and the warning recorded when one is given up. */
export const templateUninstallEffectRepository = {
  /** Records post-commit effects on rows without changing their outcome. */
  async setEffects(
    entries: readonly { id: string; effects: TemplateUninstallEffect[] }[],
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (entries.length === 0) {
      return
    }
    const values = sql.join(
      entries.map(
        (entry) =>
          sql`(${entry.id}::bigint, ${JSON.stringify(entry.effects)}::jsonb)`,
      ),
      sql`, `,
    )
    await tx.execute(
      sql`UPDATE ${templateInstalledResourceModel} AS r
          SET "uninstallEffects" = v."effects"
          FROM (VALUES ${values}) AS v("id", "effects")
          WHERE r."id" = v."id"`,
    )
  },

  /** A warning the installer sees on the installation (an effect that could not run). */
  async addInstallationWarning(
    input: { installationId: string; warning: TemplateWarning },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstallationModel)
      .set({
        warnings: sql`${templateInstallationModel.warnings} || ${JSON.stringify([input.warning])}::jsonb`,
        warningCount: sql`${templateInstallationModel.warningCount} + 1`,
      })
      .where(eq(templateInstallationModel.id, input.installationId))
  },

  /** Installed rows that still carry effects to run after commit (sweep retries them). */
  async listPendingEffects(installationId: string, tx: DatabaseClient = db) {
    return await tx
      .select({
        id: templateInstalledResourceModel.id,
        effects: templateInstalledResourceModel.uninstallEffects,
      })
      .from(templateInstalledResourceModel)
      .where(
        and(
          eq(templateInstalledResourceModel.installationId, installationId),
          sql`${templateInstalledResourceModel.uninstallEffects} IS NOT NULL`,
        ),
      )
  },

  /** Installations with effects still to run, least-tried then oldest first; given-up rows are skipped. */
  async listInstallationsWithPendingEffects(
    limit: number,
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string }[]> {
    const rows = await tx
      .select({
        id: templateInstalledResourceModel.installationId,
        workspaceId: templateInstalledResourceModel.workspaceId,
      })
      .from(templateInstalledResourceModel)
      .where(
        and(
          sql`${templateInstalledResourceModel.uninstallEffects} IS NOT NULL`,
          sql`${templateInstalledResourceModel.uninstallEffectsAttempts} < ${TEMPLATE_UNINSTALL_MAX_EFFECT_ATTEMPTS}`,
        ),
      )
      .groupBy(
        templateInstalledResourceModel.installationId,
        templateInstalledResourceModel.workspaceId,
      )
      .orderBy(
        sql`min(${templateInstalledResourceModel.uninstallEffectsAttempts})`,
        sql`min(${templateInstalledResourceModel.id})`,
      )
      .limit(limit)
    return rows
  },

  /**
   * Counts a failed run of these rows' effects. Rows that reached the limit
   * lose their record (the caller logs it): returns their ids.
   */
  async bumpEffectAttempts(
    ids: string[],
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    if (ids.length === 0) {
      return []
    }
    const rows = await tx
      .update(templateInstalledResourceModel)
      .set({
        uninstallEffectsAttempts: sql`${templateInstalledResourceModel.uninstallEffectsAttempts} + 1`,
      })
      .where(inArray(templateInstalledResourceModel.id, ids))
      .returning({
        id: templateInstalledResourceModel.id,
        attempts: templateInstalledResourceModel.uninstallEffectsAttempts,
      })
    return rows
      .filter((row) => row.attempts >= TEMPLATE_UNINSTALL_MAX_EFFECT_ATTEMPTS)
      .map((row) => row.id)
  },

  async clearEffects(ids: string[], tx: DatabaseClient = db): Promise<void> {
    if (ids.length === 0) {
      return
    }
    await tx
      .update(templateInstalledResourceModel)
      .set({ uninstallEffects: null })
      .where(inArray(templateInstalledResourceModel.id, ids))
  },
}
