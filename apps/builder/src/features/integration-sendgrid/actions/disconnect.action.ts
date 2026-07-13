"use server"

import { integrationSendGridService } from "@chatbotx.io/business"
import { createDisconnectAction } from "@/lib/integration-actions"

export const disconnectSendGridAction = createDisconnectAction(
  integrationSendGridService,
  { name: "SendGrid" },
)
