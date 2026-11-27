import { and, type DatabaseClient, db, desc, eq, isNull } from "../../client"
import type {
  ResourceDeletionResourceType,
  ResourceDeletionStatus,
} from "../../partials/resource-deletion-log"
import { resourceDeletionLogModel } from "../../schema"

export type ResourceDeletionLogInsert = {
  workspaceId: string | null
  resourceType: ResourceDeletionResourceType
  resourceId: string
  resourceSubtype: string | null
  resourceName: string | null
  status: ResourceDeletionStatus
  requestedByUserId: string | null
  requestSource: string | null
  ipAddress: string | null
  userAgent: string | null
  requestedAt: Date
  completedAt: Date | null
  canceledAt: Date | null
}

export type ResourceDeletionLogResourceKey = {
  workspaceId?: string
  resourceType: ResourceDeletionResourceType
  resourceId: string
}

/**
 * Writes of the `ResourceDeletionLog` table. It has only a primary key, so
 * every lookup by resource is a table scan: callers keep those off the hot
 * paths and out of long transactions (see `resourceDeletionLogService`).
 */
class ResourceDeletionLogRepository {
  async insert(
    row: ResourceDeletionLogInsert,
    client: DatabaseClient = db,
  ): Promise<void> {
    await client.insert(resourceDeletionLogModel).values(row)
  }

  /** The newest `pending` row of a resource, if any. */
  async findPendingIdByResource(
    key: ResourceDeletionLogResourceKey,
    client: DatabaseClient = db,
  ): Promise<string | undefined> {
    const workspaceWhere = key.workspaceId
      ? eq(resourceDeletionLogModel.workspaceId, key.workspaceId)
      : isNull(resourceDeletionLogModel.workspaceId)
    const [row] = await client
      .select({ id: resourceDeletionLogModel.id })
      .from(resourceDeletionLogModel)
      .where(
        and(
          workspaceWhere,
          eq(resourceDeletionLogModel.resourceType, key.resourceType),
          eq(resourceDeletionLogModel.resourceId, key.resourceId),
          eq(resourceDeletionLogModel.status, "pending"),
        ),
      )
      .orderBy(desc(resourceDeletionLogModel.id))
      .limit(1)
    return row?.id
  }

  /**
   * `pending` → `completed` for one row, by primary key. Matches only a still
   * pending row, so a repeat or concurrent call updates nothing. Returns the
   * number of rows updated.
   */
  async completePendingById(
    input: { id: string; completedAt: Date },
    client: DatabaseClient = db,
  ): Promise<number> {
    const updated = await client
      .update(resourceDeletionLogModel)
      .set({ status: "completed", completedAt: input.completedAt })
      .where(
        and(
          eq(resourceDeletionLogModel.id, input.id),
          eq(resourceDeletionLogModel.status, "pending"),
        ),
      )
      .returning({ id: resourceDeletionLogModel.id })
    return updated.length
  }

  /**
   * `pending` → `canceled` for every pending row of a resource, scoped by
   * workspace. Returns the number of rows updated.
   */
  async cancelPendingByResource(
    input: ResourceDeletionLogResourceKey & { canceledAt: Date },
    client: DatabaseClient = db,
  ): Promise<number> {
    const workspaceWhere = input.workspaceId
      ? eq(resourceDeletionLogModel.workspaceId, input.workspaceId)
      : isNull(resourceDeletionLogModel.workspaceId)
    const updated = await client
      .update(resourceDeletionLogModel)
      .set({ status: "canceled", canceledAt: input.canceledAt })
      .where(
        and(
          workspaceWhere,
          eq(resourceDeletionLogModel.resourceType, input.resourceType),
          eq(resourceDeletionLogModel.resourceId, input.resourceId),
          eq(resourceDeletionLogModel.status, "pending"),
        ),
      )
      .returning({ id: resourceDeletionLogModel.id })
    return updated.length
  }
}

export const resourceDeletionLogRepository = new ResourceDeletionLogRepository()
