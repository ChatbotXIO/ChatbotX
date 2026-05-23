"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type InstagramCredential,
  type InstagramCredentialUpdate,
  instagramCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"

import { isCloud } from "@/env"
import { authActionClient } from "@/lib/safe-action"

export const updateInstagramSettingAction = authActionClient
  .inputSchema(instagramCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: InstagramCredentialUpdate
    }) => {
      const scopedUserId = isCloud() ? ctx.user.id : undefined
      const existing = await platformCredentialService.findDecrypted({
        userId: scopedUserId,
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

      await platformCredentialService.upsert({
        userId: scopedUserId,
        type: "instagram",
        config,
      })
    },
  )
