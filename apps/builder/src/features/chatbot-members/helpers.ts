import type { ChatbotMemberNotificationTypes } from "@chatbotx.io/database/partials"

export function isEnableAtLeastOneNotification(
  notificationTypes: ChatbotMemberNotificationTypes,
) {
  return (
    notificationTypes.notifyAdmin ||
    notificationTypes.newMessageToHuman ||
    notificationTypes.newOrder
  )
}
