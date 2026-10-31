import type { DatabaseClient } from "../../client"
import { and, asc, db, eq, isNull, sql } from "../../client"
import { aiFileModel, templateInstalledResourceModel } from "../../schema"

export type QueuedTemplateAiFile = {
  /** The installation that tracks this copy (its warnings list is where a give-up is reported). */
  installationId: string
  aiFileId: string
  workspaceId: string
  runId: string
  queuedAt: string
}

/**
 * AI files a template install created whose first embedding run is still
 * `queued`: the install transaction writes the row but cannot enqueue the job
 * (it could outrun the commit), so something has to. Only copies a template
 * installed and still tracks (`detachedAt IS NULL`) are returned — regular AI
 * files are never touched.
 */
export const templateAiFileDispatchRepository = {
  /** Queued runs of one installation, to enqueue right after it commits. */
  async listQueuedForInstallation(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<QueuedTemplateAiFile[]> {
    return await selectQueued(tx, [
      eq(templateInstalledResourceModel.installationId, installationId),
    ])
  },

  /**
   * Queued runs older than `queuedBefore` across all installations: the
   * enqueue after commit was lost (worker died, queue unavailable).
   */
  async listQueuedBefore(
    input: { queuedBefore: Date; limit: number },
    tx: DatabaseClient = db,
  ): Promise<QueuedTemplateAiFile[]> {
    return await selectQueued(
      tx,
      [
        sql`${aiFileModel.processingRun}->>'queuedAt' < ${input.queuedBefore.toISOString()}`,
      ],
      input.limit,
    )
  },
}

const selectQueued = async (
  tx: DatabaseClient,
  extra: Parameters<typeof and>,
  limit = 500,
): Promise<QueuedTemplateAiFile[]> => {
  const rows = await tx
    .select({
      aiFileId: aiFileModel.id,
      workspaceId: aiFileModel.workspaceId,
      installationId: templateInstalledResourceModel.installationId,
      run: aiFileModel.processingRun,
    })
    .from(aiFileModel)
    .innerJoin(
      templateInstalledResourceModel,
      and(
        // Leading column of the table's lookup indexes.
        eq(templateInstalledResourceModel.workspaceId, aiFileModel.workspaceId),
        eq(templateInstalledResourceModel.resourceId, aiFileModel.id),
        eq(templateInstalledResourceModel.resourceKind, "aiFile"),
        isNull(templateInstalledResourceModel.detachedAt),
      ),
    )
    .where(
      and(sql`${aiFileModel.processingRun}->>'status' = 'queued'`, ...extra),
    )
    .orderBy(asc(aiFileModel.id))
    .limit(limit)
  return rows.flatMap(({ aiFileId, workspaceId, installationId, run }) =>
    run
      ? [
          {
            installationId,
            aiFileId,
            workspaceId,
            runId: run.id,
            queuedAt: run.queuedAt,
          },
        ]
      : [],
  )
}
