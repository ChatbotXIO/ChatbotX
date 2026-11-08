import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import {
  emptyTemplateUninstallCounts,
  isTemplateUninstallTombstone,
  TEMPLATE_UNINSTALL_COUNT_KEY_BY_OUTCOME,
  TEMPLATE_UNINSTALL_DOOMED,
  TEMPLATE_UNINSTALL_RETRY_TOMBSTONE,
  TEMPLATE_UNINSTALL_TOMBSTONES,
  type TemplateUninstallCounts,
  type TemplateUninstallEffect,
  type TemplateUninstallOutcome,
} from "../../partials/template"
import { templateInstalledResourceModel } from "../../schema"
import { INSTALL_ROOT_PREFIX } from "./install-roots"
/** Per-copy outcomes: tombstones, decisions, failures and the freeze bookkeeping. */
export const templateUninstallTombstoneRepository = {
  /** Counts derived from the persisted outcomes, so they are exact after a crash. */
  async countOutcomes(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<TemplateUninstallCounts> {
    const rows = await tx
      .select({
        outcome: templateInstalledResourceModel.uninstallOutcome,
        n: sql<number>`count(*)::int`,
      })
      .from(templateInstalledResourceModel)
      .where(
        and(
          eq(templateInstalledResourceModel.installationId, installationId),
          // Install roots are bookkeeping, not template content: the preview
          // leaves them out too (`countDecisions`).
          sql`NOT (${templateInstalledResourceModel.resourceKind} = 'folder'
            AND starts_with(${templateInstalledResourceModel.sourceResourceId}, ${INSTALL_ROOT_PREFIX}))`,
        ),
      )
      .groupBy(templateInstalledResourceModel.uninstallOutcome)
    const counts = emptyTemplateUninstallCounts()
    for (const row of rows) {
      if (!row.outcome || isTemplateUninstallTombstone(row.outcome)) {
        continue
      }
      counts[TEMPLATE_UNINSTALL_COUNT_KEY_BY_OUTCOME[row.outcome]] += row.n
      if (
        row.outcome === "deletedModified" ||
        row.outcome === "deletedUnverified"
      ) {
        // `deleted` is the total; these are the edited / unverifiable subsets.
        counts.deleted += row.n
      }
    }
    return counts
  },

  /** The `deleting` tombstones of an installation: what Phase B still has to do. */
  async listTombstones(
    installationId: string,
    limit: number,
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select()
      .from(templateInstalledResourceModel)
      .where(
        and(
          eq(templateInstalledResourceModel.installationId, installationId),
          inArray(templateInstalledResourceModel.uninstallOutcome, [
            ...TEMPLATE_UNINSTALL_TOMBSTONES,
          ]),
        ),
      )
      .orderBy(templateInstalledResourceModel.id)
      .limit(limit)
  },

  /** Persists decisions: one outcome (and optional effects) per installed-resource row. */
  async setOutcomes(
    input: {
      ids: string[]
      outcome: TemplateUninstallOutcome
      effects?: TemplateUninstallEffect[] | null
      detach?: boolean
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (input.ids.length === 0) {
      return
    }
    await tx
      .update(templateInstalledResourceModel)
      .set({
        uninstallOutcome: input.outcome,
        ...(input.effects === undefined
          ? {}
          : { uninstallEffects: input.effects }),
        ...(input.detach ? { detachedAt: new Date() } : {}),
      })
      .where(inArray(templateInstalledResourceModel.id, input.ids))
  },

  /** Forgets the stored prior flags, so nothing can restore them later. */
  async clearFrozenFrom(ids: string[], tx: DatabaseClient = db): Promise<void> {
    if (ids.length === 0) {
      return
    }
    await tx
      .update(templateInstalledResourceModel)
      .set({ uninstallFrozenFrom: null })
      .where(inArray(templateInstalledResourceModel.id, ids))
  },

  /** Stores the prior producer flags a freeze overwrote, in the freeze's own transaction. */
  async setFrozenFrom(
    entries: readonly { id: string; flags: Record<string, unknown> }[],
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (entries.length === 0) {
      return
    }
    const values = sql.join(
      entries.map(
        (entry) =>
          sql`(${entry.id}::bigint, ${JSON.stringify(entry.flags)}::jsonb)`,
      ),
      sql`, `,
    )
    await tx.execute(
      sql`UPDATE ${templateInstalledResourceModel} AS r
          SET "uninstallFrozenFrom" = v."flags"
          FROM (VALUES ${values}) AS v("id", "flags")
          WHERE r."id" = v."id"`,
    )
  },

  /**
   * The point of no return of these rows: their final dependents probe found
   * no holder, so from now on they are never kept, unfrozen or cancelled
   * again; they stay tombstoned and frozen until deleted.
   */
  async markDeleteCommitted(
    ids: string[],
    tx: DatabaseClient = db,
  ): Promise<void> {
    if (ids.length === 0) {
      return
    }
    await tx
      .update(templateInstalledResourceModel)
      .set({ uninstallDrainStartedAt: new Date() })
      .where(
        and(
          inArray(templateInstalledResourceModel.id, ids),
          sql`${templateInstalledResourceModel.uninstallDrainStartedAt} IS NULL`,
        ),
      )
  },

  /**
   * Hands the doomed rows of an installation back: every row still holding a
   * tombstone or a failed outcome loses its outcome, so a later uninstall
   * decides it afresh. Rows that were deleted or kept are not touched.
   */
  async untombstone(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstalledResourceModel)
      .set({
        uninstallOutcome: null,
        uninstallDrainStartedAt: null,
        uninstallFrozenFrom: null,
      })
      .where(
        and(
          eq(templateInstalledResourceModel.installationId, installationId),
          inArray(templateInstalledResourceModel.uninstallOutcome, [
            ...TEMPLATE_UNINSTALL_DOOMED,
          ]),
          sql`${templateInstalledResourceModel.detachedAt} IS NULL`,
          // Past the point of no return: left to finish, never handed back.
          sql`${templateInstalledResourceModel.uninstallDrainStartedAt} IS NULL`,
        ),
      )
  },

  /** Rows that hold a tombstone or a failed outcome (not yet deleted, not kept). */
  async listDoomed(installationId: string, tx: DatabaseClient = db) {
    return await tx
      .select()
      .from(templateInstalledResourceModel)
      .where(
        and(
          eq(templateInstalledResourceModel.installationId, installationId),
          inArray(templateInstalledResourceModel.uninstallOutcome, [
            ...TEMPLATE_UNINSTALL_DOOMED,
          ]),
          sql`${templateInstalledResourceModel.detachedAt} IS NULL`,
        ),
      )
  },

  /**
   * Retry of a `partial` run: `failed` outcomes go back to their tombstone
   * (`failedModified` back to `deletingModified`), nothing else moves. One
   * statement however many outcomes are in play.
   */
  async resetFailedToDeleting(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    const entries = Object.entries(TEMPLATE_UNINSTALL_RETRY_TOMBSTONE)
    const outcomeColumn = templateInstalledResourceModel.uninstallOutcome
    const cases = sql.join(
      entries.map(([from, to]) => sql`WHEN ${from} THEN ${to}`),
      sql` `,
    )
    await tx
      .update(templateInstalledResourceModel)
      .set({ uninstallOutcome: sql`CASE ${outcomeColumn} ${cases} END` })
      .where(
        and(
          eq(templateInstalledResourceModel.installationId, installationId),
          inArray(
            outcomeColumn,
            entries.map(([from]) => from as TemplateUninstallOutcome),
          ),
        ),
      )
  },
}
