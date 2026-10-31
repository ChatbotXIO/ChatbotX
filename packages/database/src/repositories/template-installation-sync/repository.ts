import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  inArray,
  lt,
  notInArray,
  or,
  sql,
} from "../../client"
import type {
  TemplateActorKind,
  TemplateSyncStatus,
  TemplateSyncTrigger,
  TemplateWarning,
} from "../../partials/template"
import {
  type TemplateSyncCounts,
  templateInstallationModel,
  templateInstallationSyncModel,
  templateInstalledResourceModel,
} from "../../schema"
import { keepKnownResourceKinds } from "../template-installed-resource/kinds"

export type TemplateSyncRow = typeof templateInstallationSyncModel.$inferSelect

export type NewTemplateSync = {
  id: string
  workspaceId: string
  installationId: string
  trigger: TemplateSyncTrigger
  requestedVersion: number
  /** The member who requested it; null for a token or an automatic update. */
  requestedBy?: string | null
  /** `member` even if the user is later deleted; absent means an API token or automatic update. */
  requestedByKind?: TemplateActorKind
  /** Set for manual and reinstall requests: a replay returns the same row. */
  idempotencyKey?: string | null
  /** What the keyed request asked for; a replay must match it. */
  requestFingerprint?: string | null
}

export type TemplateSyncOutcome = {
  status: Extract<
    TemplateSyncStatus,
    "completed" | "partial" | "failed" | "skipped"
  >
  errorCode?: string | null
  fromVersion?: number | null
  appliedVersion?: number | null
  appliedHash?: string | null
  counts?: TemplateSyncCounts | null
  warnings?: TemplateWarning[]
  warningSummary?: { code: string; count: number }[] | null
}

/** Only the current owner of the lease may write; zero rows means it was fenced out. */
const ownedByClaim = (input: { id: string; claimToken: string }) =>
  and(
    eq(templateInstallationSyncModel.id, input.id),
    eq(templateInstallationSyncModel.status, "running"),
    eq(templateInstallationSyncModel.claimToken, input.claimToken),
  )

const ACTIVE_STATUSES: TemplateSyncStatus[] = ["pending", "running"]

// Fan-out and sweep: an automatic attempt at a version that is queued, running
// or already decided (applied or skipped) ends the fan-out for it. A `failed`
// or `cancelled` attempt does not, so the next sweep tries that installation
// again. The status list is inlined in both queries below.

export const templateInstallationSyncRepository = {
  /** Inserts one sync; a duplicate auto/idempotent request returns `null`. */
  async createIfAbsent(
    values: NewTemplateSync,
    tx: DatabaseClient = db,
  ): Promise<TemplateSyncRow | null> {
    const [row] = await tx
      .insert(templateInstallationSyncModel)
      .values({
        ...values,
        requestedBy: values.requestedBy ?? null,
        requestedByKind: values.requestedByKind ?? "apiToken",
      })
      .onConflictDoNothing()
      .returning()
    return row ?? null
  },

  /** Bulk `createIfAbsent`: returns only the rows that were actually inserted. */
  async createManyIfAbsent(
    values: NewTemplateSync[],
    tx: DatabaseClient = db,
  ): Promise<TemplateSyncRow[]> {
    if (values.length === 0) {
      return []
    }
    return await tx
      .insert(templateInstallationSyncModel)
      .values(
        values.map((value) => ({
          ...value,
          requestedBy: value.requestedBy ?? null,
          requestedByKind: value.requestedByKind ?? "apiToken",
        })),
      )
      .onConflictDoNothing()
      .returning()
  },

  async findById(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateSyncRow | null> {
    const row = await tx.query.templateInstallationSyncModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    return row ?? null
  },

  /** The sync a request with this idempotency key already created, if any. */
  async findByIdempotencyKey(
    input: { installationId: string; key: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateSyncRow | null> {
    const row = await tx.query.templateInstallationSyncModel.findFirst({
      where: {
        installationId: input.installationId,
        idempotencyKey: input.key,
      },
    })
    return row ?? null
  },

  async findActiveByInstallation(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<TemplateSyncRow | null> {
    const [row] = await tx
      .select()
      .from(templateInstallationSyncModel)
      .where(
        and(
          eq(templateInstallationSyncModel.installationId, installationId),
          inArray(templateInstallationSyncModel.status, ACTIVE_STATUSES),
        ),
      )
      .limit(1)
    return row ?? null
  },

  async listByInstallation(
    input: { installationId: string; workspaceId: string; limit: number },
    tx: DatabaseClient = db,
  ): Promise<TemplateSyncRow[]> {
    return await tx
      .select()
      .from(templateInstallationSyncModel)
      .where(
        and(
          eq(
            templateInstallationSyncModel.installationId,
            input.installationId,
          ),
          eq(templateInstallationSyncModel.workspaceId, input.workspaceId),
        ),
      )
      .orderBy(desc(templateInstallationSyncModel.id))
      .limit(input.limit)
  },

  /** Lease claim: a `pending` row, or a `running` one whose lease expired. */
  async claim(
    input: {
      id: string
      workspaceId: string
      claimToken: string
      leaseExpiredBefore: Date
    },
    tx: DatabaseClient = db,
  ): Promise<TemplateSyncRow | null> {
    const [row] = await tx
      .update(templateInstallationSyncModel)
      .set({
        status: "running",
        claimToken: input.claimToken,
        claimedAt: new Date(),
        startedAt: sql`coalesce(${templateInstallationSyncModel.startedAt}, now())`,
        attempts: sql`${templateInstallationSyncModel.attempts} + 1`,
      })
      .where(
        and(
          eq(templateInstallationSyncModel.id, input.id),
          eq(templateInstallationSyncModel.workspaceId, input.workspaceId),
          or(
            eq(templateInstallationSyncModel.status, "pending"),
            and(
              eq(templateInstallationSyncModel.status, "running"),
              lt(
                templateInstallationSyncModel.claimedAt,
                input.leaseExpiredBefore,
              ),
            ),
          ),
        ),
      )
      .returning()
    return row ?? null
  },

  async release(
    input: { id: string; claimToken: string },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstallationSyncModel)
      .set({ status: "pending", claimToken: null, claimedAt: null })
      .where(ownedByClaim(input))
  },

  /** Finalises the row; `false` when the lease was lost to another worker. */
  async finish(
    input: { id: string; claimToken: string; outcome: TemplateSyncOutcome },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const { outcome } = input
    const rows = await tx
      .update(templateInstallationSyncModel)
      .set({
        status: outcome.status,
        errorCode: outcome.errorCode ?? null,
        fromVersion: outcome.fromVersion ?? null,
        appliedVersion: outcome.appliedVersion ?? null,
        appliedHash: outcome.appliedHash ?? null,
        counts: outcome.counts ?? null,
        warnings: outcome.warnings ?? [],
        warningSummary: outcome.warningSummary ?? null,
        finishedAt: new Date(),
        // Kept: it records which claim finished the row (see `findStatusFinishedByClaim`).
        // `ownedByClaim` requires `running`, so the token no longer grants writes.
      })
      .where(ownedByClaim(input))
      .returning({ id: templateInstallationSyncModel.id })
    return rows.length > 0
  },

  /** The status this claim finished the row with (its transaction committed), else `null`. */
  async findStatusFinishedByClaim(
    input: { id: string; claimToken: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateSyncStatus | null> {
    const [row] = await tx
      .select({ status: templateInstallationSyncModel.status })
      .from(templateInstallationSyncModel)
      .where(
        and(
          eq(templateInstallationSyncModel.id, input.id),
          eq(templateInstallationSyncModel.claimToken, input.claimToken),
          notInArray(templateInstallationSyncModel.status, ACTIVE_STATUSES),
        ),
      )
      .limit(1)
    return row?.status ?? null
  },

  /**
   * Closes a row nobody holds (blocked owner, template gone): a `pending` one
   * and, with `leaseExpiredBefore`, a `running` one whose worker's lease
   * expired (it died). A live lease belongs to a worker and is never closed.
   */
  async closeUnclaimed(
    input: {
      id: string
      status: "skipped" | "failed" | "cancelled"
      errorCode: string
      leaseExpiredBefore?: Date
    },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstallationSyncModel)
      .set({
        status: input.status,
        errorCode: input.errorCode,
        finishedAt: new Date(),
        claimToken: null,
      })
      .where(
        and(
          eq(templateInstallationSyncModel.id, input.id),
          or(
            eq(templateInstallationSyncModel.status, "pending"),
            input.leaseExpiredBefore
              ? and(
                  eq(templateInstallationSyncModel.status, "running"),
                  lt(
                    templateInstallationSyncModel.claimedAt,
                    input.leaseExpiredBefore,
                  ),
                )
              : undefined,
          ),
        ),
      )
  },

  /** Whether a sync of the installation is executing (a merely queued one is not). */
  async hasRunningSync(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: templateInstallationSyncModel.id })
      .from(templateInstallationSyncModel)
      .where(
        and(
          eq(templateInstallationSyncModel.installationId, installationId),
          eq(templateInstallationSyncModel.status, "running"),
        ),
      )
      .limit(1)
    return Boolean(row)
  },

  /** Cancels the installation's queued syncs; a worker that later claims one finds it closed. */
  async cancelPendingSyncs(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstallationSyncModel)
      .set({
        status: "cancelled",
        errorCode: "templateUninstalled",
        finishedAt: new Date(),
        claimToken: null,
      })
      .where(
        and(
          eq(templateInstallationSyncModel.installationId, installationId),
          eq(templateInstallationSyncModel.status, "pending"),
        ),
      )
  },

  /** `pending` too long (never enqueued) or `running` past its lease. */
  async listUnfinished(
    input: {
      pendingBefore: Date
      leaseExpiredBefore: Date
      createdAfter: Date
      limit: number
    },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string }[]> {
    return await tx
      .select({
        id: templateInstallationSyncModel.id,
        workspaceId: templateInstallationSyncModel.workspaceId,
      })
      .from(templateInstallationSyncModel)
      .where(
        and(
          // Too old to keep trying: `failAbandoned` closes those.
          sql`${templateInstallationSyncModel.createdAt} > ${input.createdAfter.toISOString()}::timestamptz`,
          or(
            and(
              eq(templateInstallationSyncModel.status, "pending"),
              lt(templateInstallationSyncModel.createdAt, input.pendingBefore),
            ),
            and(
              eq(templateInstallationSyncModel.status, "running"),
              lt(
                templateInstallationSyncModel.claimedAt,
                input.leaseExpiredBefore,
              ),
            ),
          ),
        ),
      )
      .limit(input.limit)
  },

  /**
   * Installations that follow auto-update and are behind `version`, keyset by
   * id. Only completed/partial copies of a live source are candidates.
   */
  async listAutoUpdateCandidates(
    input: {
      templateId: string
      version: number
      afterId: string | null
      limit: number
    },
    tx: DatabaseClient = db,
  ): Promise<
    { id: string; workspaceId: string; installedByKind: TemplateActorKind }[]
  > {
    return await tx
      .select({
        id: templateInstallationModel.id,
        workspaceId: templateInstallationModel.workspaceId,
        installedByKind: templateInstallationModel.installedByKind,
      })
      .from(templateInstallationModel)
      .where(
        and(
          eq(templateInstallationModel.sourceTemplateId, input.templateId),
          eq(templateInstallationModel.autoUpdate, true),
          inArray(templateInstallationModel.status, ["completed", "partial"]),
          sql`${templateInstallationModel.sourceDeletedAt} IS NULL`,
          sql`${templateInstallationModel.sourceVersion} < ${input.version}`,
          sql`NOT EXISTS (
            SELECT 1 FROM "TemplateInstallationSync" s
            WHERE s."installationId" = ${templateInstallationModel.id}
              AND s."trigger" = 'autoUpdate'
              AND s."requestedVersion" = ${input.version}
              AND s."status" IN ('pending', 'running', 'completed', 'partial', 'skipped')
          )`,
          // At most one active sync per installation, of any trigger.
          sql`NOT EXISTS (
            SELECT 1 FROM "TemplateInstallationSync" a
            WHERE a."installationId" = ${templateInstallationModel.id}
              AND a."status" IN ('pending', 'running')
          )`,
          input.afterId
            ? sql`${templateInstallationModel.id} > ${input.afterId}`
            : undefined,
        ),
      )
      .orderBy(templateInstallationModel.id)
      .limit(input.limit)
  },

  /** Every tracked resource of an installation, for the sync's mapping and diff. */
  async listInstalledResources(
    installationId: string,
    tx: DatabaseClient = db,
  ) {
    return keepKnownResourceKinds(
      await tx
        .select()
        .from(templateInstalledResourceModel)
        .where(
          eq(templateInstalledResourceModel.installationId, installationId),
        ),
    )
  },

  /** Records what the sync wrote, so the next sync can spot a local edit. */
  async markSynced(
    input: { id: string; syncedHash: string | null; syncedVersion: number },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstalledResourceModel)
      .set({ syncedHash: input.syncedHash, syncedVersion: input.syncedVersion })
      .where(eq(templateInstalledResourceModel.id, input.id))
  },

  /** The template no longer ships these (or the installer deleted them): they stop being governed. */
  async detachResources(ids: string[], tx: DatabaseClient = db): Promise<void> {
    if (ids.length === 0) {
      return
    }
    await tx
      .update(templateInstalledResourceModel)
      .set({ detachedAt: new Date() })
      .where(inArray(templateInstalledResourceModel.id, ids))
  },

  async completeInstallationSync(
    input: { installationId: string; version: number },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstallationModel)
      .set({
        sourceVersion: sql`GREATEST(${templateInstallationModel.sourceVersion}, ${input.version})`,
        lastSyncedAt: new Date(),
      })
      .where(eq(templateInstallationModel.id, input.installationId))
  },

  /**
   * Templates with an auto-update installation still behind their newest
   * version: the sweep fans these out again in case the save's job was lost.
   */
  async listTemplatesBehind(
    limit: number,
    tx: DatabaseClient = db,
  ): Promise<{ templateId: string; workspaceId: string; version: number }[]> {
    const result = await tx.execute<{
      templateId: string
      workspaceId: string
      version: number
    }>(sql`
      SELECT t."id" AS "templateId", t."workspaceId", t."version"
      FROM "Template" t
      WHERE t."deletedAt" IS NULL
        AND EXISTS (
          SELECT 1 FROM "TemplateInstallation" ti
          WHERE ti."sourceTemplateId" = t."id"
            AND ti."autoUpdate" = true
            AND ti."status" IN ('completed', 'partial')
            AND ti."sourceDeletedAt" IS NULL
            AND ti."sourceVersion" < t."version"
            AND NOT EXISTS (
              SELECT 1 FROM "TemplateInstallationSync" s
              WHERE s."installationId" = ti."id"
                AND s."trigger" = 'autoUpdate'
                AND s."requestedVersion" = t."version"
                AND s."status" IN ('pending', 'running', 'completed', 'partial', 'skipped')
            )
        )
      -- A publisher whose fan-out is a no-op (blocked owner) must not keep the
      -- same templates at the front forever and starve the rest.
      ORDER BY random()
      LIMIT ${limit}
    `)
    return result.rows
  },

  /**
   * Closes syncs that have been trying for too long (a worker that keeps
   * crashing on one) so the sweep stops re-dispatching them forever and an
   * uninstall is no longer blocked by them. Returns how many were closed.
   */
  async failAbandoned(
    input: { createdBefore: Date; errorCode: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(templateInstallationSyncModel)
      .set({
        status: "failed",
        errorCode: input.errorCode,
        finishedAt: new Date(),
        claimToken: null,
      })
      .where(
        and(
          inArray(templateInstallationSyncModel.status, ACTIVE_STATUSES),
          lt(templateInstallationSyncModel.createdAt, input.createdBefore),
        ),
      )
      .returning({ id: templateInstallationSyncModel.id })
    return rows.length
  },

  /**
   * The categories of everything any installation of this (workspace,
   * template) pair holds: what a pair-wide choice (publisher access) affects.
   */
  async listInstalledCategoriesByPair(
    input: { workspaceId: string; sourceTemplateId: string },
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx
      .selectDistinct({ category: templateInstalledResourceModel.category })
      .from(templateInstalledResourceModel)
      .innerJoin(
        templateInstallationModel,
        eq(
          templateInstallationModel.id,
          templateInstalledResourceModel.installationId,
        ),
      )
      .where(
        and(
          eq(templateInstallationModel.workspaceId, input.workspaceId),
          eq(
            templateInstallationModel.sourceTemplateId,
            input.sourceTemplateId,
          ),
        ),
      )
    return rows.map((row) => row.category)
  },
}
