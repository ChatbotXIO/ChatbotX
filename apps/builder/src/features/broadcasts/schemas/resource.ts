import {
  broadcastModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import type { BroadcastModel, FlowModel } from "@chatbotx.io/database/types"

export type BroadcastResource = BroadcastModel & {
  flow?: FlowModel
  contactsCount?: number
}

export const publicBroadcastResource = createSelectSchema(broadcastModel).pick({
  id: true,
  name: true,
  status: true,
  schedulesType: true,
  schedulesAt: true,
  flowId: true,
})
