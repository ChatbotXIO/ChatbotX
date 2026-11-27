import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  lt,
  or,
  sql,
} from "../../client"
import {
  TEMPLATE_UNINSTALL_DOOMED,
  TEMPLATE_UNINSTALL_LEASE_SECONDS,
  type TemplateUninstallCounts,
  type TemplateUninstallRequester,
  type TemplateUninstallState,
} from "../../partials/template"
import {
  templateInstallationModel,
  templateInstalledResourceModel,
} from "../../schema"

export type TemplateUninstallFinalState = Extract<
  TemplateUninstallState,
  "done" | "partial" | "failed" | "skipped"
>

export const FINAL_STATES: TemplateUninstallFinalState[] = [
  "done",
  "partial",
  "failed",
  "skipped",
]

const REQUESTABLE_STATES: TemplateUninstallState[] = [
  "none",
  "partial",
  "failed",
  "skipped",
]

type Claim = { id: string; token: string }

/** A `running` claim not renewed within the lease belongs to a dead worker (database clock). */
const leaseExpiredSql = () =>
  sql`now() - make_interval(secs => ${TEMPLATE_UNINSTALL_LEASE_SECONDS})`

/** The fence every claimed write carries: only the current lease holder passes. */
const heldBy = (claim: Claim) =>
  and(
    eq(templateInstallationModel.id, claim.id),
    eq(templateInstallationModel.uninstallClaimToken, claim.token),
    eq(templateInstallationModel.uninstallState, "running"),
  )

/** The uninstall claim and state machine: every transition is one guarded UPDATE. */
export const templateUninstallClaimRepository = {
  /**
   * `none|partial|failed|skipped` -> `pending` for an active installation.
   * Returns the new attempt, or null when it is not requestable (in progress,
   * already uninstalled).
   */
  async request(
    input: {
      id: string
      operationId: string
      requestedByKind: TemplateUninstallRequester
      requestedBy: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<{ attempt: number; workspaceId: string } | null> {
    const [row] = await tx
      .update(templateInstallationModel)
      .set({
        uninstallState: "pending",
        uninstallAttempt: sql`${templateInstallationModel.uninstallAttempt} + 1`,
        uninstallOperationId: input.operationId,
        uninstallRequestedByKind: input.requestedByKind,
        uninstallRequestedBy: input.requestedBy,
        uninstallRequestedAt: new Date(),
        uninstallClaimToken: null,
        uninstallClaimedAt: null,
        uninstallErrorCode: null,
        autoUpdate: false,
      })
      .where(
        and(
          eq(templateInstallationModel.id, input.id),
          inArray(templateInstallationModel.status, ["completed", "partial"]),
          inArray(templateInstallationModel.uninstallState, REQUESTABLE_STATES),
        ),
      )
      .returning({
        attempt: templateInstallationModel.uninstallAttempt,
        workspaceId: templateInstallationModel.workspaceId,
      })
    return row ?? null
  },

  /**
   * Claim CAS: `pending`, or `running` past its lease. The workspace is part of
   * the WHERE, so a mismatched pair never takes the lease. The lease is judged
   * on the database clock end to end (`now()` here and in every comparison).
   */
  async claim(
    input: { id: string; workspaceId: string; token: string },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string } | null> {
    const [row] = await tx
      .update(templateInstallationModel)
      .set({
        uninstallState: "running",
        uninstallClaimToken: input.token,
        uninstallClaimedAt: sql`now()`,
      })
      .where(
        and(
          eq(templateInstallationModel.id, input.id),
          eq(templateInstallationModel.workspaceId, input.workspaceId),
          or(
            eq(templateInstallationModel.uninstallState, "pending"),
            and(
              eq(templateInstallationModel.uninstallState, "running"),
              lt(
                templateInstallationModel.uninstallClaimedAt,
                leaseExpiredSql(),
              ),
            ),
          ),
        ),
      )
      .returning({
        id: templateInstallationModel.id,
        workspaceId: templateInstallationModel.workspaceId,
      })
    return row ?? null
  },

  /**
   * Whether a worker is running an uninstall (live lease) that a purge of
   * this workspace would collide with: one of its own installations, or an
   * installation of a template it publishes (the cascade deletes the
   * template, and its delete trigger updates those installations). Pending
   * and stale ones hold no locks, so they do not count.
   */
  async hasLiveUninstallTouchingWorkspace(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx.execute<{ live: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM ${templateInstallationModel} i
        WHERE i."uninstallState" = 'running'
          AND i."uninstallClaimedAt" >= now() - make_interval(secs => ${TEMPLATE_UNINSTALL_LEASE_SECONDS})
          AND (
            i."workspaceId" = ${workspaceId}::bigint
            OR i."templateId" IN (
              SELECT t."id" FROM "Template" t WHERE t."workspaceId" = ${workspaceId}::bigint
            )
          )
      ) AS "live"`)
    return Boolean(rows.rows[0]?.live)
  },

  /**
   * First statement of every batch transaction: renews the lease and fences
   * out a stale worker. False means the caller lost the claim and must abort.
   */
  async renewLease(claim: Claim, tx: DatabaseClient = db): Promise<boolean> {
    const rows = await tx
      .update(templateInstallationModel)
      .set({ uninstallClaimedAt: sql`now()` })
      .where(heldBy(claim))
      .returning({ id: templateInstallationModel.id })
    return rows.length > 0
  },

  /** Hands the lease back without finishing (transient failure): the sweep or retry reclaims. */
  async release(claim: Claim, tx: DatabaseClient = db): Promise<void> {
    await tx
      .update(templateInstallationModel)
      .set({ uninstallState: "pending", uninstallClaimToken: null })
      .where(heldBy(claim))
  },

  /**
   * Fenced finalization. `done` also flips the installation to `uninstalled`
   * and stops auto-update; every other final state leaves it active.
   */
  async finalize(
    input: Claim & {
      state: TemplateUninstallFinalState
      counts: TemplateUninstallCounts
      errorCode?: string | null
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const done = input.state === "done"
    const rows = await tx
      .update(templateInstallationModel)
      .set({
        uninstallState: input.state,
        uninstallClaimToken: null,
        uninstallErrorCode: input.errorCode ?? null,
        uninstallCounts: input.counts,
        autoUpdate: false,
        ...(done
          ? {
              status: "uninstalled" as const,
              uninstalledAt: new Date(),
              uninstalledByKind: sql`${templateInstallationModel.uninstallRequestedByKind}`,
            }
          : {}),
      })
      .where(heldBy(input))
      .returning({ id: templateInstallationModel.id })
    return rows.length > 0
  },

  /** Blocked target owner: terminal `skipped`, so the sweep never re-finds it. */
  async markSkipped(
    input: { id: string; errorCode: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(templateInstallationModel)
      .set({
        uninstallState: "skipped",
        uninstallClaimToken: null,
        uninstallErrorCode: input.errorCode,
      })
      .where(
        and(
          eq(templateInstallationModel.id, input.id),
          inArray(templateInstallationModel.uninstallState, [
            "pending",
            "running",
          ]),
        ),
      )
      .returning({ id: templateInstallationModel.id })
    return rows.length > 0
  },

  /** `pending`, or `running` past the lease: the sweep's redispatch set. */
  async listStale(
    limit: number,
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string; attempt: number }[]> {
    return await tx
      .select({
        id: templateInstallationModel.id,
        workspaceId: templateInstallationModel.workspaceId,
        attempt: templateInstallationModel.uninstallAttempt,
      })
      .from(templateInstallationModel)
      .where(
        or(
          eq(templateInstallationModel.uninstallState, "pending"),
          and(
            eq(templateInstallationModel.uninstallState, "running"),
            lt(templateInstallationModel.uninstallClaimedAt, leaseExpiredSql()),
          ),
        ),
      )
      .limit(limit)
  },

  /** `pending` publisher uninstalls of one (workspace, template) pair that no worker has claimed. */
  async listPendingPublisherUninstalls(
    input: { workspaceId: string; sourceTemplateId: string },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; operationId: string | null }[]> {
    return await tx
      .select({
        id: templateInstallationModel.id,
        operationId: templateInstallationModel.uninstallOperationId,
      })
      .from(templateInstallationModel)
      .where(
        and(
          eq(templateInstallationModel.workspaceId, input.workspaceId),
          eq(
            templateInstallationModel.sourceTemplateId,
            input.sourceTemplateId,
          ),
          eq(templateInstallationModel.uninstallState, "pending"),
          eq(templateInstallationModel.uninstallRequestedByKind, "publisher"),
        ),
      )
  },

  /** `pending` to `skipped` (grant revoked), only if still pending: false means a worker took it. */
  async skipPending(
    id: string,
    errorCode: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(templateInstallationModel)
      .set({
        uninstallState: "skipped",
        uninstallClaimToken: null,
        uninstallErrorCode: errorCode,
      })
      .where(
        and(
          eq(templateInstallationModel.id, id),
          eq(templateInstallationModel.uninstallState, "pending"),
        ),
      )
      .returning({ id: templateInstallationModel.id })
    return rows.length > 0
  },

  /** Puts a cancelled uninstall back to a requestable, active installation. */
  async markCancelled(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(templateInstallationModel)
      .set({
        uninstallState: "none",
        uninstallClaimToken: null,
        uninstallErrorCode: "templateUninstallCancelled",
      })
      .where(
        and(
          eq(templateInstallationModel.id, installationId),
          inArray(templateInstallationModel.status, ["completed", "partial"]),
          inArray(templateInstallationModel.uninstallState, [
            "partial",
            "failed",
            "skipped",
          ]),
        ),
      )
      .returning({ id: templateInstallationModel.id })
    return rows.length > 0
  },

  /**
   * Terminal `failed` for an uninstall nobody finished within the window
   * (mirrors installs and syncs `failAbandoned`): `pending`, or `running` past
   * its lease, requested before `requestedBefore`. Outcomes are kept so a new
   * request resumes. False means a worker holds a live claim or it moved on.
   */
  async markAbandoned(
    input: {
      id: string
      requestedBefore: Date
      counts: TemplateUninstallCounts
      errorCode: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(templateInstallationModel)
      .set({
        uninstallState: "failed",
        uninstallClaimToken: null,
        uninstallErrorCode: input.errorCode,
        uninstallCounts: input.counts,
        autoUpdate: false,
      })
      .where(
        and(
          eq(templateInstallationModel.id, input.id),
          lt(
            templateInstallationModel.uninstallRequestedAt,
            input.requestedBefore,
          ),
          or(
            eq(templateInstallationModel.uninstallState, "pending"),
            and(
              eq(templateInstallationModel.uninstallState, "running"),
              lt(
                templateInstallationModel.uninstallClaimedAt,
                leaseExpiredSql(),
              ),
            ),
          ),
        ),
      )
      .returning({ id: templateInstallationModel.id })
    return rows.length > 0
  },

  /** Uninstalls past the abandon window with no live claim: the sweep closes them. */
  async listAbandoned(
    input: { requestedBefore: Date; limit: number },
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
          lt(
            templateInstallationModel.uninstallRequestedAt,
            input.requestedBefore,
          ),
          or(
            eq(templateInstallationModel.uninstallState, "pending"),
            and(
              eq(templateInstallationModel.uninstallState, "running"),
              lt(
                templateInstallationModel.uninstallClaimedAt,
                leaseExpiredSql(),
              ),
            ),
          ),
        ),
      )
      .limit(input.limit)
  },

  /**
   * True while an uninstall owns the installation: `pending` or `running`, or
   * any copy still doomed (tombstoned, failed, or blocked by a reference). A
   * doomed copy is frozen and may be half drained, so sync, restore and
   * reinstall must not write into it until a retry finishes it or a cancel
   * gives it back.
   */
  async isInProgress(
    installationId: string,
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const [row] = await tx
      .select({ id: templateInstallationModel.id })
      .from(templateInstallationModel)
      .where(
        and(
          eq(templateInstallationModel.id, installationId),
          inArray(templateInstallationModel.uninstallState, [
            "pending",
            "running",
          ]),
        ),
      )
    if (row) {
      return true
    }
    const [doomed] = await tx
      .select({ id: templateInstalledResourceModel.id })
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
      .limit(1)
    return Boolean(doomed)
  },
}
