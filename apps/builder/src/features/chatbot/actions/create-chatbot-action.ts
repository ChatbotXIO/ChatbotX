import type { Prisma } from "@aha.chat/database"
import {
  ChatbotMemberRole,
  type ChatbotModel,
  type ChatbotUncheckedCreateInput,
  type OrganizationModel,
} from "@aha.chat/database/types"

export async function createSimpleChatbot(
  tx: Prisma.TransactionClient,
  userId: string,
  organization: OrganizationModel,
  chatbotData: ChatbotUncheckedCreateInput,
): Promise<ChatbotModel> {
  const newChatbot = await tx.chatbot.create({
    data: {
      ...chatbotData,
      accountTimezone: "UTC",
      organizationId: organization.id,
    },
  })
  await tx.chatbotUsage.create({
    data: {
      chatbotId: newChatbot.id,
      maxContacts: organization.defaultMaxContacts,
    },
  })

  await tx.chatbotMember.create({
    data: {
      userId,
      chatbotId: newChatbot.id,
      role: ChatbotMemberRole.owner,
      permissions: {
        superAdmin: true,
        analytics: true,
        flows: true,
        contacts: true,
        onlyAssignedContacts: false,
        emailAndPhone: true,
        broadcast: true,
        ecommerce: false,
      },
      notificationTypes: {
        email: true,
        sms: true,
        push: true,
      },
      notificationChannels: {
        email: true,
        sms: true,
        push: true,
      },
    },
  })

  return newChatbot
}
