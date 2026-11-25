"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const deleteTiktokPublishingSettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .action(async ({ ctx, bindArgsParsedInputs: [scope] }) => {
    await platformCredentialService.remove({
      type: "tiktokPublishing",
      userId: await resolveCredentialScopedUserId(ctx.user, scope, {
        allowWithoutEntitlement: true,
      }),
    })
  })
