import {
  and,
  type DatabaseClient,
  desc,
  eq,
  inArray,
  lt,
  ne,
  or,
  sql,
} from "../../client"
import {
  TEMPLATE_INSTALLER_WARNING_CODES,
  type TemplateCategory,
} from "../../partials/template"
import {
  stagedCleanupOwed,
  templateInstallationModel,
  templateInstallationSyncModel,
  templateInstalledResourceModel,
  templateModel,
} from "../../schema"
import type { TemplateInstallationModel } from "../../types"

const notIn = (
  column: ReturnType<typeof sql>,
  visible: readonly TemplateCategory[],
) =>
  visible.length > 0
    ? sql` AND ${column} NOT IN (${sql.join(
        visible.map((category) => sql`${category}`),
        sql`, `,
      )})`
    : sql``

/**
 * The installation is about some category outside `visible`, so a member
 * lacking that category's permission does not see it at all. Judged by its
 * copies; one without copies yet (pending, or failed early) by the categories
 * of its source template, and hidden when that template is gone.
 */
export const holdsCategoryOutside = (visible: readonly TemplateCategory[]) => {
  const resource = templateInstalledResourceModel
  const ofInstallation = sql`${resource.installationId} = ${templateInstallationModel.id}`
  return sql<boolean>`(
    EXISTS (SELECT 1 FROM ${resource} WHERE ${ofInstallation}${notIn(sql`${resource.category}::text`, visible)})
    OR (
      NOT EXISTS (SELECT 1 FROM ${resource} WHERE ${ofInstallation})
      AND (
        NOT EXISTS (SELECT 1 FROM ${templateModel} WHERE ${templateModel.id} = ${templateInstallationModel.sourceTemplateId})
        OR EXISTS (
          SELECT 1 FROM ${templateModel}, jsonb_each_text(${templateModel.categoryCounts}) AS counts(category, total)
          WHERE ${templateModel.id} = ${templateInstallationModel.sourceTemplateId}
            AND counts.total::numeric > 0${notIn(sql`counts.category`, visible)}
        )
      )
    )
  )`
}

/** Only the current owner of the lease may write; zero rows means it was fenced out. */
export const ownedByClaim = (input: { id: string; claimToken: string }) =>
  and(
    eq(templateInstallationModel.id, input.id),
    eq(templateInstallationModel.status, "installing"),
    eq(templateInstallationModel.claimToken, input.claimToken),
  )

/** `pending` for too long (never enqueued, or the job was lost) or `installing` past its lease. */
export const unfinishedInstallation = (input: {
  pendingBefore: Date
  leaseExpiredBefore: Date
}) =>
  or(
    and(
      eq(templateInstallationModel.status, "pending"),
      lt(templateInstallationModel.createdAt, input.pendingBefore),
    ),
    and(
      eq(templateInstallationModel.status, "installing"),
      lt(templateInstallationModel.claimedAt, input.leaseExpiredBefore),
    ),
  )

/**
 * Staged-object generations still to delete. The current generation is owed
 * only once the install failed (and its lease window has passed); an older one
 * is owed as soon as a retry moved on, since nothing writes it again.
 */
export const stagedCleanupDue = (input: { completedBefore: Date }) =>
  and(
    // The partial index's own predicate, verbatim, so the sweep scans it.
    stagedCleanupOwed(templateInstallationModel),
    or(
      ne(templateInstallationModel.status, "failed"),
      lt(templateInstallationModel.completedAt, input.completedBefore),
    ),
  )

/** A sync of this installation is queued or running. */
export const hasActiveSync = () =>
  sql<boolean>`EXISTS (SELECT 1 FROM ${templateInstallationSyncModel} WHERE ${templateInstallationSyncModel.installationId} = ${templateInstallationModel.id} AND ${templateInstallationSyncModel.status} IN ('pending', 'running'))`

/** How many of the stored warnings are shown to the installer. */
export const installerWarningCount = () =>
  sql<number>`(SELECT count(*)::int FROM jsonb_array_elements(${templateInstallationModel.warnings}) AS warning WHERE warning->>'entityKind' IN (${sql.join(
    TEMPLATE_INSTALLER_WARNING_CODES.map((code) => sql`${code}`),
    sql`, `,
  )}))`

export const findNewestBySourceTemplate = async (
  input: { workspaceId: string; sourceTemplateId: string },
  statuses: TemplateInstallationModel["status"][],
  tx: DatabaseClient,
): Promise<TemplateInstallationModel | null> => {
  const [row] = await tx
    .select()
    .from(templateInstallationModel)
    .where(
      and(
        eq(templateInstallationModel.workspaceId, input.workspaceId),
        eq(templateInstallationModel.sourceTemplateId, input.sourceTemplateId),
        inArray(templateInstallationModel.status, statuses),
      ),
    )
    .orderBy(desc(templateInstallationModel.id))
    .limit(1)
  return row ?? null
}
