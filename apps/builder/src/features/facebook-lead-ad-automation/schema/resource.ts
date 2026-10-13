import { facebookLeadFieldMappingsSchema } from "@chatbotx.io/database/partials"
import {
  createSelectSchema,
  facebookLeadAdsAutomationModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const facebookLeadAdsAutomationResource = createSelectSchema(
  facebookLeadAdsAutomationModel,
  {
    id: z.string(),
    workspaceId: z.string(),
    fieldMapping: facebookLeadFieldMappingsSchema,
  },
)
export type FacebookLeadAdsAutomationResource = z.infer<
  typeof facebookLeadAdsAutomationResource
>
