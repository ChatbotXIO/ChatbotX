"use server"

import { createCredentialConnectAction } from "@/lib/integration-actions"
import { connectMailchimpSchema } from "../schema"

export const connectMailchimpAction = createCredentialConnectAction({
  name: "Mailchimp",
  provider: "mailchimp",
  schema: connectMailchimpSchema,
})
