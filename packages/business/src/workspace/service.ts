import { anchoredPeriod, macRepository } from "@chatbotx.io/analytics"
import {
  type DatabaseClient,
  db,
  describeDatabaseError,
  eq,
  inArray,
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
import { BaseService } from "../base.service"
import { tenantService } from "../enterprise/tenant/service"
import { notFoundException, workspaceLimitReachedException } from "../errors"
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

type WorkspaceWhere = Partial<{ id: string; ownerId: string; token: string }>
type DueWorkspace = Pick<WorkspaceModel, "id" | "ownerId" | "tenantId">

const stableKey = (where: WorkspaceWhere) =>
  JSON.stringify(Object.fromEntries(Object.entries(where).sort()))

const PURGE_WORKSPACE_TEARDOWN_CONCURRENCY = 5
const COMMUNITY_MAX_WORKSPACES = 1
const WORKSPACE_LIMIT_LOCK_TIMEOUT_SECONDS = 30

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

  async update(props: {
    id: string
    data: Partial<typeof workspaceModel.$inferInsert>
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    const { id, data, tx = db } = props
    const [updated] = await tx
      .update(workspaceModel)
      .set(data)
      .where(eq(workspaceModel.id, id))
      .returning()

    const memberUserIds = await workspaceMemberService.listUserIdsByWorkspaceId(
      { tx, workspaceId: id },
    )
    await this.invalidateCacheTags([
      `workspaces:${id}`,
      ...memberUserIds.map((userId) => workspaceMemberCacheTag(userId)),
    ])

    return updated
  }

  async scheduleDeletion(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    const { tx = db } = props
    return await this.update({
      id: props.id,
      tx,
      data: {
        scheduledDeletionAt: nextScheduledDeletionAt(),
      },
    })
  }

  async cancelDeletion(props: {
    id: string
    tx?: DatabaseClient
  }): Promise<WorkspaceModel> {
    const { tx = db } = props
    return await this.update({
      id: props.id,
      tx,
      data: {
        scheduledDeletionAt: null,
      },
    })
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
          WHERE "scheduledDeletionAt" IS NOT NULL
            AND "scheduledDeletionAt" < NOW()
          ORDER BY "scheduledDeletionAt" ASC, "id" ASC
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
      await workspaceLifecycleService.freezeWorkspaceRuntime(workspace.id)

      await workspaceLifecycleService
        .disconnectWorkspaceIntegrations(workspace.id)
        .catch((err) => {
          logger.error(
            { err, workspaceId: workspace.id },
            "workspace-purge: failed to disconnect workspace integrations",
          )
        })

      await workspaceLifecycleService.disconnectWorkspaceChannels({
        integrations,
        teardownLevel: "disconnect",
        workspaceId: workspace.id,
        ownerId: workspace.ownerId,
      })

      // Drain high-volume child tables in small self-committing batches before
      // the FK cascade, so no single statement deletes millions of rows under lock.
      await workspaceLifecycleService.purgeWorkspaceHeavyData({
        workspaceId: workspace.id,
      })

      // Best-effort: never block/roll back the purge if release fails —
      // `reconcileOwnerPoolUsage` below re-derives `workspaces` from source
      // for every affected owner regardless.
      await quotaEnforcementService
        .release({ userId: workspace.ownerId, metric: "workspaces" })
        .catch((err) => {
          logger.warn(
            { err, workspaceId: workspace.id, ownerId: workspace.ownerId },
            "workspace-purge: workspace quota release failed",
          )
        })

      await db.delete(workspaceModel).where(eq(workspaceModel.id, workspace.id))

      return workspace
    } catch (err) {
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

  async create(props: {
    data: typeof workspaceModel.$inferInsert
    createdBy: string
    tx?: DatabaseClient
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
  }): Promise<WorkspaceModel> {
    const { data, tx = db } = props

    // This consume runs against `db`, not `tx`: if a caller wraps `create` in
    // its own transaction that later rolls back (e.g. a channel connect action),
    // the workspace seat is not released with it. Scheduled reconcile is the
    // backstop that re-grounds counts in that case.
    const consumed = await quotaEnforcementService.tryConsume({
      userId: props.createdBy,
      metric: "workspaces",
    })
    if (!consumed.ok) {
      throw workspaceLimitReachedException()
    }

    const tenantId =
      data.tenantId ?? (await this.resolveTenantForOwner(props.createdBy))
    const [newWorkspace] = await tx
      .insert(workspaceModel)
      .values({
        ...data,
        tenantId,
      })
      .returning()

    await workspaceMemberService.create({
      tx,
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

    await this.invalidateCacheTags([workspaceMemberCacheTag(props.createdBy)])

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

      await macRepository.ensureWorkspaceMac(
        [
          {
            workspaceId: props.workspaceId,
            periodStart: start,
            periodEnd: end,
          },
        ],
        props.tx,
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
