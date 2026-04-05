import { db } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/schema"
import { integration as integrationChatbotx } from "@chatbotx.io/integration-chatbotx"
import { integration as integrationGoogleSheets } from "@chatbotx.io/integration-google-sheets"
import { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import { integration as integrationWhatsapp } from "@chatbotx.io/integration-whatsapp"
import { integration as integrationZalo } from "@chatbotx.io/integration-zalo"
import type { Integration, IntegrationDefinition } from "@chatbotx.io/sdk"

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
            workspace: true,
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
            workspace: true,
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
          workspace: true,
          inbox: true,
        },
      })
      if (!integrationZalo) {
        throw new Error("Zalo OA integration not found")
      }
      return integrationZalo
    }
    default:
      throw new Error(`Unsupported integration: ${integrationType}`)
  }
}
