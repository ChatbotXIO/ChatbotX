"use server"

import { shopifyIntegrationService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { syncShopifyRequest } from "../schema/public"

/** The same sync `shopify.sync` queues. */
export const syncShopifyAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(syncShopifyRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await shopifyIntegrationService.requestSync({
        workspaceId,
        scope: parsedInput.scope,
      }),
  )
