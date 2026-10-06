"use server"

import { createCredentialConnectAction } from "@/lib/integration-actions"
import { connectKlaviyoSchema } from "../schema"

export const connectKlaviyoAction = createCredentialConnectAction({
  name: "Klaviyo",
  provider: "klaviyo",
  schema: connectKlaviyoSchema,
})
