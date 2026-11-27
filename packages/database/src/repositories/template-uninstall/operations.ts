import { createId } from "@chatbotx.io/utils"
import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import {
  emptyTemplateUninstallCounts,
  parseTemplateUninstallCounts,
  sumTemplateUninstallCounts,
  type TemplateUninstallRequester,
  type TemplateUninstallState,
} from "../../partials/template"
import {
  templateInstallationModel,
  templateUninstallOperationModel,
} from "../../schema"
import { FINAL_STATES, type TemplateUninstallFinalState } from "./claims"

/** The operation's state: the worst of its members (`skipped` only when none finished). */
const worstState = (
  states: ReadonlySet<TemplateUninstallState>,
): TemplateUninstallFinalState => {
  for (const state of ["failed", "partial"] as const) {
    if (states.has(state)) {
      return state
    }
  }
  return states.has("skipped") && !states.has("done") ? "skipped" : "done"
}

export type TemplateUninstallOperationRow =
  typeof templateUninstallOperationModel.$inferSelect

/** The `TemplateUninstallOperation` table: one operation per request, snapshotted when its last member ends. */
export const templateUninstallOperationRepository = {
  /** One operation per request, covering every installation of the group. */
  async createOperation(
    input: {
      workspaceId: string
      templateId: string | null
      publisherRef: string
      requestedByKind: TemplateUninstallRequester
      requestedBy: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<TemplateUninstallOperationRow> {
    const [row] = await tx
      .insert(templateUninstallOperationModel)
      .values({ ...input, auditLogId: createId() })
      .returning()
    return row
  },

  async operationIdOf(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ id: templateInstallationModel.uninstallOperationId })
      .from(templateInstallationModel)
      .where(eq(templateInstallationModel.id, installationId))
    return row?.id ?? null
  },

  /** True while any member of the operation is still `pending` or `running`. */
  async operationHasActiveMembers(
    operationId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .select({ id: templateInstallationModel.id })
      .from(templateInstallationModel)
      .where(
        and(
          eq(templateInstallationModel.uninstallOperationId, operationId),
          inArray(templateInstallationModel.uninstallState, [
            "pending",
            "running",
          ]),
        ),
      )
      .limit(1)
    return rows.length > 0
  },

  /**
   * Called inside the fenced finalization transaction. When the last member is
   * final, snapshots the members' counts and the worst state into the
   * operation, once (`state = 'pending'` guards a second write).
   */
  async finalizeOperationIfComplete(
    operationId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    // Serialize the last members finishing: each takes the operation row
    // first, so under READ COMMITTED exactly one sees "no active member left"
    // after the others committed (and nobody leaves it pending forever).
    const locked = await tx
      .select({ id: templateUninstallOperationModel.id })
      .from(templateUninstallOperationModel)
      .where(eq(templateUninstallOperationModel.id, operationId))
      .for("update")
    if (locked.length === 0) {
      return false
    }
    if (
      await templateUninstallOperationRepository.operationHasActiveMembers(
        operationId,
        tx,
      )
    ) {
      return false
    }
    const members = await tx
      .select({
        state: templateInstallationModel.uninstallState,
        counts: templateInstallationModel.uninstallCounts,
      })
      .from(templateInstallationModel)
      .where(eq(templateInstallationModel.uninstallOperationId, operationId))
    let counts = emptyTemplateUninstallCounts()
    for (const member of members) {
      counts = sumTemplateUninstallCounts(
        counts,
        parseTemplateUninstallCounts(member.counts) ??
          emptyTemplateUninstallCounts(),
      )
    }
    const states = new Set(members.map((member) => member.state))
    // An operation whose members were all re-pointed at a newer one is superseded.
    const state = states.size === 0 ? "skipped" : worstState(states)
    const rows = await tx
      .update(templateUninstallOperationModel)
      .set({ state, counts, finishedAt: new Date() })
      .where(
        and(
          eq(templateUninstallOperationModel.id, operationId),
          eq(templateUninstallOperationModel.state, "pending"),
        ),
      )
      .returning({ id: templateUninstallOperationModel.id })
    return rows.length > 0
  },

  /** `pending` operations none of whose members is still active: the sweep finalizes them. */
  async listOperationsToFinalize(
    limit: number,
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx
      .select({ id: templateUninstallOperationModel.id })
      .from(templateUninstallOperationModel)
      .where(
        and(
          eq(templateUninstallOperationModel.state, "pending"),
          sql`NOT EXISTS (SELECT 1 FROM ${templateInstallationModel}
                WHERE ${templateInstallationModel.uninstallOperationId} = ${templateUninstallOperationModel.id}
                AND ${templateInstallationModel.uninstallState} IN ('pending', 'running'))`,
        ),
      )
      .limit(limit)
    return rows.map((row) => row.id)
  },

  /** Final operations whose one audit summary was not delivered yet. */
  async listUndeliveredNotices(
    limit: number,
    tx: DatabaseClient = db,
  ): Promise<TemplateUninstallOperationRow[]> {
    return await tx
      .select()
      .from(templateUninstallOperationModel)
      .where(
        and(
          inArray(templateUninstallOperationModel.state, FINAL_STATES),
          sql`${templateUninstallOperationModel.noticeDeliveredAt} IS NULL`,
        ),
      )
      .limit(limit)
  },

  async markNoticeDelivered(
    operationId: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateUninstallOperationModel)
      .set({ noticeDeliveredAt: new Date() })
      .where(eq(templateUninstallOperationModel.id, operationId))
  },

  async findOperation(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateUninstallOperationRow | null> {
    const [row] = await tx
      .select()
      .from(templateUninstallOperationModel)
      .where(
        and(
          eq(templateUninstallOperationModel.id, input.id),
          eq(templateUninstallOperationModel.workspaceId, input.workspaceId),
        ),
      )
    return row ?? null
  },
}
