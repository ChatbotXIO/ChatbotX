import { broadcastModel, createSelectSchema } from "@aha.chat/database/schema"
import type { BroadcastModel, FlowModel } from "@aha.chat/database/types"

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
