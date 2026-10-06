"use server"

import { createCredentialConnectAction } from "@/lib/integration-actions"
import { connectDripSchema } from "../schema"

export const connectDripAction = createCredentialConnectAction({
  name: "Drip",
  provider: "drip",
  schema: connectDripSchema,
})
