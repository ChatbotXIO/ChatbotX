"use server"

import { ecommerceSettingsService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateEcommerceSettingsPublicRequest } from "../schema/public"

/** The same partial-by-group update `ecommerceSettings.update` makes. */
export const updateEcommerceSettingsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateEcommerceSettingsPublicRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await ecommerceSettingsService.update({ workspaceId, patch: parsedInput })
  })
