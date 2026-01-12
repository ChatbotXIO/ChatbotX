import type { FlowModel, FlowVersionModel } from "@aha.chat/database/types"

export type FlowVersionResource = FlowVersionModel

export type FlowResource = FlowModel & {
  _count?: {
    contacts?: number
  }
  flowVersions?: FlowVersionResource[]
}
