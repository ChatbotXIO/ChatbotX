"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type ThreadsCredential,
  threadsCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

export const updateThreadsSettingAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(threadsCredentialUpdateSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [scope], ctx }) => {
    const scopedUserId = resolveCredentialScopedUserId(ctx.user, scope)
    const config: ThreadsCredential = {
      clientId: parsedInput.clientId,
      version: parsedInput.version,
      verifyToken: parsedInput.verifyToken,
      clientSecret: parsedInput.clientSecret,
    }

    await platformCredentialService.upsert({
      userId: scopedUserId,
      type: "threads",
      config,
    })
  })
