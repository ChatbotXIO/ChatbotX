import {
  broadcastModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import type {
  BroadcastModel,
  FlowModel,
  IntegrationMessengerModel,
  IntegrationWhatsappModel,
} from "@chatbotx.io/database/types"

export const broadcastResource = createSelectSchema(broadcastModel)
export type BroadcastResource = BroadcastModel

export type BroadcastResourceWithRelations = BroadcastResource & {
  flow?: Pick<FlowModel, "id" | "name"> | null
  integrationWhatsapp?: Pick<IntegrationWhatsappModel, "id" | "name"> | null
  integrationMessenger?: Pick<IntegrationMessengerModel, "id" | "name"> | null
  contactsCount?: number
}

export const publicBroadcastResource = createSelectSchema(broadcastModel).pick({
  id: true,
  name: true,
  status: true,
  schedulesType: true,
  schedulesAt: true,
  flowId: true,
  contactCount: true,
})
