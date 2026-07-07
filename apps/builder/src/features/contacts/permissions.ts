import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

type Permissions = WorkspaceMemberPermissions | Record<string, unknown>

export { stripContactPIIFields } from "@chatbotx.io/worker-config/contact-pii"

export type ContactPermissionScope = {
  canViewEmailAndPhone: boolean
  restrictToAssignedUserId?: string
}

export function canViewContactEmailAndPhone(permissions: Permissions): boolean {
  return hasWorkspacePermission(permissions, "emailAndPhone")
}

export function canAccessContactsSection(permissions: Permissions): boolean {
  return (
    hasWorkspacePermission(permissions, "contacts") ||
    hasWorkspacePermission(permissions, "onlyAssignedContacts")
  )
}

export function getAssignedContactsUserId(input: {
  permissions: Permissions
  userId: string
}): string | undefined {
  if (hasWorkspacePermission(input.permissions, "superAdmin")) {
    return
  }

  return hasWorkspacePermission(input.permissions, "onlyAssignedContacts")
    ? input.userId
    : undefined
}

export async function resolveContactPermissionScope(
  workspaceId: string,
): Promise<ContactPermissionScope | null> {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return null
  }

  const { user, targetWorkspaceMember } = userAndWorkspace
  const permissions = targetWorkspaceMember.permissions
  if (!canAccessContactsSection(permissions)) {
    return null
  }

  return {
    canViewEmailAndPhone: canViewContactEmailAndPhone(permissions),
    restrictToAssignedUserId: getAssignedContactsUserId({
      permissions,
      userId: user.id,
    }),
  }
}

export async function requireContactPermissionScope(
  workspaceId: string,
): Promise<ContactPermissionScope> {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    throw new ChatbotXException("User is not associated with this workspace")
  }

  const { user, targetWorkspaceMember } = userAndWorkspace
  const permissions = targetWorkspaceMember.permissions
  if (!canAccessContactsSection(permissions)) {
    throw new ChatbotXException("User is not authorized to access contacts")
  }

  return {
    canViewEmailAndPhone: canViewContactEmailAndPhone(permissions),
    restrictToAssignedUserId: getAssignedContactsUserId({
      permissions,
      userId: user.id,
    }),
  }
}

export function maskContactEmailAndPhone<
  TContact extends { email: string | null; phoneNumber: string | null },
>(contact: TContact): TContact {
  return {
    ...contact,
    email: null,
    phoneNumber: null,
  }
}
