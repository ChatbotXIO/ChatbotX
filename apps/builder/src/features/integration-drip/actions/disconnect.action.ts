"use server"

import { integrationDripService } from "@chatbotx.io/business"
import { createDisconnectAction } from "@/lib/integration-actions"

export const disconnectDripAction = createDisconnectAction(
  integrationDripService,
  { name: "Drip" },
)
