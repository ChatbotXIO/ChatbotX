import type { ChatbotMemberNotificationTypes } from "node_modules/@aha.chat/database/src/drizzle/schema/chatbot"

export function isEnableAtLeastOneNotification(
  notificationTypes: ChatbotMemberNotificationTypes,
) {
  return (
    notificationTypes.notifyAdmin ||
    notificationTypes.newMessageToHuman ||
    notificationTypes.newOrder
  )
}
