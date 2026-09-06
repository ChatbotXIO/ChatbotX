import {
  automatedResponseModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import type { AutomatedResponseModel } from "@chatbotx.io/database/types"
import z from "zod"
import type { FlowResource } from "@/features/flows/schema/resource"

export type AutomatedResponseResource = AutomatedResponseModel & {
  flow?: FlowResource
}

// Explicit `.pick()` so a future column added to `AutomatedResponse` (e.g. a
// secret provider field) never silently enters the public contract.
export const publicKeywordResource = createSelectSchema(
  automatedResponseModel,
  {
    id: z.string(),
    flowId: z.string().nullable(),
  },
).pick({
  id: true,
  keywords: true,
  status: true,
  text: true,
  flowId: true,
  type: true,
  createdAt: true,
  updatedAt: true,
})
