"use server"

import { integrationMailerLiteService } from "@chatbotx.io/business"
import { createDisconnectAction } from "@/lib/integration-actions"

export const disconnectMailerLiteAction = createDisconnectAction(
  integrationMailerLiteService,
  { name: "MailerLite" },
)
