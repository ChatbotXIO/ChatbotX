import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  ne,
  sql,
} from "../../client"
import type { WorkspaceMemberPermissions } from "../../partials/workspace"
import { ROOT_TENANT_ID, userModel, workspaceMemberModel } from "../../schema"

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

  async deleteAllForUser(
    userId: string,
    tx: DatabaseClient,
  ): Promise<Array<{ userId: string; workspaceId: string }>> {
    return await tx
      .delete(workspaceMemberModel)
      .where(eq(workspaceMemberModel.userId, userId))
      .returning({
        userId: workspaceMemberModel.userId,
        workspaceId: workspaceMemberModel.workspaceId,
      })
  }

  /**
   * Removes every member of a workspace whose account belongs to a non-root
   * tenant. Used when a sub-account workspace moves to the platform: those
   * users can never reach the platform host. Returns the removed user ids.
   */
  async deleteNonRootMembers(
    workspaceId: string,
    tx: DatabaseClient,
  ): Promise<string[]> {
    const rows = await tx
      .delete(workspaceMemberModel)
      .where(
        and(
          eq(workspaceMemberModel.workspaceId, workspaceId),
          inArray(
            workspaceMemberModel.userId,
            tx
              .select({ id: userModel.id })
              .from(userModel)
              .where(ne(userModel.tenantId, ROOT_TENANT_ID)),
          ),
        ),
      )
      .returning({ userId: workspaceMemberModel.userId })
    return rows.map((row) => row.userId)
  }

  /** The user's membership row in a workspace, if any. */
  async findByWorkspaceAndUser(
    props: { workspaceId: string; userId: string },
    tx: DatabaseClient,
  ): Promise<{ id: string } | undefined> {
    const [row] = await tx
      .select({ id: workspaceMemberModel.id })
      .from(workspaceMemberModel)
      .where(
        and(
          eq(workspaceMemberModel.workspaceId, props.workspaceId),
          eq(workspaceMemberModel.userId, props.userId),
        ),
      )
      .limit(1)
    return row
  }

  /** Sets a membership's role and permissions (promotion to owner). */
  async setRoleAndPermissions(
    props: {
      id: string
      role: (typeof workspaceMemberModel.$inferInsert)["role"]
      permissions: WorkspaceMemberPermissions
    },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx
      .update(workspaceMemberModel)
      .set({ role: props.role, permissions: props.permissions })
      .where(eq(workspaceMemberModel.id, props.id))
  }
}

export const workspaceMemberRepository = new WorkspaceMemberRepository()
