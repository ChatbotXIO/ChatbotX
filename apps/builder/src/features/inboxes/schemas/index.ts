import type { InboxModel } from "@ahachat.ai/database/types"

export type InboxResource = InboxModel

export type InboxCollection = {
  data: InboxResource[]
}
