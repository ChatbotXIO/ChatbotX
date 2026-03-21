import type { ChatbotMemberNotificationTypes } from "@chatbotx.io/database/types"

export function isEnableAtLeastOneNotification(
  notificationTypes: ChatbotMemberNotificationTypes,
) {
  return (
    notificationTypes.notifyAdmin ||
    notificationTypes.newMessageToHuman ||
    notificationTypes.newOrder
  )
}
