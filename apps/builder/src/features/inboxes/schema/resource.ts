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

export const inboxResource = createSelectSchema(inboxModel)

export type InboxResource = InboxModel & {
  integrationWhatsapp?: IntegrationWhatsappModel
  integrationWebchat?: IntegrationWebchatModel
  integrationMessenger?: IntegrationMessengerModel
  integrationInstagram?: IntegrationInstagramModel
  integrationZalo?: IntegrationZaloModel
  integrationTelegram?: IntegrationTelegramModel
}
