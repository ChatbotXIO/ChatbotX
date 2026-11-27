"use server"

import { paymentProviderService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import { connectPaypalRequest } from "../schema/public"

/** The same connect `paymentProviders.connectPaypal` makes. */
export const connectPaypalAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(connectPaypalRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await assertWorkspaceSuperAdmin(workspaceId)
    await paymentProviderService.connectPaypal({
      workspaceId,
      clientId: parsedInput.clientId,
      clientSecret: parsedInput.clientSecret,
    })
  })
