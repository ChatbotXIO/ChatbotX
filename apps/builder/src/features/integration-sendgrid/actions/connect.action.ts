"use server"

import { createCredentialConnectAction } from "@/lib/integration-actions"
import { connectSendGridSchema } from "../schema"

export const connectSendGridAction = createCredentialConnectAction({
  name: "SendGrid",
  provider: "sendGrid",
  schema: connectSendGridSchema,
})
