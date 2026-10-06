"use server"

import { createCredentialConnectAction } from "@/lib/integration-actions"
import { connectGetResponseSchema } from "../schema"

export const connectGetResponseAction = createCredentialConnectAction({
  name: "GetResponse",
  provider: "getResponse",
  schema: connectGetResponseSchema,
})
