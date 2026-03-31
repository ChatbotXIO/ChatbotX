import type { AutomatedResponseModel } from "@aha.chat/database/types"
import type { FlowResource } from "@/features/flows/schemas/resource"

export type AutomatedResponseResource = AutomatedResponseModel & {
  flow?: FlowResource
}
