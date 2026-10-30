"use server"

import { paymentProviderService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectStripeKeyRequest } from "../schema/public"

/** The same connect `paymentProviders.connectStripeKey` makes. */
export const connectStripeKeyAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectStripeKeyRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await assertWorkspaceSuperAdmin(workspaceId)
    const connection = await paymentProviderService.connectStripeKey({
      workspaceId,
      secretKey: parsedInput.secretKey,
    })
    return {
      chargesEnabled: connection.chargesEnabled,
      livemode: connection.livemode,
    }
  })
