import { keywordConditionOperators } from "@chatbotx.io/database/partials"
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
    // Plain shape on output — input validation (regex compile, limits) lives
    // in `keywordConditionsSchema`.
    conditions: z
      .array(
        z.object({
          operator: keywordConditionOperators,
          values: z.array(z.string()),
        }),
      )
      .nullish()
      .describe(
        "Contact (inbound) match conditions; null on outbound rules. `keywords` lists every condition value.",
      ),
  },
).pick({
  id: true,
  keywords: true,
  conditions: true,
  status: true,
  text: true,
  flowId: true,
  type: true,
  createdAt: true,
  updatedAt: true,
})
