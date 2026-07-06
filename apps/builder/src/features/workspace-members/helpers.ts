import type {
  WorkspaceMemberNotificationTypes,
  WorkspaceMemberPermissions,
} from "@chatbotx.io/database/partials"

export function getSuperAdminPermissions(): WorkspaceMemberPermissions {
  return {
    superAdmin: true,
    analytics: true,
    flows: true,
    contacts: true,
    onlyAssignedContacts: true,
    emailAndPhone: true,
    broadcast: true,
    ecommerce: true,
  }
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
