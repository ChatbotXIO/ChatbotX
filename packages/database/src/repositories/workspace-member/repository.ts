import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import type { WorkspaceMemberPermissions } from "../../partials/workspace"
import { workspaceMemberModel } from "../../schema"

export type WorkspaceMemberPermissionsRow = {
  userId: string
  permissions: WorkspaceMemberPermissions
}

/**
 * Bounded projections over `WorkspaceMember` — never the whole (cached)
 * roster `workspaceMemberService.listByWorkspaceId` loads. Used by the P2
 * ring-target snapshot (`whatsappVoipCallService.selectRingTargetsForCall`),
 * which only needs permissions for the already-bounded set of ONLINE user
 * ids, and by the workspace presence "last came online" mirror
 * (`onlineSince`, see `packages/database/src/schema/workspace-member.ts`).
 */
class WorkspaceMemberRepository {
  /**
   * Permissions for exactly the requested `userIds`, scoped to
   * `workspaceId` — an id with no matching row (not a member, e.g. a
   * synthetic support-session membership, which is never persisted) is
   * simply absent from the result, never a placeholder entry. Empty
   * `userIds` short-circuits to `[]` with no query.
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
   * Stamps `onlineSince = now()` (DB server clock) for every id in
   * `userIds`, scoped to `workspaceId`, in ONE bulk UPDATE — a durable
   * "when did this member last come online" mirror for reporting. Called
   * ONLY with the subset of a presence report that just transitioned
   * offline -> online (see `workspacePresenceService.heartbeatMany`), never
   * with every reported user. Redis (`workspacePresenceService.
   * listOnlineMembers`) remains the only source of truth for whether a
   * member is online RIGHT NOW — this column can never itself answer
   * that, so there is no corresponding "mark offline" write.
   *
   * A plain UPDATE ... WHERE ... IN (...) with no existence check and no
   * error for an id with no matching row: a synthetic platform-support
   * "membership" (AGENTS.md invariant #19) has no real `WorkspaceMember`
   * row, so it must be a silent no-op for exactly that id, not the whole
   * batch. Empty `userIds` short-circuits to no query.
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
