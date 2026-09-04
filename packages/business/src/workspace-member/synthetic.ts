import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import type {
  UserModel,
  WorkspaceMemberModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { isSuperAdmin } from "../user/utils"
import { isSupportAccessEnabled } from "./predicates"

// Mirrors `getSuperAdminPermissions()` in
// apps/builder/src/features/workspace-members/helpers.ts — duplicated here
// because that helper lives in the app layer and packages/business cannot
// import from apps/. A support session always gets full workspace access —
// no read-only mode (see docs/support-access.md for why).
export const SUPPORT_ACCESS_PERMISSIONS: WorkspaceMemberPermissions = {
  superAdmin: true,
  analytics: true,
  flows: true,
  contacts: true,
  onlyAssignedContacts: true,
  emailAndPhone: true,
  broadcast: true,
  ecommerce: true,
}

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
    permissions: SUPPORT_ACCESS_PERMISSIONS,
  }
}

/**
 * The single point every auth gate should call to resolve a caller's
 * membership: a real row if one exists, otherwise a synthetic support
 * membership if the caller is the platform super admin and the workspace
 * owner has opted in (`isSupportAccessEnabled`). Returns `undefined` when
 * neither applies — the caller has no access to this workspace.
 */
export function resolveWorkspaceMembership<
  TMember extends { userId: string },
>(props: {
  realMember: TMember | undefined
  workspace: WorkspaceModel
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
