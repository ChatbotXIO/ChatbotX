import { FULL_WORKSPACE_MEMBER_PERMISSIONS } from "@chatbotx.io/business/workspace-member/permissions"
import type {
  WorkspaceMemberNotificationTypes,
  WorkspaceMemberPermissions,
} from "@chatbotx.io/database/partials"

export function getSuperAdminPermissions(): WorkspaceMemberPermissions {
  return { ...FULL_WORKSPACE_MEMBER_PERMISSIONS }
}

export function normalizeContactsPermissions(
  permissions: WorkspaceMemberPermissions,
): WorkspaceMemberPermissions {
  return {
    ...permissions,
    onlyAssignedContacts: permissions.contacts
      ? false
      : permissions.onlyAssignedContacts,
  }
}

export function isEnableAtLeastOneNotification(
  notificationTypes: Partial<WorkspaceMemberNotificationTypes>,
) {
  return (
    notificationTypes.notifyAdmin ||
    notificationTypes.newMessageToHuman ||
    notificationTypes.newOrder
  )
}
