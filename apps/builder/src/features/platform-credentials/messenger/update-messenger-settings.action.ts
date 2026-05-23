"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type MessengerCredential,
  type MessengerCredentialUpdate,
  messengerCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"
import { getTranslations } from "next-intl/server"
import { isCloud } from "@/env"
import { authActionClient } from "@/lib/safe-action"

export const updateMessengerSettingAction = authActionClient
  .inputSchema(messengerCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: MessengerCredentialUpdate
    }) => {
      const scopedUserId = isCloud() ? ctx.user.id : undefined
      const existing = await platformCredentialService.findDecrypted({
        userId: scopedUserId,
        type: "messenger",
      })

      const t = await getTranslations()

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error(t("platformSettings.errors.messengerAppSecretRequired"))
      }

      const config: MessengerCredential = {
        clientId: parsedInput.clientId,
        version: parsedInput.version,
        verifyToken: parsedInput.verifyToken,
        clientSecret,
      }

      await platformCredentialService.upsert({
        userId: scopedUserId,
        type: "messenger",
        config,
      })
    },
  )
