"use server"

import { integrationMoosendService } from "@chatbotx.io/business"
import { createDisconnectAction } from "@/lib/integration-actions"

export const disconnectMoosendAction = createDisconnectAction(
  integrationMoosendService,
  { name: "Moosend" },
)
