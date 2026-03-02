import { db } from "@aha.chat/database/client"
import type { IntegrationType } from "@aha.chat/database/types"
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
  integrationType: IntegrationType,
  integrationIdentifier: string,
) => {
  switch (integrationType) {
    case "whatsapp": {
      const integrationWhatsapp =
        await db.query.integrationWhatsappModel.findFirst({
          where: {
            phoneNumberId: integrationIdentifier,
          },
          with: {
            chatbot: true,
            inbox: true,
          },
        })

      if (!integrationWhatsapp) {
        throw new Error("Whatsapp integration not found")
      }

      return integrationWhatsapp
    }
    case "messenger": {
      const integrationMessenger =
        await db.query.integrationMessengerModel.findFirst({
          where: {
            pageId: integrationIdentifier,
          },
          with: {
            chatbot: true,
            inbox: true,
          },
        })
      if (!integrationMessenger) {
        throw new Error("Messenger integration not found")
      }
      return integrationMessenger
    }
    case "zalo": {
      const integrationZalo = await db.query.integrationZaloModel.findFirst({
        where: {
          oaId: integrationIdentifier,
        },
        with: {
          chatbot: true,
          inbox: true,
        },
      })
      if (!integrationZalo) {
        throw new Error("Zalo integration not found")
      }
      return integrationZalo
    }
    default:
      throw new Error(`Unsupported integration: ${integrationType}`)
  }
}
