"use server"

import { wooCommerceIntegrationService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

/** The same disconnect `woocommerce.disconnect` makes; allowed after a trial ends. */
export const disconnectWooCommerceAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId] }) => {
    await wooCommerceIntegrationService.disconnect(workspaceId)
  })
