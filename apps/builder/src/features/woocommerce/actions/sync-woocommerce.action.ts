"use server"

import { wooCommerceIntegrationService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { syncWooCommerceRequest } from "../schema/public"

/** The same sync `woocommerce.sync` queues. */
export const syncWooCommerceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(syncWooCommerceRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await wooCommerceIntegrationService.requestSync({
        workspaceId,
        scope: parsedInput.scope,
      }),
  )
