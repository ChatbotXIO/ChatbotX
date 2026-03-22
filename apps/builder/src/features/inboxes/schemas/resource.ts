import { createSelectSchema, inboxModel } from "@aha.chat/database/schema"
import type {
  InboxModel,
  IntegrationMessengerModel,
  IntegrationWebchatModel,
  IntegrationWhatsappModel,
  IntegrationZaloModel,
} from "@aha.chat/database/types"

export const inboxResource = createSelectSchema(inboxModel)

export type InboxResource = InboxModel & {
  integrationWhatsapp?: IntegrationWhatsappModel
  integrationWebchat?: IntegrationWebchatModel
  integrationMessenger?: IntegrationMessengerModel
  integrationZalo?: IntegrationZaloModel
}
