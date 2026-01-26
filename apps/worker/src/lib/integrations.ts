import { InboxType, prisma } from "@aha.chat/database"
import type { IntegrationType } from "@aha.chat/database/types"
import { integration as integrationGoogleSheets } from "@aha.chat/integration-google-sheets"
import {
  integration as integrationMessenger,
  type MessengerWebhookEvent,
} from "@aha.chat/integration-messenger"
import {
  integration as integrationWhatsapp,
  type WhatsappWebhookEvent,
} from "@aha.chat/integration-whatsapp"
import {
  integration as integrationZalo,
  type ZaloWebhookEvent,
} from "@aha.chat/integration-zalo"
import type { Integration, IntegrationDefinition } from "@aha.chat/sdk"

export const allIntegrations: Record<
  IntegrationType,
  // biome-ignore lint/suspicious/noExplicitAny: safe pass value
  Integration<IntegrationDefinition<any, any, any>> | undefined
> = {
  gemini: undefined,
  googleSheets: integrationGoogleSheets,
  messenger: integrationMessenger,
  openai: undefined,
  webchat: undefined,
  whatsapp: integrationWhatsapp,
  zalo: integrationZalo,
}

export const getDBIntegration = async (
  integrationType: string,
  // biome-ignore lint/suspicious/noExplicitAny: safe pass value
  payload: any,
) => {
  switch (integrationType) {
    case InboxType.whatsapp:
      return await prisma.integrationWhatsapp.findFirstOrThrow({
        where: {
          phoneNumberId: (payload as WhatsappWebhookEvent).phoneID,
        },
        include: {
          chatbot: true,
        },
      })
    case InboxType.messenger:
      return await prisma.integrationMessenger.findFirstOrThrow({
        where: {
          pageId: (payload as MessengerWebhookEvent).entry[0].id,
        },
        include: {
          chatbot: true,
        },
      })
    case InboxType.zalo: {
      const input = payload as ZaloWebhookEvent

      return await prisma.integrationZalo.findFirstOrThrow({
        where: {
          oaId: input.event_name.includes("user_send")
            ? input.recipient.id
            : input.sender.id,
        },
        include: {
          chatbot: true,
        },
      })
    }
    default:
      throw new Error(`Unsupported integration: ${integrationType}`)
  }
}
