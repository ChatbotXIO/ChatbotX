"use server"

import { credentialService } from "@chatbotx.io/business"
import {
  type InstagramCredential,
  type InstagramCredentialUpdate,
  instagramCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"

import { orgAdminActionClient } from "@/lib/safe-action"

export const updateInstagramSettingAction = orgAdminActionClient
  .inputSchema(instagramCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: InstagramCredentialUpdate
    }) => {
      const existing = await credentialService.findDecryptedForUser({
        userId: ctx.user.id,
        type: "instagram",
      })

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error("App Secret is required to configure Instagram.")
      }

      const config: InstagramCredential = {
        clientId: parsedInput.clientId,
        version: parsedInput.version,
        verifyToken: parsedInput.verifyToken,
        clientSecret,
      }

      await credentialService.upsertForUser({
        userId: ctx.user.id,
        type: "instagram",
        config,
      })
    },
  )
