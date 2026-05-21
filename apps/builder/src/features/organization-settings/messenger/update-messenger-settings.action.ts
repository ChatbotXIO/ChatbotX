"use server"

import { credentialService } from "@chatbotx.io/business"
import {
  type MessengerCredential,
  type MessengerCredentialUpdate,
  messengerCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"
import { getTranslations } from "next-intl/server"
import { orgAdminActionClient } from "@/lib/safe-action"

export const updateMessengerSettingAction = orgAdminActionClient
  .inputSchema(messengerCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: MessengerCredentialUpdate
    }) => {
      const existing = await credentialService.findDecryptedForUser({
        userId: ctx.user.id,
        type: "messenger",
      })

      const t = await getTranslations()

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error(
          t("organizationSettings.errors.messengerAppSecretRequired"),
        )
      }

      const config: MessengerCredential = {
        clientId: parsedInput.clientId,
        version: parsedInput.version,
        verifyToken: parsedInput.verifyToken,
        clientSecret,
      }

      await credentialService.upsertForUser({
        userId: ctx.user.id,
        type: "messenger",
        config,
      })
    },
  )
