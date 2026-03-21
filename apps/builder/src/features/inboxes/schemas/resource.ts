import { createSelectSchema, inboxModel } from "@chatbotx.io/database/schema"
import type {
  InboxModel,
  IntegrationMessengerModel,
  IntegrationWebchatModel,
  IntegrationWhatsappModel,
  IntegrationZaloModel,
} from "@chatbotx.io/database/types"

export const inboxResource = createSelectSchema(inboxModel)

export type InboxResource = InboxModel & {
  integrationWhatsapp?: IntegrationWhatsappModel
  integrationWebchat?: IntegrationWebchatModel
  integrationMessenger?: IntegrationMessengerModel
  integrationZalo?: IntegrationZaloModel
}
