import type {
  InboxModel,
  IntegrationMessengerModel,
  IntegrationWebchatModel,
  IntegrationWhatsappModel,
  IntegrationZaloModel,
} from "@aha.chat/database/types"

export type InboxResource = InboxModel & {
  integrationWhatsapp?: IntegrationWhatsappModel
  integrationWebchat?: IntegrationWebchatModel
  integrationMessenger?: IntegrationMessengerModel
  integrationZalo?: IntegrationZaloModel
}

export type InboxCollection = {
  data: InboxResource[]
  pageCount: number
}
