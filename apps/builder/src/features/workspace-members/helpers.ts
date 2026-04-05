import type { WorkspaceMemberNotificationTypes } from "@chatbotx.io/database/partials"

export function isEnableAtLeastOneNotification(
  notificationTypes: WorkspaceMemberNotificationTypes,
) {
  return (
    notificationTypes.notifyAdmin ||
    notificationTypes.newMessageToHuman ||
    notificationTypes.newOrder
  )
}
