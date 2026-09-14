import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import { isCommunity } from "../keys"

/**
 * Every `WorkspaceMemberPermissions` flag set to `true`. Used by the
 * superAdmin-invite helper and by the synthetic platform-support membership
 * (`buildSupportMembership` in `./synthetic.ts`) — both need a full-access
 * permission set with no read-only mode.
 */
export const FULL_WORKSPACE_MEMBER_PERMISSIONS: WorkspaceMemberPermissions =
  Object.freeze({
    superAdmin: true,
    analytics: true,
    flows: true,
    contacts: true,
    onlyAssignedContacts: true,
    emailAndPhone: true,
    broadcast: true,
    ecommerce: true,
  })

export const normalizeWorkspaceMemberPermissions = (
  permissions: WorkspaceMemberPermissions,
): WorkspaceMemberPermissions => {
  if (isCommunity()) {
    return { ...FULL_WORKSPACE_MEMBER_PERMISSIONS }
  }

  return {
    ...permissions,
    onlyAssignedContacts: permissions.contacts
      ? false
      : permissions.onlyAssignedContacts,
  }
}
