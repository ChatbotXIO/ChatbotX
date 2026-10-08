import { anchoredPeriod, macRepository } from "@chatbotx.io/analytics"
import {
  and,
  type DatabaseClient,
  db,
  describeDatabaseError,
  eq,
  inArray,
  isNull,
  sql,
} from "@chatbotx.io/database/client"
import { workspaceMemberRoles } from "@chatbotx.io/database/partials"
import {
  ROOT_TENANT_ID,
  workspaceMemberModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { distributedLock, withCache } from "@chatbotx.io/redis"
import { formatInTimeZone } from "date-fns-tz"
import { dispatchAuditRecord } from "../audit/dispatcher"
import { BaseService } from "../base.service"
import { connectionStateService } from "../connection/state-service"
import { contactInboxPostService } from "../contact-inbox-post/service"
import { tenantService } from "../enterprise/tenant/service"
import {
  notFoundException,
  WorkspacePurgeIncompleteError,
  workspaceDeletionStartedException,
  workspaceLimitReachedException,
} from "../errors"
import { isCommunity } from "../keys"
import { logger } from "../logger"
import { quotaEnforcementService } from "../quota-enforcement/service"
import { userQuotaService } from "../user-quota/service"
import {
  type WorkspaceTeardownIntegrations,
  workspaceLifecycleService,
} from "../workspace-lifecycle/service"
import {
  workspaceMemberCacheTag,
  workspaceMemberService,
} from "../workspace-member/service"
import { nextScheduledDeletionAt } from "./deletion-schedule"
import {
  compensateWorkspaceQuotaConsumption,
  releaseWorkspaceSeat,
  type WorkspaceQuotaConsumption,
} from "./quota-consumption"

type WorkspaceWhere = Partial<{ id: string; ownerId: string }>
/** What `writeWorkspace` has already done, for `insertWorkspace`'s rollback. */
type WriteProgress = {
  workspaceId?: string
  teamMemberUsage: { liveIncremented: boolean }
}
type DueWorkspace = Pick<WorkspaceModel, "id" | "ownerId" | "tenantId">

const stableKey = (where: WorkspaceWhere) =>
  JSON.stringify(Object.fromEntries(Object.entries(where).sort()))

const PURGE_WORKSPACE_TEARDOWN_CONCURRENCY = 5
const COMMUNITY_MAX_WORKSPACES = 1
const WORKSPACE_LIMIT_LOCK_TIMEOUT_SECONDS = 30

const WORKSPACE_SETTINGS_KEYS = [
  "defaultReply",
  "defaultReplyFrequency",
  "smartResponseDelaySeconds",
  "capiLimitedDataUse",
  "logo",
  "targetCountry",
  "language",
  "timezone",
  "brandColor",
  "developmentMode",
] as const

class WorkspaceService extends BaseService {
  async findOrFail(props: {
    where: WorkspaceWhere
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    const workspace = await this.find(props)
    if (!workspace) {
      throw notFoundException("Workspace not found")
    }
    return workspace
  }

  async findById(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    return await this.findOrFail({ where: { id: props.id }, tx: props.tx })
  }

  async find(props: {
    where: WorkspaceWhere
    tx?: DatabaseClient
  }): Promise<WorkspaceModel | undefined> {
    const { where, tx = db } = props

    return await withCache(
      `workspaces:${stableKey(props.where)}`,
      async () =>
        await tx.query.workspaceModel.findFirst({
          where,
        }),
      {
        dynamicTags: (result) =>
          result ? [`workspaces:${result.id}`] : undefined,
      },
    )
  }

  /**
   * The live workspace a user already owns — excludes a row mid soft-delete
   * (`scheduledDeletionAt` set) so `createFirstWorkspace`'s idempotency
   * check never hands back a workspace that's about to be purged, and
   * orders by `id` (time-ordered) so a concurrent caller resolving "the"
   * first workspace agrees deterministically even if the owner somehow
   * ends up with more than one live row.
   */
  async findActiveByOwner(props: {
    ownerId: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel | undefined> {
    const { ownerId, tx = db } = props
    return await tx.query.workspaceModel.findFirst({
      where: { ownerId, scheduledDeletionAt: { isNull: true } },
      orderBy: { id: "asc" },
    })
  }

  // Auth gate — membership must take effect immediately on removal, so this
  // intentionally skips withCache (unlike find() above), matching
  // WorkspaceMemberService.findMembership. Used to fetch the workspace for a
  // platform-support caller with no real WorkspaceMember row, so a revoke
  // (disable()) ends the session on the very next request even if cache
  // invalidation failed.
  async findForAuth(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel | undefined> {
    const { id, tx = db } = props
    return await tx.query.workspaceModel.findFirst({ where: { id } })
  }

  isActiveNow(workspace: {
    isActive: boolean
    startTime: string | null
    endTime: string | null
    timezone: string
  }): boolean {
    if (!workspace.isActive) {
      return false
    }
    if (!(workspace.startTime && workspace.endTime)) {
      return true
    }
    const { startTime, endTime } = workspace
    const currentTime = formatInTimeZone(
      new Date(),
      workspace.timezone,
      "HH:mm",
    )

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime
    }
    // Overnight window (endTime is earlier than startTime, e.g. 22:00-06:00).
    return currentTime >= startTime || currentTime <= endTime
  }

  /**
   * Writes only the workspace's API-editable settings. A strict allow-list on
   * purpose: the public API must never be able to touch status, plan, owner or
   * tenant through this path, whatever object a caller hands in.
   */
  async updateSettings(props: {
    id: string
    data: Partial<
      Pick<
        typeof workspaceModel.$inferInsert,
        | "defaultReply"
        | "defaultReplyFrequency"
        | "smartResponseDelaySeconds"
        | "capiLimitedDataUse"
        | "logo"
        | "targetCountry"
        | "language"
        | "timezone"
        | "brandColor"
        | "developmentMode"
      >
    >
  }): Promise<WorkspaceModel> {
    // `defaultReply` holds the id of the Flow the Default Reply runs: it must be
    // one of this workspace's flows, or every later default reply fails.
    if (typeof props.data.defaultReply === "string") {
      const flow = await db.query.flowModel.findFirst({
        where: { id: props.data.defaultReply, workspaceId: props.id },
        columns: { id: true },
      })
      if (!flow) {
        throw notFoundException("Flow not found")
      }
    }
    const picked = Object.fromEntries(
      WORKSPACE_SETTINGS_KEYS.flatMap((key) =>
        props.data[key] === undefined ? [] : [[key, props.data[key]]],
      ),
    )
    // Nothing to write (an empty PATCH): an UPDATE with no SET is an error.
    if (Object.keys(picked).length === 0) {
      return await this.findById({ id: props.id })
    }
    return await this.update({ id: props.id, data: picked })
  }

  async update(props: {
    id: string
    data: Partial<typeof workspaceModel.$inferInsert>
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    const { id, data, tx = db } = props

    // Fetched before the write so the audit message can tell a real rename
    // apart from a no-op save that resubmits the same name (e.g. the Basic
    // settings form always sends `name`, changed or not).
    let previousName: string | undefined
    if (data.name !== undefined) {
      previousName = (
        await tx.query.workspaceModel.findFirst({
          where: { id },
          columns: { name: true },
        })
      )?.name
    }

    const updateWhere =
      data.scheduledDeletionAt === undefined
        ? eq(workspaceModel.id, id)
        : and(eq(workspaceModel.id, id), isNull(workspaceModel.purgeStartedAt))
    const [updated] = await tx
      .update(workspaceModel)
      .set(data)
      .where(updateWhere)
      .returning()

    if (!updated) {
      throw workspaceDeletionStartedException()
    }

    const memberUserIds = await workspaceMemberService.listUserIdsByWorkspaceId(
      { tx, workspaceId: id },
    )
    await this.invalidateCacheTags([
      `workspaces:${id}`,
      ...memberUserIds.map((userId) => workspaceMemberCacheTag(userId)),
    ])

    // Only when a caller-owned transaction hasn't been passed in — emitting
    // here while nested in an open db.transaction(...) would enqueue an audit
    // row for a write that might still roll back.
    const changedKeys = Object.keys(data)
    const onlyScheduledDeletionChanged =
      changedKeys.length === 1 && changedKeys[0] === "scheduledDeletionAt"
    if (!props.tx && changedKeys.length > 0 && !onlyScheduledDeletionChanged) {
      const nameChanged = data.name !== undefined && data.name !== previousName
      await this.audit(
        "update",
        nameChanged
          ? "changed the workspace name"
          : "updated the workspace configuration",
      )
    }

    return updated
  }

  /** The stored logo path: `null` when unset, `undefined` when there is no such workspace. */
  async findLogo(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<string | null | undefined> {
    const { id, tx = db } = props
    const workspace = await tx.query.workspaceModel.findFirst({
      where: { id },
      columns: { logo: true },
    })
    return workspace?.logo
  }

  /**
   * Stores `logo` only while the workspace still has none, so a logo picked in
   * the meantime is never overwritten. Returns whether the row was written.
   */
  async setLogoIfEmpty(props: {
    id: string
    logo: string
    tx?: DatabaseClient
  }): Promise<boolean> {
    const { id, logo, tx = db } = props

    const updated = await tx
      .update(workspaceModel)
      .set({ logo })
      .where(and(eq(workspaceModel.id, id), isNull(workspaceModel.logo)))
      .returning({ id: workspaceModel.id })

    if (updated.length === 0) {
      return false
    }

    const memberUserIds = await workspaceMemberService.listUserIdsByWorkspaceId(
      { tx, workspaceId: id },
    )
    await this.invalidateCacheTags([
      `workspaces:${id}`,
      ...memberUserIds.map((userId) => workspaceMemberCacheTag(userId)),
    ])

    // Same rule as `update`: never audit a write a caller-owned transaction
    // might still roll back.
    if (!props.tx) {
      await dispatchAuditRecord({
        workspaceId: id,
        action: "update",
        detail: "changed the workspace logo",
      })
    }

    return true
  }

  async scheduleDeletion(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    const { tx = db } = props
    const workspace = await this.update({
      id: props.id,
      tx,
      data: {
        scheduledDeletionAt: nextScheduledDeletionAt(),
      },
    })
    if (!props.tx) {
      await this.audit(
        "schedule_deletion",
        "scheduled the workspace for deletion",
      )
    }
    return workspace
  }

  async cancelDeletion(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    const { tx = db } = props
    const workspace = await this.update({
      id: props.id,
      tx,
      data: {
        scheduledDeletionAt: null,
      },
    })
    if (!props.tx) {
      await this.audit("cancel_deletion", "canceled the workspace deletion")
    }
    return workspace
  }

  /**
   * Purge workspaces whose scheduled deletion grace period has elapsed.
   *
   * Scheduled callers MUST wrap this method in the repository's distributed
   * lock (`distributedLockFactory(...).runExclusive` or
   * `scheduler.withLock`). The worker queue does not provide singleton
   * execution across concurrent workers or replicas; the split claim/teardown
   * transactions make the method idempotent, but do not prevent duplicate
   * work without a caller-owned lock.
   */
  async purgeDueScheduled(props?: {
    chunkSize?: number
    maxChunks?: number
    integrations?: WorkspaceTeardownIntegrations
  }): Promise<number> {
    const chunkSize = props?.chunkSize ?? 500
    const maxChunks = props?.maxChunks ?? 20
    let totalDeleted = 0
    const reconciles = new Map<string, { ownerId: string; tenantId: string }>()

    for (let chunk = 0; chunk < maxChunks; chunk++) {
      // Claim a chunk of due workspaces in a short transaction and immediately
      // release the FOR UPDATE locks. The heavy per-workspace teardown runs
      // outside any transaction so million-row deletes never hold a workspace
      // row lock; the final workspace-row delete runs in its own short
      // transaction below.
      const claimed = await db.transaction(async (tx) => {
        const due = await tx.execute<
          Pick<WorkspaceModel, "id" | "ownerId" | "tenantId">
        >(sql`
          SELECT "id", "ownerId", "tenantId"
          FROM "Workspace"
          WHERE "purgeStartedAt" IS NOT NULL
             OR (
               "scheduledDeletionAt" IS NOT NULL
               AND "scheduledDeletionAt" < NOW()
             )
          ORDER BY COALESCE("purgeStartedAt", "scheduledDeletionAt") ASC, "id" ASC
          LIMIT ${chunkSize}
          FOR UPDATE SKIP LOCKED
        `)

        if (due.rows.length === 0) {
          return { rows: [] as typeof due.rows, memberUserIds: [] as string[] }
        }

        const memberUserIds = await tx
          .select({ userId: workspaceMemberModel.userId })
          .from(workspaceMemberModel)
          .where(
            inArray(
              workspaceMemberModel.workspaceId,
              due.rows.map((row) => row.id),
            ),
          )

        return {
          rows: due.rows,
          memberUserIds: memberUserIds.map((row) => row.userId),
        }
      })

      if (claimed.rows.length === 0) {
        break
      }

      // Per-workspace guard: a teardown failure on one workspace must not abort
      // the whole cron (BullMQ would retry the entire batch forever). Only
      // workspaces that tear down cleanly are deleted below; a failed one keeps
      // its `scheduledDeletionAt` and is retried on the next tick.
      const teardownResults = await mapWithConcurrency(
        claimed.rows,
        PURGE_WORKSPACE_TEARDOWN_CONCURRENCY,
        async (workspace) =>
          await this.teardownDueWorkspace(workspace, props?.integrations),
      )
      const deleted = teardownResults.filter(isNonNull)

      // A full chunk that tore down nothing is a systemic failure (e.g. the DB
      // is unhealthy): stop instead of spinning through maxChunks re-claiming
      // the same rows. The next scheduled tick retries.
      if (deleted.length === 0) {
        break
      }

      totalDeleted += deleted.length
      for (const workspace of deleted) {
        reconciles.set(`${workspace.ownerId}:${workspace.tenantId}`, {
          ownerId: workspace.ownerId,
          tenantId: workspace.tenantId,
        })
      }

      const cacheTags = [
        ...deleted.map((workspace) => `workspaces:${workspace.id}`),
        ...claimed.memberUserIds.map(workspaceMemberCacheTag),
      ]
      await this.invalidateCacheTags(cacheTags)

      logger.info(
        { deleted: deleted.length },
        "workspace-purge: workspaces purged",
      )

      // Stop when this chunk claimed fewer than a full batch — no more due
      // workspaces remain. Keyed off *claimed* (not *succeeded*) so a single
      // failing workspace can't cut the run short while others are still due;
      // failed ones are re-attempted on later chunks (bounded by maxChunks) and
      // on the next tick.
      if (claimed.rows.length < chunkSize) {
        break
      }
    }

    await Promise.allSettled(
      [...reconciles.values()].map(async ({ ownerId, tenantId }) => {
        try {
          await userQuotaService.reconcileOwnerPoolUsage(ownerId, tenantId)
        } catch (err) {
          logger.error(
            { err, ownerId, tenantId },
            "workspace-purge: failed to reconcile owner pool usage",
          )
        }
      }),
    )

    return totalDeleted
  }

  private async teardownDueWorkspace(
    workspace: DueWorkspace,
    integrations?: WorkspaceTeardownIntegrations,
  ): Promise<DueWorkspace | null> {
    try {
      const fencedWorkspace = await this.acquirePurgeFence(workspace.id)
      if (!fencedWorkspace) {
        return null
      }

      await workspaceLifecycleService.freezeWorkspaceRuntime(fencedWorkspace.id)

      await workspaceLifecycleService
        .disconnectWorkspaceIntegrations(fencedWorkspace.id)
        .catch((err) => {
          logger.error(
            { err, workspaceId: fencedWorkspace.id },
            "workspace-purge: failed to disconnect workspace integrations",
          )
        })

      const { pendingReleases } =
        await workspaceLifecycleService.disconnectWorkspaceChannels({
          integrations,
          teardownLevel: "disconnect",
          reason: "workspace_purge",
          workspaceId: fencedWorkspace.id,
          ownerId: fencedWorkspace.ownerId,
        })
      // No enclosing transaction owns this call — nothing to wait on, so
      // release each deferred `channels` quota unit right away (same timing
      // `transition` used before the `pendingRelease` handshake existed).
      for (const pendingRelease of pendingReleases) {
        await connectionStateService.releasePendingQuota(pendingRelease)
      }

      // Drain high-volume child tables in small self-committing batches before
      // the FK cascade, so no single statement deletes millions of rows under lock.
      await workspaceLifecycleService.purgeWorkspaceHeavyData({
        workspaceId: fencedWorkspace.id,
      })

      const postPurge = await contactInboxPostService.purgeWorkspace({
        workspaceId: fencedWorkspace.id,
      })
      if (!postPurge.complete) {
        throw new WorkspacePurgeIncompleteError(
          fencedWorkspace.id,
          "ContactInboxPost",
        )
      }

      // Best-effort: never block/roll back the purge if release fails —
      // `reconcileOwnerPoolUsage` below re-derives `workspaces` from source
      // for every affected owner regardless.
      await quotaEnforcementService
        .release({ userId: workspace.ownerId, metric: "workspaces" })
        .catch((err) => {
          logger.warn(
            {
              err,
              workspaceId: fencedWorkspace.id,
              ownerId: fencedWorkspace.ownerId,
            },
            "workspace-purge: workspace quota release failed",
          )
        })

      await db
        .delete(workspaceModel)
        .where(eq(workspaceModel.id, fencedWorkspace.id))

      return fencedWorkspace
    } catch (err) {
      if (err instanceof WorkspacePurgeIncompleteError) {
        logger.info(
          { table: err.table, workspaceId: err.workspaceId },
          "workspace-purge: heavy data remains, deferring to next run",
        )
        return null
      }
      logger.error(
        {
          err,
          dbCause: describeDatabaseError(err),
          workspaceId: workspace.id,
        },
        "workspace-purge: teardown failed, deferring to next run",
      )
      return null
    }
  }

  private async acquirePurgeFence(
    workspaceId: string,
  ): Promise<DueWorkspace | null> {
    return await db.transaction(async (tx) => {
      const result = await tx.execute<
        DueWorkspace & {
          purgeStartedAt: Date | string | null
        }
      >(sql`
        SELECT "id", "ownerId", "tenantId", "purgeStartedAt"
        FROM "Workspace"
        WHERE "id" = ${workspaceId}::bigint
          AND (
            "purgeStartedAt" IS NOT NULL
            OR (
              "scheduledDeletionAt" IS NOT NULL
              AND "scheduledDeletionAt" < NOW()
            )
          )
        FOR UPDATE
      `)
      const workspace = result.rows[0]
      if (!workspace) {
        return null
      }

      if (!workspace.purgeStartedAt) {
        await tx
          .update(workspaceModel)
          .set({ purgeStartedAt: new Date() })
          .where(eq(workspaceModel.id, workspace.id))
      }

      return {
        id: workspace.id,
        ownerId: workspace.ownerId,
        tenantId: workspace.tenantId,
      }
    })
  }

  /**
   * Owner-derived tenant for a new workspace — never request/host-derived, so a
   * reseller's workspaces land in their tenant regardless of which host created
   * them. A sub-account inherits its own tenant; a reseller (a root user who owns
   * a tenant) gets that tenant; a plain platform user gets the root tenant.
   */
  async resolveTenantForOwner(creatorId: string): Promise<string> {
    const creator = await db.query.userModel.findFirst({
      where: { id: creatorId },
      columns: { tenantId: true },
    })
    if (creator && creator.tenantId !== ROOT_TENANT_ID) {
      return creator.tenantId
    }
    const owned = await tenantService.findByOwner(creatorId)
    return owned?.id ?? ROOT_TENANT_ID
  }

  /**
   * `quotaConsumption`: pass it when `tx` is a caller-owned transaction. The
   * `workspaces` seat is consumed outside SQL, so if that transaction later
   * rolls back the caller must hand the seat back itself via
   * `compensateWorkspaceQuotaConsumption` (or `withQuotaCompensation`, which
   * calls it). The tracker is marked only once the workspace rows are
   * written — a failure before that is released inside this call.
   */
  async create(props: {
    data: typeof workspaceModel.$inferInsert
    createdBy: string
    tx?: DatabaseClient
    quotaConsumption?: WorkspaceQuotaConsumption
  }): Promise<WorkspaceModel> {
    if (isCommunity()) {
      // Community edition allows exactly one workspace per owner. Serialize
      // the count-then-insert so concurrent create requests cannot both pass.
      const ownerId = props.data.ownerId ?? props.createdBy
      return await distributedLock.runExclusive({
        key: `workspace-limit:${ownerId}`,
        timeoutInSeconds: WORKSPACE_LIMIT_LOCK_TIMEOUT_SECONDS,
        fn: async (): Promise<WorkspaceModel> => {
          // Workspaces awaiting purge still count — conservative on purpose.
          const owned = await db.$count(
            workspaceModel,
            eq(workspaceModel.ownerId, ownerId),
          )
          if (owned >= COMMUNITY_MAX_WORKSPACES) {
            throw workspaceLimitReachedException()
          }
          return this.insertWorkspace(props)
        },
      })
    }

    return await this.insertWorkspace(props)
  }

  private async insertWorkspace(props: {
    data: typeof workspaceModel.$inferInsert
    createdBy: string
    tx?: DatabaseClient
    quotaConsumption?: WorkspaceQuotaConsumption
  }): Promise<WorkspaceModel> {
    // This consume runs against `db`, not `tx`: if a caller wraps `create` in
    // its own transaction that later rolls back (e.g. a channel connect action),
    // the workspace seat is not released with it — that caller tracks it via
    // `props.quotaConsumption` and compensates from its own catch. A failure
    // inside `writeWorkspace` below is released right here instead.
    const consumed = await quotaEnforcementService.tryConsume({
      userId: props.createdBy,
      metric: "workspaces",
    })
    if (!consumed.ok) {
      throw workspaceLimitReachedException()
    }

    // Filled by `writeWorkspace` as it goes, so the catch below knows which
    // live counters actually moved.
    const progress: WriteProgress = {
      teamMemberUsage: { liveIncremented: false },
    }
    let newWorkspace: WorkspaceModel
    try {
      // Without a caller-owned `tx`, own one: the writes must be atomic so a
      // late failure (member insert, cache) cannot leave the Workspace row
      // behind while the seat below is handed back — that under-count would
      // let the owner exceed the plan limit until reconcile.
      newWorkspace = props.tx
        ? await this.writeWorkspace({ ...props, tx: props.tx, progress })
        : await db.transaction((tx) =>
            this.writeWorkspace({ ...props, tx, progress }),
          )
    } catch (err) {
      // Row written, then something later failed: the owner-member insert
      // also bumped the live `teamMembers` counter, so undo both. Row never
      // written: only the seat moved.
      await (progress.workspaceId
        ? compensateWorkspaceQuotaConsumption({
            consumed: true,
            userId: props.createdBy,
            workspaceId: progress.workspaceId,
            teamMembersLiveIncremented:
              progress.teamMemberUsage.liveIncremented,
          })
        : releaseWorkspaceSeat(props.createdBy))
      throw err
    }

    // Only meaningful with a caller-owned `tx`: with the owned transaction
    // above already committed there is nothing left for the caller to undo.
    // Marked before the cache bust so a failure there stays compensable.
    if (props.quotaConsumption && props.tx) {
      Object.assign(props.quotaConsumption, {
        consumed: true,
        userId: props.createdBy,
        workspaceId: newWorkspace.id,
        teamMembersLiveIncremented: progress.teamMemberUsage.liveIncremented,
      })
    }

    // After the owned transaction commits: busting earlier would let a
    // concurrent read re-cache the owner's membership list without the new
    // workspace until the TTL.
    await this.invalidateCacheTags([workspaceMemberCacheTag(props.createdBy)])

    // Sanctioned exception: no workspaceId exists in the ALS actor yet at
    // this point, so this bypasses this.audit() with an explicit override.
    // Only fires when the caller didn't supply its own open transaction —
    // emitting while nested in one could log a workspace that later rolls
    // back. Here the owned transaction above has already committed.
    if (!props.tx) {
      await dispatchAuditRecord({
        userId: props.createdBy,
        workspaceId: newWorkspace.id,
        action: "create",
        detail: `created the workspace (#${newWorkspace.id})`,
      })
    }

    return newWorkspace
  }

  /** The row writes behind `insertWorkspace`, after the seat is consumed. Always runs on a transaction. */
  private async writeWorkspace(props: {
    data: typeof workspaceModel.$inferInsert
    createdBy: string
    tx: DatabaseClient
    progress: WriteProgress
  }): Promise<WorkspaceModel> {
    const { data, tx } = props

    const tenantId =
      data.tenantId ?? (await this.resolveTenantForOwner(props.createdBy))
    const [newWorkspace] = await tx
      .insert(workspaceModel)
      .values({
        ...data,
        tenantId,
      })
      .returning()
    props.progress.workspaceId = newWorkspace.id

    await workspaceMemberService.create({
      tx,
      teamMemberUsage: props.progress.teamMemberUsage,
      data: {
        userId: props.createdBy,
        workspaceId: newWorkspace.id,
        role: workspaceMemberRoles.enum.owner,
        permissions: {
          superAdmin: true,
          analytics: true,
          flows: true,
          contacts: true,
          onlyAssignedContacts: true,
          emailAndPhone: true,
          broadcast: true,
          ecommerce: true,
        },
        notificationTypes: {
          notifyAdmin: true,
          newMessageToHuman: true,
          newOrder: true,
        },
        notificationChannels: {
          messenger: true,
          email: true,
          telegram: true,
          browser: true,
        },
      },
    })

    await this.ensureMacRollup({
      workspaceId: newWorkspace.id,
      userId: props.createdBy,
      tx,
    })

    return newWorkspace
  }

  private async ensureMacRollup(props: {
    workspaceId: string
    userId: string
    tx: DatabaseClient
  }): Promise<void> {
    try {
      const quota = await userQuotaService.getForUser(props.userId)
      if (!quota?.periodStart) {
        return
      }

      const { start, end } = anchoredPeriod(new Date(), quota.periodStart)

      // Behind a SAVEPOINT (nested `tx.transaction`, as in
      // `template/adapters/naming.ts`): this write is optional and its error
      // is swallowed below, but a failed statement on the owning transaction
      // would leave Postgres' transaction aborted — the caller's COMMIT then
      // silently becomes ROLLBACK while `create` reports success. The
      // savepoint confines the failure to this one statement.
      await props.tx.transaction((savepointTx) =>
        macRepository.ensureWorkspaceMac(
          [
            {
              workspaceId: props.workspaceId,
              periodStart: start,
              periodEnd: end,
            },
          ],
          savepointTx,
        ),
      )
    } catch (error) {
      logger.error(
        { err: error, workspaceId: props.workspaceId, userId: props.userId },
        "Failed to pre-provision WorkspaceMac",
      )
    }
  }
}

export const workspaceService = new WorkspaceService()

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return []
  }

  const indexedItems = items.map((item, index) => ({ index, item }))
  const results = new Array<R>(indexedItems.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, concurrency), indexedItems.length)

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < indexedItems.length) {
      const currentIndex = nextIndex
      const entry = indexedItems[currentIndex]
      nextIndex += 1

      if (entry) {
        results[entry.index] = await mapper(entry.item)
      }
    }
  })

  await Promise.all(workers)
  return results
}

function isNonNull<T>(value: T | null): value is T {
  return value !== null
}
