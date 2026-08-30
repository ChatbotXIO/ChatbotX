import {
  createSelectSchema,
  integrationFacebookAdsModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const integrationFacebookAdsResource = createSelectSchema(
  integrationFacebookAdsModel,
  {
    id: z.string(),
    workspaceId: z.string(),
    integrationId: z.string(),
  },
).pick({
  id: true,
  workspaceId: true,
  integrationId: true,
  tokenExpiresAt: true,
  status: true,
})
export type IntegrationFacebookAdsResource = z.infer<
  typeof integrationFacebookAdsResource
>
