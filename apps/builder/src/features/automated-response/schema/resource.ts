import type { AutomatedResponseModel } from "@chatbotx.io/database/types"
import type { FlowResource } from "@/features/flows/schema/resource"

export type AutomatedResponseResource = AutomatedResponseModel & {
  flow?: FlowResource
}
