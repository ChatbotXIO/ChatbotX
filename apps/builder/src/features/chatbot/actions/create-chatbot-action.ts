import type { Transaction } from "@aha.chat/database/client"
import {
  chatbotMemberModel,
  chatbotModel,
  chatbotUsageModel,
} from "@aha.chat/database/schema"
import type {
  ChatbotMemberNotificationChannels,
  ChatbotMemberNotificationTypes,
  ChatbotMemberPermissions,
  ChatbotModel,
  OrganizationModel,
} from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"

export async function createSimpleChatbot(
  tx: Transaction,
  userId: string,
  organization: OrganizationModel,
  chatbotData: Pick<
    ChatbotModel,
    "name" | "organizationId" | "accountTimezone"
  >,
): Promise<ChatbotModel> {
  const newChatbot = await tx
    .insert(chatbotModel)
    .values({
      ...chatbotData,
      id: createId(),
      accountTimezone: "UTC",
      organizationId: organization.id,
    })
    .returning()
    .then((result) => result[0])

  await tx.insert(chatbotUsageModel).values({
    id: createId(),
    chatbotId: newChatbot.id,
    maxContacts: organization.defaultMaxContacts,
  })

  await tx.insert(chatbotMemberModel).values({
    id: createId(),
    userId,
    chatbotId: newChatbot.id,
    role: "owner",
    permissions: {
      superAdmin: true,
      analytics: true,
      flows: true,
      contacts: true,
      onlyAssignedContacts: false,
      emailAndPhone: true,
      broadcast: true,
      ecommerce: false,
    } as ChatbotMemberPermissions,
    notificationTypes: {
      notifyAdmin: true,
      newMessageToHuman: true,
      newOrder: true,
    } as ChatbotMemberNotificationTypes,
    notificationChannels: {
      messenger: true,
      email: true,
      telegram: true,
      browser: true,
    } as ChatbotMemberNotificationChannels,
  })

  return newChatbot
}
