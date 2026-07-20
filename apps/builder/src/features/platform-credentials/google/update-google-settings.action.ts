"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type GoogleCredential,
  googleCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"

import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const updateGoogleSettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(googleCredentialUpdateSchema)
  .action(async ({ ctx, bindArgsParsedInputs: [scope], parsedInput }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)
    const config: GoogleCredential = {
      clientId: parsedInput.clientId,
      clientSecret: parsedInput.clientSecret,
      verifyToken: parsedInput.verifyToken,
    }

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "google",
      config,
    })
  })
