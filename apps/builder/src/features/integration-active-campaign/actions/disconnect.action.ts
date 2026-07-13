"use server"

import { integrationActiveCampaignService } from "@chatbotx.io/business"
import { createDisconnectAction } from "@/lib/integration-actions"

export const disconnectActiveCampaignAction = createDisconnectAction(
  integrationActiveCampaignService,
  { name: "ActiveCampaign" },
)
