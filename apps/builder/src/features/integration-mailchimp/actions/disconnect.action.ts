"use server"

import { integrationMailchimpService } from "@chatbotx.io/business"
import { createDisconnectAction } from "@/lib/integration-actions"

export const disconnectMailchimpAction = createDisconnectAction(
  integrationMailchimpService,
  { name: "Mailchimp" },
)
