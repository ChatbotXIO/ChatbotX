"use server"

import { platformCredentialService } from "@chatbotx.io/business"

import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const cloneFromMessengerAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .action(async ({ ctx, bindArgsParsedInputs: [scope] }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)
    const messenger = await platformCredentialService.findDecrypted({
      userId: scopedUserId,
      type: "messenger",
    })

    if (!messenger) {
      throw new Error("Messenger credentials not configured.")
    }

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "instagramFacebook",
      config: messenger.config,
    })
  })
