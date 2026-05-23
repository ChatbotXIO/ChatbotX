"use server"

import { platformCredentialService } from "@chatbotx.io/business"
import {
  type WhatsappCredential,
  type WhatsappCredentialUpdate,
  whatsappCredentialUpdateSchema,
} from "@chatbotx.io/database/partials"
import type { UserModel } from "@chatbotx.io/database/types"
import { getTranslations } from "next-intl/server"

import { isCloud } from "@/env"
import { authActionClient } from "@/lib/safe-action"

export const updateWhatsappSettingsAction = authActionClient
  .inputSchema(whatsappCredentialUpdateSchema)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { user: UserModel }
      parsedInput: WhatsappCredentialUpdate
    }) => {
      const scopedUserId = isCloud() ? ctx.user.id : undefined
      const existing = await platformCredentialService.findDecrypted({
        userId: scopedUserId,
        type: "whatsapp",
      })

      const t = await getTranslations()

      const clientSecret =
        parsedInput.clientSecret || existing?.config.clientSecret
      if (!clientSecret) {
        throw new Error(t("platformSettings.errors.whatsappAppSecretRequired"))
      }

      const systemUserToken =
        parsedInput.systemUserToken || existing?.config.systemUserToken
      if (!systemUserToken) {
        throw new Error(
          t("platformSettings.errors.whatsappSystemUserTokenRequired"),
        )
      }

      const config: WhatsappCredential = {
        clientId: parsedInput.clientId,
        version: parsedInput.version,
        configId: parsedInput.configId,
        systemUserId: parsedInput.systemUserId,
        businessId: parsedInput.businessId,
        businessName: parsedInput.businessName,
        verifyToken: parsedInput.verifyToken,
        clientSecret,
        systemUserToken,
      }

      await platformCredentialService.upsert({
        userId: scopedUserId,
        type: "whatsapp",
        config,
      })
    },
  )
