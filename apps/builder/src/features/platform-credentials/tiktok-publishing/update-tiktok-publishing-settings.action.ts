"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type TiktokPublishingCredential,
  tiktokPublishingCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import { authActionClient } from "@/lib/safe-action"
import { credentialScopeSchema, resolveCredentialScopedUserId } from "../scope"

/** Saves the TikTok app used to publish posts (Login Kit + Content Posting API), apart from the inbox app. */
export const updateTiktokPublishingSettingsAction = authActionClient
  .bindArgsSchemas([credentialScopeSchema])
  .inputSchema(tiktokPublishingCredentialUpdateSchema)
  .action(async ({ parsedInput, bindArgsParsedInputs: [scope], ctx }) => {
    const config: TiktokPublishingCredential = {
      clientId: parsedInput.clientId,
      clientSecret: parsedInput.clientSecret,
    }
    await platformCredentialService.upsert({
      config,
      type: "tiktokPublishing",
      userId: await resolveCredentialScopedUserId(ctx.user, scope),
    })
  })
