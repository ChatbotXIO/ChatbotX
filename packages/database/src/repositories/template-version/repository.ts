import { and, type DatabaseClient, db, desc, eq, sql } from "../../client"
import { templateVersionModel } from "../../schema"
import type { TemplatePayload } from "../../schema/template"

/** Versions kept regardless of use; older ones go once nothing pins them. */
const RETAINED_VERSIONS = 20

export const templateVersionRepository = {
  /**
   * Serialises pinning a version (an install or sync request) against the
   * prune a save runs: an uncommitted pin is invisible to a concurrent
   * `NOT EXISTS`, so both sides take this lock.
   */
  async lockVersions(templateId: string, tx: DatabaseClient): Promise<void> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`tpl-ver:${templateId}`}, 0))`,
    )
  },

  async insert(
    input: {
      id: string
      templateId: string
      workspaceId: string
      version: number
      payload: TemplatePayload
      payloadHash: string
      formatVersion: number
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx.insert(templateVersionModel).values(input).onConflictDoNothing()
  },

  async find(
    input: { templateId: string; version: number },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.templateVersionModel.findFirst({
      where: { templateId: input.templateId, version: input.version },
    })
  },

  async findLatest(templateId: string, tx: DatabaseClient = db) {
    const [row] = await tx
      .select()
      .from(templateVersionModel)
      .where(eq(templateVersionModel.templateId, templateId))
      .orderBy(desc(templateVersionModel.version))
      .limit(1)
    return row
  },

  /**
   * Drops versions older than the newest `RETAINED_VERSIONS` that no
   * unfinished installation or sync is pinned to. Caller holds `lockVersions`.
   */
  async prune(
    input: { templateId: string; latestVersion: number },
    tx: DatabaseClient = db,
  ): Promise<void> {
    const cutoff = input.latestVersion - RETAINED_VERSIONS
    if (cutoff < 1) {
      return
    }
    await tx.delete(templateVersionModel).where(
      and(
        eq(templateVersionModel.templateId, input.templateId),
        sql`${templateVersionModel.version} <= ${cutoff}`,
        sql`NOT EXISTS (
          SELECT 1 FROM "TemplateInstallation" ti
          WHERE ti."sourceTemplateId" = ${templateVersionModel.templateId}
            AND ti."sourceVersion" = ${templateVersionModel.version}
            AND ti."status" IN ('pending', 'installing', 'failed')
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM "TemplateInstallationSync" s
          JOIN "TemplateInstallation" ti ON ti."id" = s."installationId"
          WHERE ti."sourceTemplateId" = ${templateVersionModel.templateId}
            AND s."requestedVersion" = ${templateVersionModel.version}
            AND s."status" IN ('pending', 'running')
        )`,
      ),
    )
  },
}
