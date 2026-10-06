"use server"

import { createCredentialConnectAction } from "@/lib/integration-actions"
import { connectActiveCampaignSchema } from "../schema"

export const connectActiveCampaignAction = createCredentialConnectAction({
  name: "ActiveCampaign",
  provider: "activeCampaign",
  schema: connectActiveCampaignSchema,
})
