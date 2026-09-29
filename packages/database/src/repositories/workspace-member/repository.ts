import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import type { WorkspaceMemberPermissions } from "../../partials/workspace"
import { workspaceMemberModel } from "../../schema"

export type WorkspaceMemberPermissionsRow = {
  userId: string
  permissions: WorkspaceMemberPermissions
}

/**
 * Bounded projections over WorkspaceMember — never the whole cached roster.
 * Used by the ring-target snapshot (permissions for the already-bounded set of
 * online user ids) and by the presence "last came online" mirror.
 */
class WorkspaceMemberRepository {
  /**
   * Permissions for exactly the requested userIds, scoped to workspaceId — an
   * id with no matching row (e.g. a synthetic support-session membership, never
   * persisted) is simply absent from the result. Empty userIds short-circuits
   * to [] with no query.
   */
  async listPermissionsByUserIds(props: {
    workspaceId: string
    userIds: string[]
    tx?: DatabaseClient
  }): Promise<WorkspaceMemberPermissionsRow[]> {
    const { workspaceId, userIds, tx = db } = props
    if (userIds.length === 0) {
      return []
    }
    return await tx
      .select({
        userId: workspaceMemberModel.userId,
        permissions: workspaceMemberModel.permissions,
      })
      .from(workspaceMemberModel)
      .where(
        and(
          eq(workspaceMemberModel.workspaceId, workspaceId),
          inArray(workspaceMemberModel.userId, userIds),
        ),
      )
  }

  /**
   * Stamps onlineSince = now() in one bulk UPDATE for the offline->online
   * subset only; no "mark offline" write since Redis is the source of truth.
   * No existence check, so a synthetic support membership (no real row) is a
   * silent no-op for that id only, not the whole batch.
   */
  async markOnlineBulk(props: {
    workspaceId: string
    userIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, userIds, tx = db } = props
    if (userIds.length === 0) {
      return
    }
    await tx
      .update(workspaceMemberModel)
      .set({ onlineSince: sql`now()` })
      .where(
        and(
          eq(workspaceMemberModel.workspaceId, workspaceId),
          inArray(workspaceMemberModel.userId, userIds),
        ),
      )
  }
}

export const workspaceMemberRepository = new WorkspaceMemberRepository()
