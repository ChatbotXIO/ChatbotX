import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  ResourceDeletionResourceType,
  ResourceDeletionStatus,
} from "@chatbotx.io/database/partials"
import {
  type ResourceDeletionLogInsert,
  type ResourceDeletionLogResourceKey,
  resourceDeletionLogRepository,
} from "@chatbotx.io/database/repositories"
import { type AuditActor, readAuditActor, SYSTEM_ACTOR } from "../audit/actor"
import { logger } from "../logger"

/**
 * `ResourceDeletionLog` has only a primary key, so a lookup by resource scans
 * the table. Rows come from rare, user-initiated deletions, so that is cheap
 * today; a scan slower than this is the signal to add the index documented in
 * `docs/resource-deletion-log.md`.
 */
const SLOW_UNINDEXED_SCAN_MS = 500

/**
 * IP and user agent come from request headers, so a caller controls their size
 * and the row outlives the workspace. An IPv6 address is at most 45 characters;
 * the caps keep an oversized header from being retained forever.
 */
const MAX_IP_ADDRESS_LENGTH = 64
const MAX_USER_AGENT_LENGTH = 1024

/** What was deleted. `subtype` and `name` are snapshots: the resource row goes away. */
export type ResourceDeletionTarget = {
  type: ResourceDeletionResourceType
  id: string
  workspaceId?: string
  subtype?: string
  name?: string
}

type DeletionRequestOrigin = Pick<
  ResourceDeletionLogInsert,
  "requestedByUserId" | "requestSource" | "ipAddress" | "userAgent"
>

const UNKNOWN_ORIGIN: Omit<DeletionRequestOrigin, "requestedByUserId"> = {
  requestSource: null,
  ipAddress: null,
  userAgent: null,
}

/** The requester of a deletion: the explicit one, else the acting user; a system actor is nobody. */
const resolveRequesterId = (
  explicitUserId: string | undefined,
  actor: AuditActor | undefined,
): string | null => {
  if (explicitUserId) {
    return explicitUserId
  }
  if (!actor?.userId || actor.userId === SYSTEM_ACTOR) {
    return null
  }
  return actor.userId
}

const clipHeaderValue = (
  value: string | undefined,
  maxLength: number,
): string | null => {
  if (value === undefined) {
    return null
  }
  return value.slice(0, maxLength)
}

const toResourceKey = (
  resource: ResourceDeletionTarget,
): ResourceDeletionLogResourceKey => ({
  ...(resource.workspaceId && { workspaceId: resource.workspaceId }),
  resourceType: resource.type,
  resourceId: resource.id,
})

const toInsertRow = (input: {
  resource: ResourceDeletionTarget
  status: ResourceDeletionStatus
  origin: DeletionRequestOrigin
  requestedAt: Date
  settledAt: Date
}): ResourceDeletionLogInsert => ({
  ...toResourceKey(input.resource),
  workspaceId: input.resource.workspaceId ?? null,
  resourceSubtype: input.resource.subtype ?? null,
  resourceName: input.resource.name ?? null,
  status: input.status,
  ...input.origin,
  requestedAt: input.requestedAt,
  completedAt: input.status === "completed" ? input.settledAt : null,
  canceledAt: input.status === "canceled" ? input.settledAt : null,
})

/**
 * The only writer of `ResourceDeletionLog`: a durable trail of who asked to
 * delete a resource and when it really happened. Resource-agnostic — callers
 * describe what was deleted with a `ResourceDeletionTarget`.
 */
class ResourceDeletionLogService {
  /**
   * Records a deletion requested by whoever is running now: the user, IP, user
   * agent and source come from the request's audit context. `requestedByUserId`
   * overrides the user when the caller knows it better than the ambient actor.
   * A `system` actor is stored as no user. `tx` is required so the row commits
   * with the deletion it describes.
   */
  async recordRequest(input: {
    resource: ResourceDeletionTarget
    status: ResourceDeletionStatus
    requestedByUserId?: string
    tx: DatabaseClient
  }): Promise<void> {
    const actor = readAuditActor()
    const now = new Date()
    await resourceDeletionLogRepository.insert(
      toInsertRow({
        resource: input.resource,
        status: input.status,
        origin: {
          requestedByUserId: resolveRequesterId(input.requestedByUserId, actor),
          requestSource: actor?.source ?? null,
          ipAddress: clipHeaderValue(actor?.ipAddress, MAX_IP_ADDRESS_LENGTH),
          userAgent: clipHeaderValue(actor?.userAgent, MAX_USER_AGENT_LENGTH),
        },
        requestedAt: now,
        settledAt: now,
      }),
      input.tx,
    )
  }

  /**
   * Records a request that was made earlier, by someone known only from what
   * was stored on the resource (a workspace scheduled before this log existed).
   * The ambient actor is NOT the requester, so its IP, user agent and source
   * are never copied; the origin is stored as unknown.
   */
  async recordHistoricalRequest(input: {
    resource: ResourceDeletionTarget
    status: ResourceDeletionStatus
    requestedByUserId: string | null
    requestedAt: Date
    tx: DatabaseClient
  }): Promise<void> {
    await resourceDeletionLogRepository.insert(
      toInsertRow({
        resource: input.resource,
        status: input.status,
        origin: {
          requestedByUserId: input.requestedByUserId,
          ...UNKNOWN_ORIGIN,
        },
        requestedAt: input.requestedAt,
        settledAt: new Date(),
      }),
      input.tx,
    )
  }

  /** The newest `pending` request of a resource. Scans the table: keep it out of long transactions. */
  async findPendingId(input: {
    resource: ResourceDeletionTarget
    tx?: DatabaseClient
  }): Promise<string | undefined> {
    return await this.measureUnindexedScan("findPendingId", () =>
      resourceDeletionLogRepository.findPendingIdByResource(
        toResourceKey(input.resource),
        input.tx,
      ),
    )
  }

  /** `pending` → `completed`, by primary key. Returns the rows updated: 0 when it was not pending. */
  async completePending(input: {
    id: string
    tx: DatabaseClient
  }): Promise<number> {
    return await resourceDeletionLogRepository.completePendingById(
      { id: input.id, completedAt: new Date() },
      input.tx,
    )
  }

  /** `pending` → `canceled` for a resource's pending requests. Returns the rows updated. */
  async cancelPending(input: {
    resource: ResourceDeletionTarget
    tx: DatabaseClient
  }): Promise<number> {
    return await this.measureUnindexedScan("cancelPending", () =>
      resourceDeletionLogRepository.cancelPendingByResource(
        { ...toResourceKey(input.resource), canceledAt: new Date() },
        input.tx,
      ),
    )
  }

  private async measureUnindexedScan<T>(
    operation: string,
    scan: () => Promise<T>,
  ): Promise<T> {
    const startedAt = Date.now()
    try {
      return await scan()
    } finally {
      const durationMs = Date.now() - startedAt
      if (durationMs >= SLOW_UNINDEXED_SCAN_MS) {
        logger.warn(
          { durationMs, operation },
          "resource-deletion-log: slow unindexed scan",
        )
      }
    }
  }
}

export const resourceDeletionLogService = new ResourceDeletionLogService()
