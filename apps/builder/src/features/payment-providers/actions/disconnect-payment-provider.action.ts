"use server"

import { paymentProviderService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { disconnectPaymentProviderRequest } from "../schema/public"

/**
 * The same disconnect `paymentProviders.disconnect` makes. Still allowed once
 * the trial expired: a read/delete-only workspace can always disconnect.
 */
export const disconnectPaymentProviderAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(disconnectPaymentProviderRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await assertWorkspaceSuperAdmin(workspaceId)
    await paymentProviderService.disconnect({
      workspaceId,
      provider: parsedInput.provider,
    })
  })
