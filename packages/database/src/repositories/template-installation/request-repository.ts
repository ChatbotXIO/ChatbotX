import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  not,
  or,
  sql,
} from "../../client"
import {
  parseTemplateUninstallCounts,
  type TemplateActorKind,
  type TemplateCategory,
  type TemplateUninstallCounts,
  type TemplateUninstallRequester,
} from "../../partials/template"
import {
  templateInstallationModel,
  templateModel,
  workspaceModel,
} from "../../schema"
import type { TemplateInstallationModel } from "../../types"
import {
  findNewestBySourceTemplate,
  hasActiveSync,
  holdsCategoryOutside,
  installerWarningCount,
} from "./shared"
import type { TemplateInstallationPageRow } from "./types"

/** Install requests, publisher provenance, uninstall bookkeeping and the installs list. */
export const templateInstallationRequestRepository = {
  /**
   * Serialises install requests for one (workspace, template) pair for the
   * rest of the transaction, so the "latest install" read below cannot race a
   * concurrent request. The partial unique index is the backstop.
   */
  async lockInstallRequest(
    input: { workspaceId: string; sourceTemplateId: string },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`tpl-install:${input.workspaceId}:${input.sourceTemplateId}`}, 0))`,
    )
  },

  /** The `publisherRef` earlier installations of this pair already carry, if any. */
  async findPublisherRef(
    input: { workspaceId: string; sourceTemplateId: string },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [row] = await tx
      .select({ publisherRef: templateInstallationModel.publisherRef })
      .from(templateInstallationModel)
      .where(
        and(
          eq(templateInstallationModel.workspaceId, input.workspaceId),
          eq(
            templateInstallationModel.sourceTemplateId,
            input.sourceTemplateId,
          ),
          sql`${templateInstallationModel.publisherRef} <> ''`,
        ),
      )
      .limit(1)
    return row?.publisherRef ?? null
  },

  /**
   * Which of the given workspaces already hold an installed copy of the
   * template behind a share token: `workspaceId -> newest active installation
   * id`, in one query. Lets the install page offer "update" instead of a
   * second copy without a lookup per workspace.
   */
  async listInstalledByShareToken(
    input: { shareToken: string; workspaceIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<Map<string, { id: string; autoUpdate: boolean }>> {
    if (input.workspaceIds.length === 0) {
      return new Map()
    }
    // The newest installed copy per workspace, every field read from that one
    // row: aggregating the flags over all copies mixed in older rows.
    const rows = await tx
      .selectDistinctOn([templateInstallationModel.workspaceId], {
        workspaceId: templateInstallationModel.workspaceId,
        id: templateInstallationModel.id,
        autoUpdate: templateInstallationModel.autoUpdate,
      })
      .from(templateInstallationModel)
      .innerJoin(
        templateModel,
        eq(templateModel.id, templateInstallationModel.sourceTemplateId),
      )
      .where(
        and(
          eq(templateModel.shareToken, input.shareToken),
          inArray(templateInstallationModel.workspaceId, input.workspaceIds),
          inArray(templateInstallationModel.status, ["completed", "partial"]),
        ),
      )
      .orderBy(
        templateInstallationModel.workspaceId,
        desc(templateInstallationModel.id),
      )
    return new Map(
      rows.map((row) => [
        row.workspaceId,
        { id: row.id, autoUpdate: row.autoUpdate },
      ]),
    )
  },

  /**
   * The consent the installer's earlier installations of this pair carry
   * (newest row), if any. A white-label default install carries 0 (nobody saw
   * the disclosure), so a later manual install without an explicit choice
   * stays refused until the installer opts in: the privacy-favoring default.
   */
  async findPublisherUninstallGrant(
    input: { workspaceId: string; sourceTemplateId: string },
    tx: DatabaseClient = db,
  ): Promise<number | null> {
    const [row] = await tx
      .select({ grant: templateInstallationModel.publisherUninstallGrant })
      .from(templateInstallationModel)
      .where(
        and(
          eq(templateInstallationModel.workspaceId, input.workspaceId),
          eq(
            templateInstallationModel.sourceTemplateId,
            input.sourceTemplateId,
          ),
        ),
      )
      .orderBy(desc(templateInstallationModel.id))
      .limit(1)
    return row?.grant ?? null
  },

  /**
   * Counts a reinstall as an install event (auto and manual syncs are not) and
   * dates it: the publisher's "last installed" reads `completedAt`, which a
   * reinstall's sync would otherwise leave at the first install's time.
   */
  async recordInstallEvent(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstallationModel)
      .set({
        successfulInstallEvents: sql`${templateInstallationModel.successfulInstallEvents} + 1`,
        completedAt: new Date(),
      })
      .where(eq(templateInstallationModel.id, installationId))
  },

  /**
   * Marks the installation uninstalled in the caller's transaction. Only an
   * active (completed/partial) row moves; `false` means it already did.
   */
  async markUninstalled(
    input: {
      id: string
      requestedBy: TemplateUninstallRequester
      counts: TemplateUninstallCounts
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(templateInstallationModel)
      .set({
        status: "uninstalled",
        autoUpdate: false,
        uninstalledAt: new Date(),
        uninstalledByKind: input.requestedBy,
        uninstallCounts: input.counts,
      })
      .where(
        and(
          eq(templateInstallationModel.id, input.id),
          inArray(templateInstallationModel.status, ["completed", "partial"]),
        ),
      )
      .returning({ id: templateInstallationModel.id })
    return rows.length > 0
  },

  /** The active installations of one installer (a `publisherRef`) of a template. */
  async listActiveByPublisherRef(
    input: { templateId: string; publisherRef: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateInstallationModel[]> {
    return await tx
      .select()
      .from(templateInstallationModel)
      .where(
        and(
          eq(templateInstallationModel.templateId, input.templateId),
          eq(templateInstallationModel.publisherRef, input.publisherRef),
          inArray(templateInstallationModel.status, ["completed", "partial"]),
        ),
      )
  },

  /** The newest installation of one installer, whatever became of it. */
  async findLatestByPublisherRef(
    input: { templateId: string; publisherRef: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateInstallationModel | undefined> {
    const [row] = await tx
      .select()
      .from(templateInstallationModel)
      .where(
        and(
          eq(templateInstallationModel.templateId, input.templateId),
          eq(templateInstallationModel.publisherRef, input.publisherRef),
        ),
      )
      .orderBy(desc(templateInstallationModel.createdAt))
      .limit(1)
    return row
  },

  /**
   * The installer's choice to let the publisher see this workspace and
   * uninstall the template. It belongs to the installer, not to one copy: it
   * is written to every installation of the (workspace, template) pair, so an
   * older copy can never keep a consent the installer has withdrawn.
   */
  async setPublisherUninstallGrant(
    input: { workspaceId: string; sourceTemplateId: string; granted: boolean },
    tx: DatabaseClient = db,
  ): Promise<void> {
    const pair = and(
      eq(templateInstallationModel.workspaceId, input.workspaceId),
      eq(templateInstallationModel.sourceTemplateId, input.sourceTemplateId),
    )
    await tx
      .update(templateInstallationModel)
      .set({ publisherUninstallGrant: input.granted ? 1 : 0 })
      .where(pair)
  },

  /** The newest installation of a template into a workspace, whatever its status. */
  async findLatestBySourceTemplate(
    input: { workspaceId: string; sourceTemplateId: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateInstallationModel | null> {
    const [row] = await tx
      .select()
      .from(templateInstallationModel)
      .where(
        and(
          eq(templateInstallationModel.workspaceId, input.workspaceId),
          eq(
            templateInstallationModel.sourceTemplateId,
            input.sourceTemplateId,
          ),
        ),
      )
      .orderBy(desc(templateInstallationModel.id))
      .limit(1)
    return row ?? null
  },

  /** The install of a template into a workspace that is still in flight, if any. */
  async findActiveBySourceTemplate(
    input: { workspaceId: string; sourceTemplateId: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateInstallationModel | null> {
    return await findNewestBySourceTemplate(
      input,
      ["pending", "installing"],
      tx,
    )
  },

  /** The newest installed (`completed` / `partial`) copy of a template in a workspace, if any. */
  async findInstalledBySourceTemplate(
    input: { workspaceId: string; sourceTemplateId: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateInstallationModel | null> {
    return await findNewestBySourceTemplate(input, ["completed", "partial"], tx)
  },

  async create(
    values: typeof templateInstallationModel.$inferInsert,
    tx: DatabaseClient = db,
  ): Promise<TemplateInstallationModel> {
    const [row] = await tx
      .insert(templateInstallationModel)
      .values(values)
      .returning()
    return row
  },

  /** Ids of a workspace's `pending` installations a white-label default staged: what the post-commit dispatch enqueues. */
  async listPendingIds(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<string[]> {
    const rows = await tx
      .select({ id: templateInstallationModel.id })
      .from(templateInstallationModel)
      .where(
        and(
          eq(templateInstallationModel.workspaceId, workspaceId),
          eq(templateInstallationModel.status, "pending"),
        ),
      )
    return rows.map((row) => row.id)
  },

  /**
   * The tenant of a template and of the workspace holding a copy of it, or
   * `null` when the template row is gone: what decides whether the copy
   * crosses tenants.
   */
  async findCopyTenants(
    input: { sourceTemplateId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<{ templateTenantId: string; targetTenantId: string } | null> {
    const [row] = await tx
      .select({
        templateTenantId: templateModel.tenantId,
        targetTenantId: workspaceModel.tenantId,
      })
      .from(templateModel)
      .innerJoin(workspaceModel, eq(workspaceModel.id, input.workspaceId))
      .where(eq(templateModel.id, input.sourceTemplateId))
      .limit(1)
    return row ?? null
  },

  async findByIdAndWorkspace(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateInstallationModel | null> {
    const row = await tx.query.templateInstallationModel.findFirst({
      where: { id: input.id, workspaceId: input.workspaceId },
    })
    return row ?? null
  },

  /** Several installations of one workspace in one query; unknown ids are left out. */
  async listByIdsAndWorkspace(
    input: { ids: readonly string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<TemplateInstallationModel[]> {
    if (input.ids.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(templateInstallationModel)
      .where(
        and(
          inArray(templateInstallationModel.id, [...input.ids]),
          eq(templateInstallationModel.workspaceId, input.workspaceId),
        ),
      )
  },

  /**
   * `failed` → `pending` for a manual retry; the claim and the previous
   * failure are cleared. Zero rows means the installation was not `failed`.
   */
  async resetFailed(
    input: {
      id: string
      workspaceId: string
      /** Whoever retries becomes the installer the worker authorizes. */
      installedBy: string | null
      installedByKind: TemplateActorKind
      /** Re-pins the retry to this template version; absent keeps the pinned one. */
      sourceVersion?: number
    },
    tx: DatabaseClient = db,
  ): Promise<TemplateInstallationModel | null> {
    const [row] = await tx
      .update(templateInstallationModel)
      .set({
        ...(input.sourceVersion === undefined
          ? {}
          : { sourceVersion: input.sourceVersion }),
        status: "pending",
        claimToken: null,
        claimedAt: null,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
        // The retry stages under its own generation, so a cleanup of the
        // failed attempt that is still running cannot delete its keys.
        stagingGeneration: sql`${templateInstallationModel.stagingGeneration} + 1`,
        stagedCleanupClaimedAt: null,
        installedBy: input.installedBy,
        installedByKind: input.installedByKind,
        // The retry restarts the install clock the redispatch sweep and the
        // abandon cutoff measure from.
        createdAt: new Date(),
      })
      .where(
        and(
          eq(templateInstallationModel.id, input.id),
          eq(templateInstallationModel.workspaceId, input.workspaceId),
          eq(templateInstallationModel.status, "failed"),
        ),
      )
      .returning()
    return row ?? null
  },

  /**
   * Stamps every installation of a deleted template, so the locks it put on
   * installed copies stop applying and auto-update stops. Idempotent: rows
   * already stamped keep their original time.
   */
  async markSourceDeleted(
    sourceTemplateId: string,
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(templateInstallationModel)
      .set({ sourceDeletedAt: new Date() })
      .where(
        and(
          eq(templateInstallationModel.sourceTemplateId, sourceTemplateId),
          isNull(templateInstallationModel.sourceDeletedAt),
        ),
      )
  },

  /**
   * Keyset page over `id` descending. Ids are Snowflakes, so they grow with
   * creation time: one column gives newest-first order with no timestamp
   * precision to lose in the cursor. Fetches `limit + 1` so the caller can
   * tell whether another page exists without a count query.
   */
  async listPage(
    input: {
      workspaceId: string
      status?: TemplateInstallationModel["status"]
      /** Only installs still in flight: `pending` / `installing`, or with an active sync. */
      activeOnly?: boolean
      beforeId?: string
      limit: number
      /** Only installations whose copies all fall in these categories; omit for all. */
      visibleCategories?: readonly TemplateCategory[]
    },
    tx: DatabaseClient = db,
  ): Promise<TemplateInstallationPageRow[]> {
    const rows = await tx
      .select({
        id: templateInstallationModel.id,
        templateName: templateInstallationModel.templateName,
        status: templateInstallationModel.status,
        errorCode: templateInstallationModel.errorCode,
        resourceCount: templateInstallationModel.resourceCount,
        warningCount: templateInstallationModel.warningCount,
        installerWarningCount: installerWarningCount(),
        createdAt: templateInstallationModel.createdAt,
        completedAt: templateInstallationModel.completedAt,
        autoUpdate: templateInstallationModel.autoUpdate,
        installSource: templateInstallationModel.installSource,
        activeSync: hasActiveSync(),
        uninstalledByKind: templateInstallationModel.uninstalledByKind,
        uninstallState: templateInstallationModel.uninstallState,
        rawUninstallCounts: templateInstallationModel.uninstallCounts,
        // NULL template (hard-deleted source) compares to NULL -> false; a
        // soft-deleted one can never be synced from, so it is not "available".
        updateAvailable: sql<boolean>`COALESCE(${templateInstallationModel.sourceDeletedAt} IS NULL AND ${templateInstallationModel.sourceVersion} < ${templateModel.version}, false)`,
        sourceDeleted: sql<boolean>`(${templateInstallationModel.sourceDeletedAt} IS NOT NULL OR ${templateInstallationModel.templateId} IS NULL)`,
      })
      .from(templateInstallationModel)
      .leftJoin(
        templateModel,
        eq(templateModel.id, templateInstallationModel.templateId),
      )
      .where(
        and(
          eq(templateInstallationModel.workspaceId, input.workspaceId),
          input.status
            ? eq(templateInstallationModel.status, input.status)
            : undefined,
          input.activeOnly
            ? or(
                inArray(templateInstallationModel.status, [
                  "pending",
                  "installing",
                ]),
                hasActiveSync(),
              )
            : undefined,
          input.beforeId
            ? lt(templateInstallationModel.id, input.beforeId)
            : undefined,
          input.visibleCategories
            ? not(holdsCategoryOutside(input.visibleCategories))
            : undefined,
        ),
      )
      .orderBy(desc(templateInstallationModel.id))
      .limit(input.limit + 1)
    return rows.map(({ rawUninstallCounts, ...row }) => ({
      ...row,
      uninstallCounts: parseTemplateUninstallCounts(rawUninstallCounts),
    }))
  },
}
