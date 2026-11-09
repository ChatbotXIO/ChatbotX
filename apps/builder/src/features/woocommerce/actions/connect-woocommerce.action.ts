"use server"

import { wooCommerceIntegrationService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectWooCommerceRequest } from "../schema/public"

/** The same connect `woocommerce.connect` makes. */
export const connectWooCommerceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectWooCommerceRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await wooCommerceIntegrationService.connect({
        ...parsedInput,
        workspaceId,
      }),
  )
