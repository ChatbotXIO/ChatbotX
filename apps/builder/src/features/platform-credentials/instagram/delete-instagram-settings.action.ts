"use server"

import { platformCredentialService } from "@chatbotx.io/business"

import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const deleteInstagramSettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .action(async ({ ctx, bindArgsParsedInputs: [scope] }) => {
    await platformCredentialService.remove({
      userId: resolveCredentialScopedUserId(ctx.user, scope),
      type: "instagram",
    })
  })
