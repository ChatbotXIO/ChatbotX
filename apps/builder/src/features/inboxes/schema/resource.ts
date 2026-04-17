import { createSelectSchema, inboxModel } from "@chatbotx.io/database/schema"
import type {
  InboxModel,
  IntegrationInstagramModel,
  IntegrationMessengerModel,
  IntegrationTelegramModel,
  IntegrationWebchatModel,
  IntegrationWhatsappModel,
  IntegrationZaloModel,
} from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"

export const inboxResource = createSelectSchema(inboxModel, {
  id: zodBigintAsString(),
  workspaceId: zodBigintAsString(),
})

export type InboxResource = InboxModel & {
  integrationWhatsapp?: IntegrationWhatsappModel
  integrationWebchat?: IntegrationWebchatModel
  integrationMessenger?: IntegrationMessengerModel
  integrationInstagram?: IntegrationInstagramModel
  integrationZalo?: IntegrationZaloModel
  integrationTelegram?: IntegrationTelegramModel
}
