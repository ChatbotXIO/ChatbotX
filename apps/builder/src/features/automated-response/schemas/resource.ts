import type { AutomatedResponseModel } from "@chatbotx.io/database/types"
import type { FlowResource } from "@/features/flows/schemas/resource"

export type AutomatedResponseResource = AutomatedResponseModel & {
  flow?: FlowResource
}
