import {
  buildContactPermissionScope as buildContactPermissionScopeForMember,
  type ContactPermissionScope as ContactPermissionScopeValue,
  contactService,
} from "@chatbotx.io/business"
import {
  ChatbotXException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import type { PermissionsInput } from "@chatbotx.io/business/workspace-member/permissions"
import { isWorkspaceAdminMember } from "@chatbotx.io/business/workspace-member/predicates"
import type { WorkspaceMemberModel } from "@chatbotx.io/database/types"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export type { ContactPermissionScope } from "@chatbotx.io/business"
export {
  buildContactPermissionScope,
  canAccessContactsSection,
  canViewContactEmailAndPhone,
  getAssignedContactsUserId,
} from "@chatbotx.io/business"
export { maskContactEmailAndPhone } from "@chatbotx.io/business/contact-utils"
export { stripContactPIIFields } from "@chatbotx.io/worker-config/contact-pii"

type Permissions = PermissionsInput

/**
 * Gate for private per-contact reads; null scope is not-found so contact
 * existence is never exposed.
 */
export function requireContactPermissionScopeForMember({
  permissions,
  userId,
}: {
  permissions: Permissions
  userId: string
}): ContactPermissionScopeValue {
  const scope = buildContactPermissionScopeForMember({ permissions, userId })
  if (!scope) {
    throw notFoundException("Contact not found")
  }

  return scope
}
export async function resolveContactPermissionScope(
  workspaceId: string,
): Promise<ContactPermissionScopeValue | null> {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    return null
  }
  const { user, targetWorkspaceMember } = userAndWorkspace

  return buildContactPermissionScopeForMember({
    permissions: targetWorkspaceMember.permissions,
    userId: user.id,
  })
}

export async function requireContactPermissionScope(
  workspaceId: string,
): Promise<ContactPermissionScopeValue> {
  const scope = await resolveContactPermissionScope(workspaceId)
  if (scope) {
    return scope
  }

  // `resolveContactPermissionScope` returns `null` for two different
  // reasons — no workspace membership at all, or a member without contacts
  // access — so re-check membership here only to pick the right message.
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!userAndWorkspace) {
    throw new ChatbotXException("User is not associated with this workspace")
  }
  throw new ChatbotXException("User is not authorized to access contacts")
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
}): Promise<ContactPermissionScopeValue> {
  const scope = buildContactPermissionScopeForMember({
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

/**
 * Whose contact exports a member may list and download. An export holds
 * contact email and phone numbers, so a plain agent reaches only their own;
 * a workspace admin (owner or `superAdmin`) reaches every member's. Returns
 * the user id to filter by, or undefined for no filter.
 */
export function exportFileOwnerFilter(context: {
  user: { id: string }
  workspaceMember: Pick<WorkspaceMemberModel, "role" | "permissions">
}): string | undefined {
  return isWorkspaceAdminMember(context.workspaceMember)
    ? undefined
    : context.user.id
}
