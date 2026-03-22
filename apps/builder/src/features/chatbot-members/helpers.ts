import type { ChatbotMemberNotificationTypes } from "@aha.chat/database/types"

export function isEnableAtLeastOneNotification(
  notificationTypes: ChatbotMemberNotificationTypes,
) {
  return (
    notificationTypes.notifyAdmin ||
    notificationTypes.newMessageToHuman ||
    notificationTypes.newOrder
  )
}
