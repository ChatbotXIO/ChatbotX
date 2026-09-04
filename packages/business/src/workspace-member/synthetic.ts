import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { isSuperAdmin } from "../user/utils"
import { FULL_WORKSPACE_MEMBER_PERMISSIONS } from "./permissions"
import { isSupportAccessEnabled } from "./predicates"

const SUPPORT_MEMBER_ID_PREFIX = "support-access"

/** Deterministic, never persisted — lets a synthetic row still key React lists etc. */
export const supportMemberId = (workspaceId: string, userId: string) =>
  `${SUPPORT_MEMBER_ID_PREFIX}:${workspaceId}:${userId}`

/**
 * Builds an in-memory-only `WorkspaceMemberModel` for a super admin whose
 * access is authorized purely by `isSupportAccessEnabled(workspace)` — there
 * is no `WorkspaceMember` row backing platform support access. Never insert
 * this into the database. See docs/support-access.md.
 */
export function buildSupportMembership(props: {
  workspaceId: string
  userId: string
}): WorkspaceMemberModel {
  const { workspaceId, userId } = props
  const now = new Date()

  return {
    id: supportMemberId(workspaceId, userId),
    createdAt: now,
    updatedAt: now,
    workspaceId,
    userId,
    role: "agent",
    notificationChannels: {
      messenger: false,
      email: false,
      telegram: false,
      browser: false,
    },
    notificationTypes: {
      notifyAdmin: false,
      newMessageToHuman: false,
      newOrder: false,
    },
    permissions: FULL_WORKSPACE_MEMBER_PERMISSIONS,
  }
}

/**
 * The single point every auth gate should call to resolve a caller's
 * membership: a real row if one exists, otherwise a synthetic support
 * membership if the caller is the platform super admin and the workspace
 * owner has opted in (`isSupportAccessEnabled`). Returns `undefined` when
 * neither applies — the caller has no access to this workspace. Only needs
 * `id`/`supportAccessUntil` off `workspace` — callers already have the full
 * row in hand, but the signature shouldn't imply more is required.
 */
export function resolveWorkspaceMembership<
  TMember extends { userId: string; permissions: WorkspaceMemberPermissions },
>(props: {
  realMember: TMember | undefined
  workspace: Pick<WorkspaceModel, "id" | "supportAccessUntil">
  user: Pick<UserModel, "id" | "email">
}): TMember | WorkspaceMemberModel | undefined {
  const { realMember, workspace, user } = props

  if (realMember) {
    return realMember
  }

  if (isSuperAdmin(user) && isSupportAccessEnabled(workspace)) {
    return buildSupportMembership({
      workspaceId: workspace.id,
      userId: user.id,
    })
  }

  return
}
