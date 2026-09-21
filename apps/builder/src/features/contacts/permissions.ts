import { contactService } from "@chatbotx.io/business"
import {
  ChatbotXException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import {
  hasContactsAccess,
  hasWorkspacePermission,
} from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

type Permissions = WorkspaceMemberPermissions | Record<string, unknown>

export { maskContactEmailAndPhone } from "@chatbotx.io/business/contact-utils"
export { stripContactPIIFields } from "@chatbotx.io/worker-config/contact-pii"

export type ContactPermissionScope = {
  canViewEmailAndPhone: boolean
  restrictToAssignedUserId?: string
}

export function canViewContactEmailAndPhone(permissions: Permissions): boolean {
  return hasWorkspacePermission(permissions, "emailAndPhone")
}

export function canAccessContactsSection(permissions: Permissions): boolean {
  return hasContactsAccess(permissions)
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

export function buildContactPermissionScope({
  permissions,
  userId,
}: {
  permissions: Permissions
  userId: string
}): ContactPermissionScope | null {
  if (!canAccessContactsSection(permissions)) {
    return null
  }

  return {
    canViewEmailAndPhone: canViewContactEmailAndPhone(permissions),
    restrictToAssignedUserId: getAssignedContactsUserId({
      permissions,
      userId,
    }),
  }
}

export async function resolveContactPermissionScope(
  workspaceId: string,
): Promise<ContactPermissionScope | null> {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return null
  }
  const { user, targetWorkspaceMember } = userAndWorkspace

  return buildContactPermissionScope({
    permissions: targetWorkspaceMember.permissions,
    userId: user.id,
  })
}

export async function requireContactPermissionScope(
  workspaceId: string,
): Promise<ContactPermissionScope> {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    throw new ChatbotXException("User is not associated with this workspace")
  }
  const { user, targetWorkspaceMember } = userAndWorkspace

  const scope = buildContactPermissionScope({
    permissions: targetWorkspaceMember.permissions,
    userId: user.id,
  })
  if (!scope) {
    throw new ChatbotXException("User is not authorized to access contacts")
  }

  return scope
}

/**
 * The gate for private per-contact subresource reads (notes, sequences,
 * coupons, appointments): the caller must have contacts-section access and
 * the contact itself must be inside their assigned-contacts scope. Mirrors
 * what `getContactAuthenticatedAPI` enforces via `findDetailOrFail`.
 */
export async function requireContactAccessForMember(input: {
  permissions: Permissions
  userId: string
  workspaceId: string
  contactId: string
}): Promise<ContactPermissionScope> {
  const scope = buildContactPermissionScope({
    permissions: input.permissions,
    userId: input.userId,
  })
  if (!scope) {
    throw notFoundException("Contact not found")
  }

  await contactService.findByIdOrFail({
    workspaceId: input.workspaceId,
    id: input.contactId,
    accessScope: { restrictToAssignedUserId: scope.restrictToAssignedUserId },
  })

  return scope
}
