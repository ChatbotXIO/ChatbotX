import { InboxType, prisma } from "@aha.chat/database"
import { integration as integrationChatbotx } from "@aha.chat/integration-chatbotx"
import { integration as integrationGoogleSheets } from "@aha.chat/integration-google-sheets"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"
import { integration as integrationZalo } from "@aha.chat/integration-zalo"
import type { Integration, IntegrationDefinition } from "@aha.chat/sdk"

export const allIntegrations: Record<
  string,
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
  chatbotx: integrationChatbotx,
}

export const getDBIntegration = async (
  integrationType: string,
  integrationIdentifier: string,
) => {
  switch (integrationType) {
    case InboxType.whatsapp:
      return await prisma.integrationWhatsapp.findFirstOrThrow({
        where: {
          phoneNumberId: integrationIdentifier,
        },
        include: {
          chatbot: true,
        },
      })
    case InboxType.messenger:
      return await prisma.integrationMessenger.findFirstOrThrow({
        where: {
          pageId: integrationIdentifier,
        },
        include: {
          chatbot: true,
        },
      })
    case InboxType.zalo: {
      return await prisma.integrationZalo.findFirstOrThrow({
        where: {
          oaId: integrationIdentifier,
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
