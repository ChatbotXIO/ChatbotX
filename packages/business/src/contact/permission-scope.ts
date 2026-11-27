import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import {
  hasContactsAccess,
  hasWorkspacePermission,
} from "../workspace-member/permissions"

export type ContactPermissionScope = {
  canViewEmailAndPhone: boolean
  restrictToAssignedUserId?: string
  restrictToTeamIds?: string[]
}

type Permissions = WorkspaceMemberPermissions | Record<string, unknown>

export const canViewContactEmailAndPhone = (
  permissions: Permissions,
): boolean => hasWorkspacePermission(permissions, "emailAndPhone")

export const canAccessContactsSection = (permissions: Permissions): boolean =>
  hasContactsAccess(permissions)

export const getAssignedContactsUserId = (input: {
  permissions: Permissions
  userId: string
}): string | undefined => {
  if (hasWorkspacePermission(input.permissions, "superAdmin")) {
    return
  }
  return hasWorkspacePermission(input.permissions, "onlyAssignedContacts")
    ? input.userId
    : undefined
}

/** Builds a member's contact scope; `null` means the caller cannot access contacts. */
export const buildContactPermissionScope = (input: {
  permissions: Permissions
  userId: string
}): ContactPermissionScope | null => {
  if (!canAccessContactsSection(input.permissions)) {
    return null
  }
  return {
    canViewEmailAndPhone: canViewContactEmailAndPhone(input.permissions),
    restrictToAssignedUserId: getAssignedContactsUserId(input),
  }
}
