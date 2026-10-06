"use server"

import { createCredentialConnectAction } from "@/lib/integration-actions"
import { connectMailerLiteSchema } from "../schema"

export const connectMailerLiteAction = createCredentialConnectAction({
  name: "MailerLite",
  provider: "mailerLite",
  schema: connectMailerLiteSchema,
})
