"use server"

import { integrationGetResponseService } from "@chatbotx.io/business"
import { createDisconnectAction } from "@/lib/integration-actions"

export const disconnectGetResponseAction = createDisconnectAction(
  integrationGetResponseService,
  { name: "GetResponse" },
)
