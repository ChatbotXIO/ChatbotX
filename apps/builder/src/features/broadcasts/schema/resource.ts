import {
  broadcastModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import type {
  BroadcastModel,
  BroadcastTargetModel,
  FlowModel,
  InboxModel,
  IntegrationMessengerModel,
  IntegrationWhatsappModel,
} from "@chatbotx.io/database/types"

export const broadcastResource = createSelectSchema(broadcastModel)
export type BroadcastResource = BroadcastModel

/** One page a broadcast sends from, with the page name for display. */
export type BroadcastTargetResource = Pick<
  BroadcastTargetModel,
  "inboxId" | "flowId" | "templateId" | "templateData"
> & {
  inbox: Pick<InboxModel, "id" | "name">
  flow?: Pick<FlowModel, "id" | "name"> | null
}

export type BroadcastResourceWithRelations = BroadcastResource & {
  flow?: Pick<FlowModel, "id" | "name"> | null
  integrationWhatsapp?: Pick<IntegrationWhatsappModel, "id" | "name"> | null
  integrationMessenger?: Pick<IntegrationMessengerModel, "id" | "name"> | null
  targets?: BroadcastTargetResource[]
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
