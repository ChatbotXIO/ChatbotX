import type { InboxModel } from "@aha.chat/database/types"

export type InboxResource = InboxModel

export type InboxCollection = {
  data: InboxResource[]
}
