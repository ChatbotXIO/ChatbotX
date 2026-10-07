"use server"

import { createCredentialConnectAction } from "@/lib/integration-actions"
import { connectMoosendSchema } from "../schema"

export const connectMoosendAction = createCredentialConnectAction({
  name: "Moosend",
  provider: "moosend",
  schema: connectMoosendSchema,
})
