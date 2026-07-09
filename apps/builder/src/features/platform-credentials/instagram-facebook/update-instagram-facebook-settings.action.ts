"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type InstagramFacebookCredential,
  instagramFacebookCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"

import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const updateInstagramFacebookSettingAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(instagramFacebookCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)
    const existing = await platformCredentialService.findDecrypted({
      userId: scopedUserId,
      type: "instagramFacebook",
    })

    const clientSecret =
      parsedInput.clientSecret || existing?.config.clientSecret
    if (!clientSecret) {
      throw new Error(
        "App Secret is required to configure Instagram via Facebook.",
      )
    }

    const config: InstagramFacebookCredential = {
      clientId: parsedInput.clientId,
      version: parsedInput.version,
      verifyToken: parsedInput.verifyToken,
      clientSecret,
    }

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "instagramFacebook",
      config,
    })
  })
