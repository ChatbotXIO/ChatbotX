"use server"

import { integrationKlaviyoService } from "@chatbotx.io/business"
import { createDisconnectAction } from "@/lib/integration-actions"

export const disconnectKlaviyoAction = createDisconnectAction(
  integrationKlaviyoService,
  { name: "Klaviyo" },
)
