"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type GoogleCredential,
  type GoogleCredentialUpdate,
  googleCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"
import { getTranslations } from "next-intl/server"

import { isCloud } from "@/env"
import { authActionClient } from "@/lib/safe-action"

export const updateGoogleSettingsAction = authActionClient
  .inputSchema(googleCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: GoogleCredentialUpdate
    }) => {
      const scopedUserId = isCloud() ? ctx.user.id : undefined
      const existing = await platformCredentialService.findDecrypted({
        userId: scopedUserId,
        type: "google",
      })

      const t = await getTranslations()

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error(t("platformSettings.errors.googleClientSecretRequired"))
      }

      const verifyToken =
        parsedInput.verifyToken || existing?.config.verifyToken
      if (!verifyToken) {
        throw new Error(t("platformSettings.errors.googleVerifyTokenRequired"))
      }

      const config: GoogleCredential = {
        clientId: parsedInput.clientId,
        clientSecret,
        verifyToken,
      }

      await platformCredentialService.upsert({
        userId: scopedUserId,
        type: "google",
        config,
      })
    },
  )
