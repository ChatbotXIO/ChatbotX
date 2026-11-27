import {
  and,
  asc,
  type DatabaseClient,
  db,
  desc,
  eq,
  gt,
  lte,
  sql,
} from "../../client"
import type { TemplateVersionChange } from "../../partials/template"
import { templateVersionModel } from "../../schema"
import type { TemplatePayload } from "../../schema/template"

/**
 * The shared side of `templateVersionRepository.lockVersions`: pinners (an
 * install that only needs its version to survive until it commits) do not
 * conflict with each other, only with the prune, which takes the exclusive
 * lock. A workspace creation holds it for its whole, possibly long,
 * transaction, so it must never queue other creations behind one another.
 */
const lockVersionsShared = async (
  templateId: string,
  tx: DatabaseClient,
): Promise<void> => {
  await tx.execute(
    sql`select pg_advisory_xact_lock_shared(hashtextextended(${`tpl-ver:${templateId}`}, 0))`,
  )
}

/** Versions kept regardless of use; older ones go once nothing pins them. */
const RETAINED_VERSIONS = 20

/** Versions a history lists: every retained one, with room for pinned ones. */
const VERSION_HISTORY_LIMIT = 50

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
      changes?: TemplateVersionChange[] | null
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    // The same version number with the same content hash can still differ in
    // what the hash leaves out (a flow's on/off switch, its folder): an install
    // reads this row, so it follows the save.
    await tx
      .insert(templateVersionModel)
      .values(input)
      .onConflictDoUpdate({
        target: [templateVersionModel.templateId, templateVersionModel.version],
        set: { payload: input.payload, formatVersion: input.formatVersion },
      })
  },

  /** The recorded changes of versions in `(afterVersion, upToVersion]`; no payload. */
  async listChangesBetween(
    input: { templateId: string; afterVersion: number; upToVersion: number },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        version: templateVersionModel.version,
        changes: templateVersionModel.changes,
      })
      .from(templateVersionModel)
      .where(
        and(
          eq(templateVersionModel.templateId, input.templateId),
          gt(templateVersionModel.version, input.afterVersion),
          lte(templateVersionModel.version, input.upToVersion),
        ),
      )
      .orderBy(asc(templateVersionModel.version))
  },

  /** Newest first; no payload. */
  async listHistory(templateId: string, tx: DatabaseClient = db) {
    return await tx
      .select({
        version: templateVersionModel.version,
        createdAt: templateVersionModel.createdAt,
        changes: templateVersionModel.changes,
      })
      .from(templateVersionModel)
      .where(eq(templateVersionModel.templateId, templateId))
      .orderBy(desc(templateVersionModel.version))
      .limit(VERSION_HISTORY_LIMIT)
  },

  async find(
    input: { templateId: string; version: number },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.templateVersionModel.findFirst({
      where: { templateId: input.templateId, version: input.version },
    })
  },

  /** Whether the version is stored; reads no payload. */
  async exists(
    input: { templateId: string; version: number },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ version: templateVersionModel.version })
      .from(templateVersionModel)
      .where(
        and(
          eq(templateVersionModel.templateId, input.templateId),
          eq(templateVersionModel.version, input.version),
        ),
      )
      .limit(1)
    return row !== undefined
  },

  /** The newest stored version number, if any; reads no payload. */
  async findLatestNumber(
    templateId: string,
    tx: DatabaseClient = db,
  ): Promise<number | undefined> {
    const [row] = await tx
      .select({ version: templateVersionModel.version })
      .from(templateVersionModel)
      .where(eq(templateVersionModel.templateId, templateId))
      .orderBy(desc(templateVersionModel.version))
      .limit(1)
    return row?.version
  },

  /**
   * The version number an install pins, under the shared version lock
   * and without reading the payload: the requested version when it still exists,
   * else the newest stored one (the requested one was pruned), else the
   * requested number itself.
   */
  async pinVersionNumber(
    input: { templateId: string; requestedVersion: number },
    tx: DatabaseClient,
  ): Promise<number> {
    await lockVersionsShared(input.templateId, tx)
    const [exact] = await tx
      .select({ version: templateVersionModel.version })
      .from(templateVersionModel)
      .where(
        and(
          eq(templateVersionModel.templateId, input.templateId),
          eq(templateVersionModel.version, input.requestedVersion),
        ),
      )
      .limit(1)
    if (exact) {
      return exact.version
    }
    const [latest] = await tx
      .select({ version: templateVersionModel.version })
      .from(templateVersionModel)
      .where(eq(templateVersionModel.templateId, input.templateId))
      .orderBy(desc(templateVersionModel.version))
      .limit(1)
    return latest?.version ?? input.requestedVersion
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
